import test from 'node:test';
import assert from 'node:assert/strict';
import { Arc4Client, arc4Bindings, ARC4_TOKEN_URL, ARC4_BASE_URL } from '../src/server/integrations/creditors/arc4';
import { CreditorRegistry, type CreditorBinding } from '../src/server/integrations/creditors/registry';
import type { CustomerDebt, RecordScope } from '../src/server/integrations/sic';

const credentials = { clientId: 'test', clientSecret: 'test-secret' };
const document = '52998224725'; // Synthetic fixture, never sent to a real provider.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const token = () => json({ access_token: 'test-token', token_type: 'Bearer', expires_in: 3600 });
const product = (contract: string) => ({ contract, name: 'Produto', balance: { curveValue: 123.45678 } });
const payload = (contracts: string[], totalContracts = contracts.length) => ({ document, customerBalance: { products: contracts.map(product) }, totalContracts });

test('ARC4 OAuth uses form/basic, shares concurrent login and renews before expiry', async () => {
  let calls = 0; let now = 0;
  const client = new Arc4Client(credentials, async (url, init) => {
    calls++; assert.equal(url, ARC4_TOKEN_URL);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Basic dGVzdDp0ZXN0LXNlY3JldA==');
    assert.equal(init?.body, 'grant_type=client_credentials');
    assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store');
    return token();
  }, () => now);
  await Promise.all([client.authenticate(), client.authenticate(), client.authenticate()]);
  assert.equal(calls, 1); now = 3_570_001;
  await client.authenticate(); assert.equal(calls, 2);
});

test('ARC4 trims pasted credential boundaries without mutating configuration', async () => {
  const pasted = { clientId: ' test\r\n', clientSecret: '\ufefftest-secret\u00a0' };
  const original = { ...pasted };
  const client = new Arc4Client(pasted, async (_url, init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Basic dGVzdDp0ZXN0LXNlY3JldA==');
    return token();
  });
  await client.authenticate();
  assert.deepEqual(pasted, original);
});

test('ARC4 rejects empty credentials and internal whitespace or control characters', () => {
  for (const clientSecret of [' \u00a0', 'test secret', 'test\nsecret', 'test\u00a0secret', 'test\u0000secret']) {
    assert.throws(() => new Arc4Client({ ...credentials, clientSecret }), /configuration/);
  }
  assert.throws(() => new Arc4Client({ ...credentials, clientId: 'te st' }), /configuration/);
});

test('ARC4 paginates, filters contracts and preserves upstream decimal precision', async () => {
  let pages = 0;
  const client = new Arc4Client(credentials, async url => {
    if (url === ARC4_TOKEN_URL) return token();
    const parsed = new URL(String(url));
    assert.equal(parsed.origin + parsed.pathname, `${ARC4_BASE_URL}/customers/${document}/balance`);
    pages++; assert.equal(parsed.searchParams.get('pageNumber'), String(pages));
    return json(payload(pages === 1 ? ['OTHER'] : ['ARC-1'], 2));
  });
  assert.deepEqual(await client.balances(document, ['ARC-1']), [{ contract: 'ARC-1', product: 'Produto', currentValue: 123.45678 }]);
  assert.equal(pages, 2);
});

test('ARC4 rejects another document, repeated pages and truncated pages', async () => {
  for (const body of [{ ...payload(['ARC-1']), document: '11144477735' }, payload(['ARC-1'], 2), payload([], 1)]) {
    const client = new Arc4Client(credentials, async url => url === ARC4_TOKEN_URL ? token() : json(body));
    await assert.rejects(client.balances(document, ['ARC-1']), /invalid_response/);
  }
});

test('ARC4 retries only one unauthorized read; 429 and outages are not retried', async () => {
  let reads = 0; let logins = 0;
  const client = new Arc4Client(credentials, async url => {
    if (url === ARC4_TOKEN_URL) { logins++; return token(); }
    reads++; return json({}, 401);
  });
  await assert.rejects(client.balances(document, ['ARC-1']), /unauthorized/);
  assert.equal(reads, 2); assert.equal(logins, 2);
  for (const status of [429, 503]) {
    let count = 0;
    const limited = new Arc4Client(credentials, async url => {
      if (url === ARC4_TOKEN_URL) return token();
      count++; return json({}, status);
    });
    await assert.rejects(limited.balances(document, ['ARC-1']), status === 429 ? /rate_limited/ : /unavailable/);
    assert.equal(count, 1);
  }
});

