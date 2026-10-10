import 'server-only';
import { AGREEMENT_NOTICE_VERSION, type AgreementOption, type AgreementQuote } from '../domain/agreement';
import { AccessError } from './customer-access';
import { type AgreementActor, type AgreementStore } from './agreement-store';
import type { Arc4Client } from './integrations/creditors/arc4';

export class AgreementError extends Error {
  constructor(public readonly code: 'configuration' | 'expired' | 'changed' | 'unknown' | 'busy') { super(`Agreement error: ${code}`); }
}
export function sameTerms(a: AgreementOption, b: AgreementOption) {
  // Compare the displayed monetary precision; preserve every date, rate, index and installment.
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const terms = (o: AgreementOption) => JSON.stringify({ count: o.installmentsCount, total: currency.format(o.totalValueWithDiscount), discount: currency.format(o.totalDiscountValue), monthly: o.monthlyInterestRate, annual: o.annualInterestRate, cet: o.cetRate,
    installments: o.installments.map(i => ({ index: i.index, date: i.dueDate.slice(0, 10), value: currency.format(i.installmentValueWithDiscount) })).sort((x, y) => x.index - y.index) });
  return terms(a) === terms(b);
}
export class AgreementService {
  constructor(readonly store: AgreementStore, private createdBy: string) {}
  get available() { return /^[A-Za-z0-9_.-]{1,128}$/.test(this.createdBy); }
  async prepare(actor: AgreementActor, quote: AgreementQuote) { return this.store.prepare(actor, quote); }
  async confirm(actor: AgreementActor, contracts: string[], client: Arc4Client, input: { quoteId: string; optionIndex: number; accepted: true; noticeVersion: string; debtId: string }) {
    if (!this.available) throw new AgreementError('configuration');
    if (input.accepted !== true || input.noticeVersion !== AGREEMENT_NOTICE_VERSION) throw new AccessError('invalid_request');
    const saved = await this.store.get(actor, input.quoteId);
    if (saved.quote.debtId !== input.debtId || saved.quote.selection.contract !== actor.contract) throw new AccessError('invalid_request');
    if (saved.state !== 'prepared') return saved.operation;
    if (saved.expiresAt <= Date.now()) throw new AgreementError('expired');
    const expected = saved.quote.options[input.optionIndex];
    if (!expected) throw new AccessError('invalid_request');
    if (!(await this.store.claim(actor, input.quoteId, input.optionIndex))) {
      const active = await this.store.active(actor);
      if (active) return active;
      throw new AgreementError('expired');
    }
    let mutationStarted = false;
    try {
      // Revalidate before any mutation, then compare the persisted offer again before formalizing.
      const fresh = await client.simulate(actor.document, contracts, saved.quote.selection);
      if (fresh.options.length !== 1 || !sameTerms(expected, fresh.options[0])) {
        await this.store.finish(input.quoteId, 'changed'); throw new AgreementError('changed');
      }
      mutationStarted = true;
      const offer = await client.persistOffer(actor.document, contracts, saved.quote.selection);
      await this.store.saveOffer(input.quoteId, offer.offerId);
      if (offer.options.length !== 1 || !sameTerms(expected, offer.options[0])) {
        await this.store.finish(input.quoteId, 'changed'); throw new AgreementError('changed');
      }
      const created = await client.createAgreement(actor.document, contracts, { offerId: offer.offerId, installmentsCount: expected.installmentsCount, firstPaymentMethodId: offer.firstPaymentMethodId, installmentsPaymentMethodId: offer.installmentsPaymentMethodId }, this.createdBy, input.quoteId);
      await this.store.finish(input.quoteId, 'created', created.agreementId);
      return { quoteId: input.quoteId, state: 'created' as const, agreementId: created.agreementId };
    } catch (error) {
      if (error instanceof AgreementError && error.code === 'changed') throw error;
      await this.store.finish(input.quoteId, mutationStarted ? 'unknown' : 'failed').catch(() => {});
      if (mutationStarted) throw new AgreementError('unknown');
      throw error;
    }
  }
}
