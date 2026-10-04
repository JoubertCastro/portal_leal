import 'server-only';
import { normalizeDocument, validDocument } from '../../domain/document';
import { agreementsSchema, debtsSchema, identityKey, normalizeWhatsapp, registrationsSchema } from './sic-schema';
import { IntegrationError } from './http';
import { compatibleNames } from '../../domain/name-match';

export interface SicTransport { get(path: string): Promise<unknown> }
export interface RecordScope { document: string; identityKey: string; internalIds: number[]; acceptedNames?: { internalId: number; name: string }[] }
export type RegistrationCheck =
  | { kind: 'not_found' | 'no_contacts' | 'review_required' }
  | { kind: 'ready'; document: string; identityKey: string; acceptedNames: { internalId: number; name: string }[]; contacts: { phone: string; internalIds: number[] }[] };
export interface CustomerDebt { id: string; creditor: string; product: string; contractEnding: string; sourceStatus: string; dueDate: string; balanceCents: number }
export interface CustomerAgreement { id: string; creditor: string; product: string; contractEnding: string; agreedAt: string; totalInstallments: number; installments: { number: number; dueDate: string; amountCents: number; paidAt: string | null }[] }

function assertDocument(value: string): string {
  if (!validDocument(value)) throw new IntegrationError('configuration');
  return normalizeDocument(value);
}
function assertScope(scope: RecordScope) {
  assertDocument(scope.document);
  if (!scope.identityKey || !scope.internalIds.length || scope.internalIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new IntegrationError('unauthorized');
}
function sameDocument(rows: { CPF_CNPJ: string }[], document: string) {
  if (rows.some(row => row.CPF_CNPJ !== document)) throw new IntegrationError('invalid_response');
}
function authorizedName(scope: RecordScope, internalId: number, name: string): boolean {
  return scope.acceptedNames ? scope.acceptedNames.some(item => item.internalId === internalId && item.name === identityKey(name)) : identityKey(name) === scope.identityKey;
}

export class SicGateway {
  constructor(private transport: SicTransport, private server = 'SRVW-MIS-01') {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(server)) throw new IntegrationError('configuration');
  }
  async registration(documentInput: string, legalName?: string): Promise<RegistrationCheck> {
    const document = assertDocument(documentInput);
    const result = registrationsSchema.safeParse(await this.transport.get(`/${this.server}/cadastro_portal/${document}`));
    if (!result.success) throw new IntegrationError('invalid_response');
    sameDocument(result.data, document);
    if (!result.data.length) return { kind: 'not_found' };
    const names = new Set(result.data.map(row => identityKey(row.Nome)));
    if (document.length === 14) {
      // Corporate name is entered by the customer, never disclosed as a hint.
      if (!legalName || legalName.length > 250 || names.size !== 1 || !identityKey(legalName) || identityKey(legalName) !== [...names][0]) return { kind: 'review_required' };
    } else if (!compatibleNames([...names])) return { kind: 'review_required' };
    const contacts = new Map<string, Set<number>>();
    for (const row of result.data) {
      const phone = normalizeWhatsapp(row.telefone);
      if (!phone) continue;
      const ids = contacts.get(phone) ?? new Set<number>(); ids.add(row.Codigo_Interno); contacts.set(phone, ids);
    }
    if (!contacts.size) return { kind: 'no_contacts' };
    if (contacts.size > 10) return { kind: 'review_required' };
    const acceptedNames = result.data.map(row => ({ internalId: row.Codigo_Interno, name: identityKey(row.Nome) }));
    return { kind: 'ready', document, identityKey: [...names][0], acceptedNames, contacts: [...contacts].map(([phone, ids]) => ({ phone, internalIds: [...ids].sort((a, b) => a - b) })) };
  }
  async debts(scope: RecordScope): Promise<CustomerDebt[]> {
    assertScope(scope); const document = assertDocument(scope.document);
    const result = debtsSchema.safeParse(await this.transport.get(`/${this.server}/divida/${document}`));
    if (!result.success) throw new IntegrationError('invalid_response');
    sameDocument(result.data, document);
    const records = new Map<string, CustomerDebt>();
    const rawContracts = new Map<string, string>();
    for (const row of result.data) {
      if (!scope.internalIds.includes(row.Codigo_Interno)) continue;
      if (!authorizedName(scope, row.Codigo_Interno, row.nome)) throw new IntegrationError('invalid_response');
      const debt: CustomerDebt = { id: String(row.Codigo_Interno), creditor: row.Banco, product: row.Produto, contractEnding: row.cartao.slice(-4), sourceStatus: row.Descricao, dueDate: row.Vencimento, balanceCents: row.Saldo_Atual };
      const previous = records.get(debt.id);
      if (rawContracts.has(debt.id) && rawContracts.get(debt.id) !== row.cartao) throw new IntegrationError('invalid_response');
      if (previous && JSON.stringify(previous) !== JSON.stringify(debt)) throw new IntegrationError('invalid_response');
      records.set(debt.id, debt);
      rawContracts.set(debt.id, row.cartao);
    }
    // Zero remains zero, not a fabricated paid/settled status; status text is never inferred.
    return [...records.values()];
  }
  async agreements(scope: RecordScope): Promise<CustomerAgreement[]> {
    assertScope(scope); const document = assertDocument(scope.document);
    const response = await this.transport.get(`/${this.server}/acordos/${document}`);
    // SIC returns HTTP 200 with this exact sentinel when no agreement exists.
    // Other objects/errors remain invalid rather than hiding upstream failures.
    if (response && typeof response === 'object' && !Array.isArray(response) && Object.keys(response).length === 1 && 'error' in response && response.error === 'Acordos não encontrados') return [];
    const result = agreementsSchema.safeParse(response);
    if (!result.success) throw new IntegrationError('invalid_response');
    sameDocument(result.data, document);
    const records = new Map<string, CustomerAgreement>();
    const rawContracts = new Map<string, string>();
    for (const row of result.data) {
      if (!scope.internalIds.includes(row.Codigo_Interno)) continue;
      if (!authorizedName(scope, row.Codigo_Interno, row.nome)) throw new IntegrationError('invalid_response');
      const id = `${row.Codigo_Interno}:${row.codigo_do_acordo}`;
      const agreement: CustomerAgreement = { id, creditor: row.Banco, product: row.Produto, contractEnding: row.cartao.slice(-4), agreedAt: row.data_do_acordo, totalInstallments: row.parcelas, installments: [] };
      const previous = records.get(id);
      if (rawContracts.has(id) && rawContracts.get(id) !== row.cartao) throw new IntegrationError('invalid_response');
      if (previous && JSON.stringify({ ...previous, installments: [] }) !== JSON.stringify(agreement)) throw new IntegrationError('invalid_response');
      const current = previous ?? agreement;
      const installment = { number: row.parcela, dueDate: row.vencimento, amountCents: row.valor_da_parcela, paidAt: row.pagamento };
      const duplicate = current.installments.find(item => item.number === installment.number);
      if (duplicate && JSON.stringify(duplicate) !== JSON.stringify(installment)) throw new IntegrationError('invalid_response');
      if (!duplicate) current.installments.push(installment);
      records.set(id, current);
      rawContracts.set(id, row.cartao);
    }
    return [...records.values()].map(row => ({ ...row, installments: row.installments.sort((a, b) => a.number - b.number) }));
  }
}
