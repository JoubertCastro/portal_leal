import 'server-only';
import { z } from 'zod';
import { validDocument } from '../../../domain/document';
import { IntegrationError, requestJson, type Fetcher } from '../http';
import type { CreditorBalance, CreditorBinding, CreditorProvider } from './registry';
import type { CustomerDebt } from '../sic';
import { policiesSchema, simulationSchema, installmentSchema, firstPaymentSchema, installmentPaymentSchema, decodeBoleto } from './arc4-schemas';

export const ARC4_TOKEN_URL = 'https://btg-agreement.auth.sa-east-1.amazoncognito.com/oauth2/token';
export const ARC4_BASE_URL = 'https://agreements-api.btgpactual.com/v2/negotiation';
export const ARC4_INTEGRATION_KEY = 'btg_agreements_v2';
const tokenSchema = z.object({ access_token: z.string().min(1).max(16384), token_type: z.string().regex(/^bearer$/i), expires_in: z.number().int().min(60).max(86400) });
const productSchema = z.object({
  contract: z.string().trim().min(1).max(150),
  name: z.string().trim().min(1).max(250),
  balance: z.object({ curveValue: z.number().finite().nonnegative().max(1e12) }),
});
const balanceSchema = z.object({
  document: z.string().trim(),
  customerBalance: z.object({ products: z.array(productSchema).max(500) }),
  totalContracts: z.number().int().nonnegative().max(10000),
});
const agreementSchema = z.object({
  idAgreement: z.uuid(), document: z.string().trim(),
  contracts: z.array(z.string().trim().min(1).max(150)).min(1).max(100),
  status: z.string().min(1).max(100),
  installmentsAmount: z.number().int().min(1).max(999),
  totalValueWithDiscount: z.number().finite().nonnegative().max(1e12),
});
const agreementsPageSchema = z.object({
  pageNumber: z.number().int().min(1), totalItems: z.number().int().nonnegative().max(10000),
  items: z.array(agreementSchema).max(100),
});
const detailSchema = agreementSchema.extend({
  statusCode: z.string().min(1).max(100),
  installments: z.array(installmentSchema).min(1).max(999),
});
export interface Arc4Agreement {
  id: string; contracts: string[]; status: string; installmentsCount: number; totalValue: number;
}

// Call only with SicGateway.debts for a verified scope, never with client-supplied rows.
// ARC4U + the complete cartao/contract equality were confirmed by the operator.
export function arc4Bindings(debts: readonly CustomerDebt[]): CreditorBinding[] {
  return debts.filter(debt => debt.creditor === 'ARC4U').map(debt => {
    if (!debt.contractNumber || !/^[A-Za-z0-9_-]{1,150}$/.test(debt.contractNumber)) throw new IntegrationError('invalid_response');
    return { sicInternalId: debt.id, sicCreditor: debt.creditor, sicContract: debt.contractNumber, providerKey: ARC4_INTEGRATION_KEY, providerContract: debt.contractNumber };
  });
}
function assertTarget(document: string, contracts: readonly string[]) {
  if (!/^\d{11}(?:\d{3})?$/.test(document) || !validDocument(document) || !contracts.length || contracts.length > 100 || contracts.some(contract => !/^[a-zA-Z0-9_-]{1,150}$/.test(contract))) throw new IntegrationError('configuration');
}

export class Arc4Error extends Error {
  constructor(public readonly code: 'not_found' | 'pending' | 'rate_limited' | 'invalid_selection' | 'payment_unavailable') { super(`ARC4 error: ${code}`); }
}

/** One instance per process: shared service token, no shared customer-data cache.
 * No arbitrary URLs, POST retries, or agreement mutations are exposed here.
 */