test('ARC4 rejects path injection before OAuth and sanitizes transport failures', async () => {
  let calls = 0;
  const client = new Arc4Client(credentials, async () => { calls++; throw new Error('sensitive body'); });
  await assert.rejects(client.balances('../customers', ['ARC-1']), /configuration/);
  await assert.rejects(client.balances(document, ['../OTHER']), /configuration/);
  assert.equal(calls, 0);
  await assert.rejects(client.authenticate(), error => error instanceof Error && error.message === 'Integration error: unavailable');
});

const scope: RecordScope = { document, identityKey: 'TEST', internalIds: [1, 2] };
const debt: CustomerDebt = { id: '1', creditor: 'Credor confirmado', product: 'Produto', contractNumber: '00001', contractEnding: '0001', sourceStatus: 'TEST', dueDate: '2026-01-01', balanceCents: 100 };
const binding: CreditorBinding = { sicInternalId: '1', sicCreditor: debt.creditor, sicContract: '00001', providerKey: 'arc', providerContract: 'ARC-1' };

test('registry routes only the exact approved debt; unsupported creditors make zero calls', async () => {
  let calls = 0;
  const registry = new CreditorRegistry([{ key: 'arc', sicCreditors: [debt.creditor], async balances(doc, contracts) {
    calls++; assert.equal(doc, document); assert.deepEqual(contracts, ['ARC-1']); return [];
  } }], [binding]);
  assert.equal(await registry.balances(scope, [{ ...debt, id: '2', creditor: 'BTG' }], '2'), null);
  assert.equal(calls, 0);
  await registry.balances(scope, [debt], '1'); assert.equal(calls, 1);
  await assert.rejects(registry.balances({ ...scope, internalIds: [2] }, [debt], '1'), /unauthorized/);
  await assert.rejects(registry.balances(scope, [{ ...debt, contractNumber: '00002' }], '1'), /unauthorized/);
  await assert.rejects(registry.balances(scope, [{ ...debt, creditor: 'Outro' }], '1'), /unauthorized/);
  assert.equal(calls, 1);
});

test('registry fails closed on ambiguous bindings and unregistered providers', () => {
  const provider = { key: 'arc', sicCreditors: [debt.creditor], async balances() { return []; } };
  assert.throws(() => new CreditorRegistry([provider], [binding, binding]), /configuration/);
  assert.throws(() => new CreditorRegistry([], [binding]), /configuration/);
  assert.throws(() => new CreditorRegistry([provider, provider], []), /configuration/);
});

test('ARC4 accepts only the confirmed ARC4U creditor, even with an explicit binding', () => {
  const client = new Arc4Client(credentials, async () => { throw new Error('No network expected'); });
  const arcBinding = { ...binding, providerKey: client.key, sicCreditor: 'ARC4U' };
  assert.doesNotThrow(() => new CreditorRegistry([client], [arcBinding]));
  for (const sicCreditor of ['BTG', 'Banco BTG', 'ARC4', 'CARREFOUR', 'ARC4U OUTRO']) {
    assert.throws(() => new CreditorRegistry([client], [{ ...arcBinding, sicCreditor }]), /configuration/);
  }
});

test('ARC4 bindings preserve the full alphanumeric SIC contract and exclude other creditors', () => {
  const bindings = arc4Bindings([{ ...debt, creditor: 'ARC4U', contractNumber: 'CN-000123-A' }, { ...debt, id: '2', creditor: 'BTG' }]);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].providerContract, 'CN-000123-A');
  assert.throws(() => arc4Bindings([{ ...debt, creditor: 'ARC4U', contractNumber: '../123' }]), /invalid_response/);
});

test('ARC4 agreements require every original contract to be authorized and reject mismatched documents', async () => {
  const agreement = { idAgreement: '550e8400-e29b-41d4-a716-446655440000', document, contracts: ['ARC-1'], status: 'ACTIVE', installmentsAmount: 3, totalValueWithDiscount: 123.456 };
  const clientFor = (items: unknown[]) => new Arc4Client(credentials, async url => url === ARC4_TOKEN_URL ? token() : json({ pageNumber: 1, totalItems: items.length, items }));
  assert.equal((await clientFor([agreement]).agreements(document, ['ARC-1'])).length, 1);
  assert.deepEqual(await clientFor([{ ...agreement, contracts: ['ARC-1', 'OTHER'] }]).agreements(document, ['ARC-1']), []);
  await assert.rejects(clientFor([{ ...agreement, document: '11144477735' }]).agreements(document, ['ARC-1']), /invalid_response/);
  await assert.rejects(clientFor([agreement, agreement]).agreements(document, ['ARC-1']), /invalid_response/);
});
