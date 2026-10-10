import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { AgreementStore } from '../src/server/agreement-store';
import { AgreementService, sameTerms } from '../src/server/agreement-service';
import { Arc4Client } from '../src/server/integrations/creditors/arc4';
import { AGREEMENT_NOTICE_VERSION, type AgreementQuote } from '../src/domain/agreement';
import { MetaBoletoSender } from '../src/server/integrations/meta-boleto';

const actor = { document: '52998224725', contract: 'CN-TEST', session: 'synthetic-session' };
const option = { installmentsCount: 1, totalValueWithDiscount: 100, totalDiscountValue: 20, monthlyInterestRate: 0, annualInterestRate: 0, cetRate: 0, installments: [{ index: 1, dueDate: '2026-10-20', installmentValueWithDiscount: 100 }] };
const quote: AgreementQuote = { selection: { contract: actor.contract, policyCode: 'TEST', firstPaymentDate: '2026-10-20', installmentsCount: 1 }, options: [option], creditor: 'ARC4U', product: 'Teste', debtId: '1' };
const agreementId = '550e8400-e29b-41d4-a716-446655440000';
const offerId = '550e8400-e29b-41d4-a716-446655440001';

test('durable consent, isolation, duplicate protection, changed terms and ambiguous results', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(await readFile('migrations/004_creditor_agreements.sql', 'utf8'));
    const query = async (text: string, values?: unknown[]) => { const r = await pg.query(text, values); return { ...r, rowCount: r.rows.length || r.affectedRows || 0 }; };
    const db = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
    const store = new AgreementStore(db, 'a'.repeat(64), 'b'.repeat(64));
    const service = new AgreementService(store, 'Leal'); let mutations = 0;
    const client = { simulate: async () => ({ contract: actor.contract, options: [option] }), persistOffer: async () => ({ offerId, options: [option], firstPaymentMethodId: 1, installmentsPaymentMethodId: 1 }), createAgreement: async () => { mutations++; return { agreementId }; } } as unknown as Arc4Client;
    const prepared = await service.prepare(actor, quote);
    const input = { quoteId: prepared.quoteId, debtId: '1', optionIndex: 0, accepted: true as const, noticeVersion: AGREEMENT_NOTICE_VERSION };
    await assert.rejects(service.confirm({ ...actor, session: 'other' }, [actor.contract], client, input), /invalid_request/);
    await assert.rejects(service.confirm(actor, [actor.contract], client, { ...input, noticeVersion: 'old' }), /invalid_request/);
    assert.equal((await service.confirm(actor, [actor.contract], client, input)).state, 'created');
    assert.equal((await service.confirm(actor, [actor.contract], client, input)).agreementId, agreementId);
    const second = await service.prepare({ ...actor, session: 'new-login' }, quote);
    assert.equal((await service.confirm({ ...actor, session: 'new-login' }, [actor.contract], client, { ...input, quoteId: second.quoteId })).agreementId, agreementId);
    assert.equal(mutations, 1);
    const rows = await pg.query<{ payload: string; result_payload: string; accepted_at: string; notice_version: string }>('SELECT * FROM leal_creditor.quotes WHERE id=$1', [prepared.quoteId]);
    assert.ok(rows.rows[0].accepted_at); assert.equal(rows.rows[0].notice_version, AGREEMENT_NOTICE_VERSION);
    assert.ok(!rows.rows[0].payload.includes(actor.contract)); assert.ok(!rows.rows[0].result_payload.includes(agreementId));
    const changedActor = { ...actor, contract: 'CN-CHANGED' }; const changedQuote = { ...quote, selection: { ...quote.selection, contract: changedActor.contract } };
    const changed = await service.prepare(changedActor, changedQuote);
    const changedClient = { ...client, simulate: async () => ({ options: [{ ...option, totalValueWithDiscount: 101 }] }) } as unknown as Arc4Client;
    await assert.rejects(service.confirm(changedActor, [changedActor.contract], changedClient, { ...input, quoteId: changed.quoteId }), /changed/);
    assert.equal((await store.get(changedActor, changed.quoteId)).state, 'changed'); assert.equal(mutations, 1);
    const unknownActor = { ...actor, contract: 'CN-UNKNOWN' }; const unknown = await service.prepare(unknownActor, { ...quote, selection: { ...quote.selection, contract: unknownActor.contract } });
    const failing = { ...client, createAgreement: async () => { mutations++; throw new Error('upstream sensitive text'); } } as unknown as Arc4Client;
    await assert.rejects(service.confirm(unknownActor, [unknownActor.contract], failing, { ...input, quoteId: unknown.quoteId }), /Agreement error: unknown/);
    assert.equal((await service.confirm(unknownActor, [unknownActor.contract], failing, { ...input, quoteId: unknown.quoteId })).state, 'unknown'); assert.equal(mutations, 2);
    const expiredActor = { ...actor, contract: 'CN-EXPIRED' }; const expired = await service.prepare(expiredActor, { ...quote, selection: { ...quote.selection, contract: expiredActor.contract } });
    await pg.query("UPDATE leal_creditor.quotes SET expires_at=now()-interval '1 minute' WHERE id=$1", [expired.quoteId]);
    await assert.rejects(service.confirm(expiredActor, [expiredActor.contract], client, { ...input, quoteId: expired.quoteId }), /expired/);
    const key = store.deliveryKey(actor.document, agreementId, '1'); assert.equal(await store.claimDelivery(key), true); assert.equal(await store.claimDelivery(key), false);
    await store.finishDelivery(key, 'synthetic-message'); assert.equal(await store.deliveryState(key), 'accepted');
  } finally { await pg.close(); }
});

test('financial comparison rejects changed schedule, total and rates', () => {
  assert.equal(sameTerms(option, { ...option, installments: [{ ...option.installments[0], dueDate: '2026-10-20T00:00:00' }] }), true);
  for (const other of [{ ...option, totalValueWithDiscount: 101 }, { ...option, monthlyInterestRate: 1 }, { ...option, installments: [{ ...option.installments[0], dueDate: '2026-10-21' }] }]) assert.equal(sameTerms(option, other), false);
});

test('Meta sends a private PDF media ID and the three template variables in order, without retry', async () => {
  let calls = 0;
  const sender = new MetaBoletoSender({ version: 'v23.0', phoneNumberId: '123', accessToken: 'synthetic', template: 'enviar_boleto', language: 'pt_BR' }, async (url, init) => {
    calls++; assert.equal(init?.redirect, 'error');
    if (String(url).endsWith('/media')) { assert.ok(init?.body instanceof FormData); return new Response(JSON.stringify({ id: '123456' }), { headers: { 'Content-Type': 'application/json' } }); }
    const b = JSON.parse(String(init?.body)); assert.equal(b.template.name, 'enviar_boleto');
    assert.deepEqual(b.template.components[0].parameters, [{ type: 'document', document: { id: '123456', filename: 'boleto-leal.pdf' } }]);
    assert.deepEqual(b.template.components[1].parameters.map((p: { text: string }) => p.text), ['Cliente Teste', (100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), '20/10/2026']);
    assert.equal(b.to, '5561999999999'); return new Response(JSON.stringify({ messages: [{ id: 'synthetic-id' }] }), { headers: { 'Content-Type': 'application/json' } });
  });
  await sender.send('+5561999999999', Buffer.from('%PDF-1.7\nfixture'), { name: 'Cliente Teste', amount: 100, dueDate: '2026-10-20' }); assert.equal(calls, 2);
});