export class Arc4Client implements CreditorProvider {
  readonly key = ARC4_INTEGRATION_KEY;
  readonly sicCreditors = ['ARC4U'] as const;
  private cached?: { value: string; expiresAt: number };
  private pending?: Promise<string>;
  constructor(private credentials: { clientId: string; clientSecret: string }, private fetcher: Fetcher = fetch, private now = Date.now) {
    if (!/^[a-zA-Z0-9]{1,128}$/.test(credentials.clientId) || !credentials.clientSecret || credentials.clientSecret.length > 512) throw new IntegrationError('configuration');
  }
  async authenticate(): Promise<void> { await this.token(); }
  private async token(): Promise<string> {
    if (this.cached && this.cached.expiresAt > this.now()) return this.cached.value;
    if (this.pending) return this.pending;
    this.pending = this.login();
    try { return await this.pending; } finally { this.pending = undefined; }
  }
  private async login(): Promise<string> {
    const started = this.now();
    const result = await requestJson(this.fetcher, ARC4_TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${this.credentials.clientId}:${this.credentials.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (result.status === 401 || result.status === 403) throw new IntegrationError('unauthorized');
    if (result.status === 429) throw new Arc4Error('rate_limited');
    if (result.status !== 200) throw new IntegrationError('unavailable', { kind: 'http', status: result.status, reason: result.problem });
    const parsed = tokenSchema.safeParse(result.body);
    if (!parsed.success) throw new IntegrationError('invalid_response');
    this.cached = { value: parsed.data.access_token, expiresAt: started + (parsed.data.expires_in - 30) * 1000 };
    return this.cached.value;
  }
  private async read(url: URL): Promise<unknown> {
    if (!url.href.startsWith(`${ARC4_BASE_URL}/customers/`)) throw new IntegrationError('configuration');
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.token();
      const result = await requestJson(this.fetcher, url.href, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (result.status === 401) {
        if (this.cached?.value === token) this.cached = undefined;
        if (attempt === 0) continue;
      }
      if (result.status === 401 || result.status === 403) throw new IntegrationError('unauthorized');
      if (result.status === 404) throw new Arc4Error('not_found');
      if (result.status === 409) throw new Arc4Error('pending');
      if (result.status === 429) throw new Arc4Error('rate_limited');
      if (result.status !== 200) throw new IntegrationError('unavailable', { kind: 'http', status: result.status, reason: result.problem });
      return result.body;
    }
    throw new IntegrationError('unauthorized');
  }
  async balances(document: string, contracts: readonly string[]): Promise<CreditorBalance[]> {
    assertTarget(document, contracts);
    const allowed = new Set(contracts);
    const found = new Map<string, CreditorBalance>();
    const seen = new Set<string>();
    // Bound the whole operation to 10 pages. Never return silently truncated balances.
    let total: number | undefined;
    let received = 0;
    for (let page = 1; page <= 10; page++) {
      const url = new URL(`${ARC4_BASE_URL}/customers/${document}/balance`);
      url.searchParams.set('pageNumber', String(page));
      url.searchParams.set('pageSize', '100');
      const result = balanceSchema.safeParse(await this.read(url));
      if (!result.success || result.data.document !== document) throw new IntegrationError('invalid_response');
      if (total !== undefined && total !== result.data.totalContracts) throw new IntegrationError('invalid_response');
      total = result.data.totalContracts;
      const products = result.data.customerBalance.products;
      received += products.length;
      if (received > total || (!products.length && received < total)) throw new IntegrationError('invalid_response');
      for (const product of products) {
        if (seen.has(product.contract)) throw new IntegrationError('invalid_response');
        seen.add(product.contract);
        if (!allowed.has(product.contract)) continue;
        found.set(product.contract, { contract: product.contract, product: product.name, currentValue: product.balance.curveValue });
      }
      if (received === total) return [...found.values()];
    }
    throw new IntegrationError('invalid_response');
  }
  async agreements(document: string, contracts: readonly string[]): Promise<Arc4Agreement[]> {
    assertTarget(document, contracts);
    const allowed = new Set(contracts); const seen = new Set<string>();
    const agreements: Arc4Agreement[] = [];
    let total: number | undefined; let received = 0;
    for (let page = 1; page <= 10; page++) {
      const url = new URL(`${ARC4_BASE_URL}/customers/${document}/agreements`);
      url.searchParams.set('PageNumber', String(page)); url.searchParams.set('PageSize', '100');
      const result = agreementsPageSchema.safeParse(await this.read(url));
      if (!result.success || result.data.pageNumber !== page) throw new IntegrationError('invalid_response');
      if (total !== undefined && total !== result.data.totalItems) throw new IntegrationError('invalid_response');
      total = result.data.totalItems; received += result.data.items.length;
      if (received > total || (!result.data.items.length && received < total)) throw new IntegrationError('invalid_response');
      for (const agreement of result.data.items) {
        if (agreement.document !== document || seen.has(agreement.idAgreement)) throw new IntegrationError('invalid_response');
        seen.add(agreement.idAgreement);
        // Consolidated agreements require authorization for EVERY original contract.
        if (!agreement.contracts.every(contract => allowed.has(contract))) continue;
        agreements.push({ id: agreement.idAgreement, contracts: agreement.contracts, status: agreement.status, installmentsCount: agreement.installmentsAmount, totalValue: agreement.totalValueWithDiscount });
      }
      if (received === total) return agreements;
    }
    throw new IntegrationError('invalid_response');
  }
  async policies(document: string, authorizedContracts: readonly string[], contract: string) {
    assertTarget(document, authorizedContracts);
    if (!authorizedContracts.includes(contract)) throw new IntegrationError('unauthorized');
    const url = new URL(`${ARC4_BASE_URL}/customers/${document}/policies`);
    url.searchParams.append('contracts', contract);
    const result = policiesSchema.safeParse(await this.read(url));
    if (!result.success || new Set(result.data.map(policy => policy.code)).size !== result.data.length) throw new IntegrationError('invalid_response');
    return result.data;
  }
  async simulate(document: string, authorizedContracts: readonly string[], input: { contract: string; policyCode: string; firstPaymentDate: string; installmentsCount: number }) {
    assertTarget(document, authorizedContracts);
    if (!authorizedContracts.includes(input.contract)) throw new IntegrationError('unauthorized');
    if (!Number.isInteger(input.installmentsCount) || input.installmentsCount < 1 || input.installmentsCount > 999) throw new Arc4Error('invalid_selection');
    const balances = await this.balances(document, [input.contract]);
    if (balances.length !== 1) throw new Arc4Error('invalid_selection');
    const policies = await this.policies(document, authorizedContracts, input.contract);
    const policy = policies.find(item => item.code === input.policyCode);
    if (!policy || !policy.paymentDates.includes(input.firstPaymentDate) || !policy.installmentRanges.some(range => input.installmentsCount >= range.minInstallments && input.installmentsCount <= range.maxInstallments)) throw new Arc4Error('invalid_selection');
    // Explicit non-persistence and no exceptional discounts or validation bypasses.
    const result = await requestJson(this.fetcher, `${ARC4_BASE_URL}/customers/${document}/offers`, {
      method: 'POST', headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contracts: [input.contract], policyCode: policy.code, firstPaymentDate: input.firstPaymentDate,
        installmentsCount: input.installmentsCount, installmentEntry: input.installmentsCount === 1 ? 0 : policy.minimumEntryAmount,
        simulated: true, overlimitDiscountRequest: false, ignoreExistingForSimulation: false,
        ignoreInputValueValidationForSimulation: false, skipBillingValidation: false }),
    });
    // POST is never retried, including 401, timeouts and ambiguous failures.
    if (result.status === 401 || result.status === 403) throw new IntegrationError('unauthorized');
    if (result.status === 422) throw new Arc4Error('invalid_selection');
    if (result.status === 429) throw new Arc4Error('rate_limited');
    if (result.status !== 200) throw new IntegrationError('unavailable', { kind: 'http', status: result.status, reason: result.problem });
    const parsed = simulationSchema.safeParse(result.body);
    if (!parsed.success || parsed.data.document !== document || parsed.data.offer.contracts.length !== 1 || parsed.data.offer.contracts[0] !== input.contract) throw new IntegrationError('invalid_response');
    const options = parsed.data.offer.installmentOptions;
    if (options.some(option => option.installmentsCount !== input.installmentsCount || option.installments.length !== option.installmentsCount || new Set(option.installments.map(item => item.index)).size !== option.installments.length)) throw new IntegrationError('invalid_response');
    // No offer IDs, account numbers, commission structures or raw debts cross this DTO.
    return { contract: input.contract, options };
  }
  async agreementDetail(document: string, authorizedContracts: readonly string[], agreementId: string) {
    assertTarget(document, authorizedContracts);
    if (!z.uuid().safeParse(agreementId).success) throw new Arc4Error('invalid_selection');
    // A valid GUID is not proof of ownership. Resolve through the scoped list first.
    const owned = await this.agreements(document, authorizedContracts);
    if (!owned.some(agreement => agreement.id === agreementId)) throw new IntegrationError('unauthorized');
    const result = detailSchema.safeParse(await this.read(new URL(`${ARC4_BASE_URL}/customers/${document}/agreements/${agreementId}`)));
    if (!result.success || result.data.document !== document || result.data.idAgreement !== agreementId || !result.data.contracts.every(contract => authorizedContracts.includes(contract)) || new Set(result.data.installments.map(item => item.index)).size !== result.data.installments.length) throw new IntegrationError('invalid_response');
    return result.data;
  }
  async firstPayment(document: string, authorizedContracts: readonly string[], agreementId: string) {
    const detail = await this.agreementDetail(document, authorizedContracts, agreementId);
    if (detail.statusCode !== 'VALIDATED' || detail.installments.some(item => item.status === 'PAID')) throw new Arc4Error('payment_unavailable');
    const result = firstPaymentSchema.safeParse(await this.read(new URL(`${ARC4_BASE_URL}/customers/${document}/agreements/${agreementId}/first-payment`)));
    if (!result.success || result.data.idAgreement !== agreementId) throw new IntegrationError('invalid_response');
    return { pdf: decodeBoleto(result.data.buffer), barCode: result.data.barCode, digitableLine: result.data.digitableLine };
  }
  async installmentPayment(document: string, authorizedContracts: readonly string[], agreementId: string, index: number) {
    if (!Number.isInteger(index) || index < 0 || index > 999) throw new Arc4Error('invalid_selection');
    const detail = await this.agreementDetail(document, authorizedContracts, agreementId);
    const installment = detail.installments.find(item => item.index === index);
    // Subsequent boletos remain gated until adhesion has been accepted by the provider.
    if (!['ACTIVE', 'OVERDUE'].includes(detail.statusCode) || !installment || installment.status === 'PAID') throw new Arc4Error('payment_unavailable');
    const result = installmentPaymentSchema.safeParse(await this.read(new URL(`${ARC4_BASE_URL}/customers/${document}/agreements/${agreementId}/installment/${index}/bankslip`)));
    if (!result.success || result.data.agreementId !== agreementId || result.data.installment !== index) throw new IntegrationError('invalid_response');
    return { pdf: decodeBoleto(result.data.base64Representation), barCode: result.data.barCode, digitableLine: result.data.digitableLine, dueDate: result.data.dueDate };
  }
}
