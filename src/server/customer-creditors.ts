import 'server-only';
import { z } from 'zod';
import { AccessError, type CustomerAccessService } from './customer-access';
import type { SicGateway } from './integrations/sic';
import { arc4Bindings, Arc4Error, type Arc4Client } from './integrations/creditors/arc4';
import { IntegrationError } from './integrations/http';
import { AgreementService, AgreementError } from './agreement-service';
import type { MetaBoletoSender } from './integrations/meta-boleto';

type QueryStage = 'session' | 'sic_debts' | 'binding' | 'configuration' | 'arc4_auth' | 'arc4_balances' | 'arc4_agreements' | 'arc4_policies' | 'arc4_simulation' | 'arc4_details' | 'arc4_boleto';
export class CreditorQueryError extends Error {
  constructor(public readonly stage: QueryStage, public readonly code: IntegrationError['code'], public readonly diagnostic?: IntegrationError['diagnostic']) { super(`Creditor query failed: ${stage}/${code}`); }
}
async function step<T>(stage: QueryStage, operation: () => Promise<T> | T): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof AccessError || error instanceof Arc4Error || error instanceof AgreementError) throw error;
    throw new CreditorQueryError(stage, error instanceof IntegrationError ? error.code : 'unavailable', error instanceof IntegrationError ? error.diagnostic : undefined);
  }
}

const debtId = z.string().regex(/^\d{1,16}$/);
export const creditorRequest = z.discriminatedUnion('action', [
  z.object({ action: z.literal('overview'), debtId }).strict(),
  z.object({ action: z.literal('simulate'), debtId, policyCode: z.string().min(1).max(150), firstPaymentDate: z.string().max(64), installmentsCount: z.number().int().min(1).max(999) }).strict(),
  z.object({ action: z.literal('details'), debtId, agreementId: z.uuid() }).strict(),
  z.object({ action: z.literal('first-payment'), debtId, agreementId: z.uuid() }).strict(),
  z.object({ action: z.literal('installment-payment'), debtId, agreementId: z.uuid(), index: z.number().int().min(0).max(999) }).strict(),
  z.object({ action: z.literal('confirm'), debtId, quoteId: z.uuid(), optionIndex: z.number().int().min(0).max(99), accepted: z.literal(true), noticeVersion: z.string().max(40) }).strict(),
  z.object({ action: z.literal('operation'), debtId }).strict(),
  z.object({ action: z.literal('send-boleto'), debtId, agreementId: z.uuid(), index: z.number().int().min(0).max(999).optional() }).strict(),
]);
export type CreditorRequest = z.infer<typeof creditorRequest>;

