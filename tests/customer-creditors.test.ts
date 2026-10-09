import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerCreditorService, creditorRequest } from '../src/server/customer-creditors';
import { AccessError } from '../src/server/customer-access';
import { Arc4Client, ARC4_TOKEN_URL } from '../src/server/integrations/creditors/arc4';
import type { CustomerDebt } from '../src/server/integrations/sic';
const document = '52998224725';
const scope = { document, identityKey: 'TEST', internalIds: [1] };
const debt: CustomerDebt = { id: '1', creditor: 'ARC4U', contractNumber: 'CN-01', contractEnding: 'N-01', product: 'Teste', sourceStatus: 'TEST', dueDate: '2026-01-01', balanceCents: 100 };

test('creditor service derives document/contract from verified scope, never the browser', async () => {
  let calls = 0;
  const client = new Arc4Client({ clientId: 'test', clientSecret: 'test' }, async url => {
    calls++; const path = String(url);
    const body = path === ARC4_TOKEN_URL ? { access_token: 'test', token_type: 'Bearer', expires_in: 3600 }
      : path.includes('/balance?') ? { document, totalContracts: 0, customerBalance: { products: [] } }
      : { pageNumber: 1, totalItems: 0, items: [] };
    if (path !== ARC4_TOKEN_URL) assert.ok(path.includes(`/customers/${document}/`));
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  });
  const service = new CustomerCreditorService({ integrationScope: async () => scope }, { debts: async received => { assert.deepEqual(received, scope); return [debt]; } }, () => client);
  assert.equal((await service.execute('session', 'browser', { action: 'overview', debtId: '1' })).kind, 'json');
  assert.equal(calls, 3);
  assert.equal(creditorRequest.safeParse({ action: 'overview', debtId: '1', document: 'other' }).success, false);
  assert.equal(creditorRequest.safeParse({ action: 'simulate', debtId: '1', contract: 'OTHER', policyCode: 'A', firstPaymentDate: '2026-01-01', installmentsCount: 1 }).success, false);
});

test('invalid session, unowned debt and another creditor cannot initialize a provider', async () => {
  const provider = () => { assert.fail('provider must not initialize'); };
  const expired = new CustomerCreditorService({ integrationScope: async () => { throw new AccessError('unauthenticated'); } }, { debts: async () => { assert.fail('SIC must not be called'); } }, provider);
  await assert.rejects(expired.execute('bad', 'browser', { action: 'overview', debtId: '1' }), /unauthenticated/);
  for (const row of [{ ...debt, creditor: 'BTG' }, { ...debt, id: '2' }]) {
    const service = new CustomerCreditorService({ integrationScope: async () => scope }, { debts: async () => [row] }, provider);
    await assert.rejects(service.execute('s', 'b', { action: 'overview', debtId: row.id }), /invalid_request/);
  }
});
