import 'server-only';
import { z } from 'zod';
import { AccessError, type CustomerAccessService } from './customer-access';
import type { SicGateway } from './integrations/sic';
import { arc4Bindings, type Arc4Client } from './integrations/creditors/arc4';

const debtId = z.string().regex(/^\d{1,16}$/);
export const creditorRequest = z.discriminatedUnion('action', [
  z.object({ action: z.literal('overview'), debtId }).strict(),
  z.object({ action: z.literal('simulate'), debtId, policyCode: z.string().min(1).max(150), firstPaymentDate: z.string().max(64), installmentsCount: z.number().int().min(1).max(999) }).strict(),
  z.object({ action: z.literal('details'), debtId, agreementId: z.uuid() }).strict(),
  z.object({ action: z.literal('first-payment'), debtId, agreementId: z.uuid() }).strict(),
  z.object({ action: z.literal('installment-payment'), debtId, agreementId: z.uuid(), index: z.number().int().min(0).max(999) }).strict(),
]);
export type CreditorRequest = z.infer<typeof creditorRequest>;

export class CustomerCreditorService {
  constructor(private access: Pick<CustomerAccessService, 'integrationScope'>, private sic: Pick<SicGateway, 'debts'>, private provider: () => Arc4Client) {}
  async execute(session: string, browser: string, input: CreditorRequest) {
    // Session, browser binding, expiry/revocation and shared quotas apply on EVERY action.
    const scope = await this.access.integrationScope(session, browser);
    const bindings = arc4Bindings(await this.sic.debts(scope));
    const binding = bindings.find(item => item.sicInternalId === input.debtId);
    if (!binding || !scope.internalIds.some(id => String(id) === input.debtId)) throw new AccessError('invalid_request');
    const contracts = [...new Set(bindings.map(item => item.providerContract))];
    const client = this.provider(); // Non-ARC4 and unowned records never initialize OAuth.
    if (input.action === 'overview') {
      const [balances, agreements] = await Promise.all([client.balances(scope.document, [binding.providerContract]), client.agreements(scope.document, contracts)]);
      const policies = balances.length ? await client.policies(scope.document, contracts, binding.providerContract) : [];
      return { kind: 'json' as const, data: { balances, agreements: agreements.filter(item => item.contracts.includes(binding.providerContract)), policies } };
    }
    if (input.action === 'simulate') {
      const data = await client.simulate(scope.document, contracts, { contract: binding.providerContract, policyCode: input.policyCode, firstPaymentDate: input.firstPaymentDate, installmentsCount: input.installmentsCount });
      return { kind: 'json' as const, data };
    }
    const owned = await client.agreements(scope.document, contracts);
    if (!owned.some(item => item.id === input.agreementId && item.contracts.includes(binding.providerContract))) throw new AccessError('invalid_request');
    if (input.action === 'details') {
      const detail = await client.agreementDetail(scope.document, contracts, input.agreementId);
      return { kind: 'json' as const, data: { id: detail.idAgreement, status: detail.status, statusCode: detail.statusCode, installments: detail.installments } };
    }
    const boleto = input.action === 'first-payment'
      ? await client.firstPayment(scope.document, contracts, input.agreementId)
      : await client.installmentPayment(scope.document, contracts, input.agreementId, input.index);
    return { kind: 'pdf' as const, pdf: boleto.pdf };
  }
}