export class CustomerCreditorService {
  constructor(private access: Pick<CustomerAccessService, 'integrationScope'>, private sic: Pick<SicGateway, 'debts'> & Partial<Pick<SicGateway, 'customerName'>>, private provider: () => Arc4Client,
    private agreements?: AgreementService, private messaging?: { sender: () => MetaBoletoSender; phone: (session: string, browser: string) => Promise<string | null> }) {}
  async execute(session: string, browser: string, input: CreditorRequest) {
    // Session, browser binding, expiry/revocation and shared quotas apply on EVERY action.
    const scope = await step('session', () => this.access.integrationScope(session, browser));
    const debts = await step('sic_debts', () => this.sic.debts(scope));
    const bindings = await step('binding', () => arc4Bindings(debts));
    const binding = bindings.find(item => item.sicInternalId === input.debtId);
    if (!binding || !scope.internalIds.some(id => String(id) === input.debtId)) throw new AccessError('invalid_request');
    const contracts = [...new Set(bindings.map(item => item.providerContract))];
    const actor = { document: scope.document, contract: binding.providerContract, session };
    if (input.action === 'operation') return { kind: 'json' as const, data: { operation: await this.agreements?.store.active(actor) ?? null } };
    const client = await step('configuration', () => this.provider()); // Non-ARC4 and unowned records never initialize OAuth.
    await step('arc4_auth', () => client.authenticate());
    if (input.action === 'confirm') {
      if (!this.agreements) throw new AgreementError('configuration');
      return { kind: 'json' as const, data: { operation: await this.agreements.confirm(actor, contracts, client, input) } };
    }
    if (input.action === 'overview') {
      const [balances, agreements] = await Promise.all([step('arc4_balances', () => client.balances(scope.document, [binding.providerContract])), step('arc4_agreements', () => client.agreements(scope.document, contracts))]);
      const policies = balances.length ? await step('arc4_policies', () => client.policies(scope.document, contracts, binding.providerContract)) : [];
      return { kind: 'json' as const, data: { balances, agreements: agreements.filter(item => item.contracts.includes(binding.providerContract)), policies, formalizationAvailable: this.agreements?.available ?? false, operation: await this.agreements?.store.active(actor) ?? null } };
    }
    if (input.action === 'simulate') {
      const data = await step('arc4_simulation', () => client.simulate(scope.document, contracts, { contract: binding.providerContract, policyCode: input.policyCode, firstPaymentDate: input.firstPaymentDate, installmentsCount: input.installmentsCount }));
      const debt = debts.find(item => item.id === input.debtId)!;
      const quote = this.agreements?.available ? await this.agreements.prepare(actor, { selection: { contract: binding.providerContract, policyCode: input.policyCode, firstPaymentDate: input.firstPaymentDate, installmentsCount: input.installmentsCount }, options: data.options, debtId: input.debtId, creditor: debt.creditor, product: debt.product }) : null;
      return { kind: 'json' as const, data: { ...data, ...quote, creditor: debt.creditor, product: debt.product } };
    }
    const owned = await step('arc4_agreements', () => client.agreements(scope.document, contracts));
    if (!owned.some(item => item.id === input.agreementId && item.contracts.includes(binding.providerContract))) throw new AccessError('invalid_request');
    if (input.action === 'details') {
      const detail = await step('arc4_details', () => client.agreementDetail(scope.document, contracts, input.agreementId));
      return { kind: 'json' as const, data: { id: detail.idAgreement, status: detail.status, statusCode: detail.statusCode, installments: detail.installments } };
    }
    if (input.action === 'send-boleto') {
      if (!this.agreements || !this.messaging || !this.sic.customerName) throw new AgreementError('configuration');
      const phone = await this.messaging.phone(session, browser);
      if (!phone) throw new AccessError('unauthenticated');
      const sender = this.messaging.sender();
      const detail = await client.agreementDetail(scope.document, contracts, input.agreementId);
      const installment = input.index === undefined ? [...detail.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.index - b.index)[0] : detail.installments.find(i => i.index === input.index);
      if (!installment) throw new AccessError('invalid_request');
      const boleto = input.index === undefined ? await client.firstPayment(scope.document, contracts, input.agreementId) : await client.installmentPayment(scope.document, contracts, input.agreementId, input.index);
      const name = await this.sic.customerName(scope);
      if (!name) throw new AccessError('unavailable');
      const key = this.agreements.store.deliveryKey(scope.document, input.agreementId, String(installment.index));
      if (!(await this.agreements.store.claimDelivery(key))) return { kind: 'json' as const, data: { delivery: await this.agreements.store.deliveryState(key) } };
      try {
        const sent = await sender.send(phone, boleto.pdf, { name, amount: installment.installmentValueWithDiscount, dueDate: 'dueDate' in boleto && typeof boleto.dueDate === 'string' ? boleto.dueDate : installment.dueDate });
        await this.agreements.store.finishDelivery(key, sent.messageId);
        return { kind: 'json' as const, data: { delivery: 'accepted' } };
      } catch {
        await this.agreements.store.finishDelivery(key).catch(() => {});
        return { kind: 'json' as const, data: { delivery: 'unknown' } };
      }
    }
    const boleto = await step('arc4_boleto', () => input.action === 'first-payment'
      ? client.firstPayment(scope.document, contracts, input.agreementId)
      : client.installmentPayment(scope.document, contracts, input.agreementId, input.index));
    return { kind: 'pdf' as const, pdf: boleto.pdf };
  }
}
