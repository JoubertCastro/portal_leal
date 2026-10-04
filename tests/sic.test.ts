import test from 'node:test';
import assert from 'node:assert/strict';
import { validDocument, formatDocument } from '../src/domain/document';
import { SicGateway, type RecordScope } from '../src/server/integrations/sic';
import { identityKey, normalizeWhatsapp } from '../src/server/integrations/sic-schema';
import { requestJson } from '../src/server/integrations/http';
import { LealAuthClient } from '../src/server/integrations/leal';
import { nameSimilarity, compatibleNames } from '../src/domain/name-match';

test('name threshold includes exactly 60%, rejects below and prevents transitive matching', () => {
  assert.equal(nameSimilarity('ABCDE', 'ABCXY'), 0.6);
  assert.equal(compatibleNames(['ABCDE', 'ABCXY']), true);
  assert.equal(compatibleNames(['ABCDE', 'ABXYZ']), false);
  assert.equal(compatibleNames(['ABCDE', 'ABCXY', 'AZCXY']), false);
  assert.equal(nameSimilarity('José da Silva', 'SILVA DA JOSE'), 1);
  assert.equal(compatibleNames(['', '']), false);
  assert.equal(compatibleNames(Array.from({ length: 33 }, (_, index) => `CLIENTE EXEMPLO ${index}`)), false);
});
test('PF tolerates similar names but does not widen the financial scope to unseen names', async () => {
  const rows = [registration, { ...registration, Codigo_Interno: 102, Nome: 'CLIENTE EXEMPLOS' }];
  const result = await gateway(rows).registration(document);
  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') return;
  const authorized = { ...scope, internalIds: [102], acceptedNames: result.acceptedNames };
  assert.equal((await gateway([{ ...debt, Codigo_Interno: 102, nome: 'CLIENTE EXEMPLOS' }]).debts(authorized)).length, 1);
  await assert.rejects(gateway([{ ...debt, Codigo_Interno: 102, nome: 'CLIENTE EXEMPLOZ' }]).debts(authorized), /invalid_response/);
});
test('PJ requires entered legal name and registered mobile contact', async () => {
  const sic = gateway([{ ...registration, CPF_CNPJ: '11222333000181', Nome: 'EMPRESA EXEMPLO LTDA' }]);
  assert.equal((await sic.registration('11222333000181')).kind, 'review_required');
  assert.equal((await sic.registration('11222333000181', 'OUTRA EMPRESA')).kind, 'review_required');
  assert.equal((await sic.registration('11222333000181', 'Empresa Exemplo Ltda.')).kind, 'ready');
  assert.equal((await gateway([{ ...registration, CPF_CNPJ: '11222333000181', Nome: 'EMPRESA EXEMPLO LTDA', telefone: '' }]).registration('11222333000181', 'Empresa Exemplo Ltda')).kind, 'no_contacts');
});

// Synthetic fixtures, never copied from customer records.
const document = '52998224725';
const registration = { Codigo_Interno: 101, CPF_CNPJ: `${document}    `, Nome: 'CLIENTE EXEMPLO', Descricao: 'PARALISADO', telefone: '11987654321 ' };
const debt = { Codigo_Interno: 101, CPF_CNPJ: document, nome: 'CLIENTE EXEMPLO', Descricao: 'PARALISADO', cartao: '0001234567890  ', Banco: 'Banco Exemplo', Produto: 'Produto Exemplo', Vencimento: '2026-09-01T00:00:00', Saldo_Atual: 123.45 };
const agreement = { ...debt, data_do_acordo: '2026-09-01T00:00:00', parcelas: 2, codigo_do_acordo: 201, parcela: 1, vencimento: '2026-09-30T00:00:00', valor_da_parcela: 61.72, pagamento: null };
const scope: RecordScope = { document, identityKey: identityKey(registration.Nome), internalIds: [101] };
const gateway = (body: unknown) => new SicGateway({ get: async () => body });

test('registration uses published cadastro_portal route and preserves document zeros', async () => {
  const paths: string[] = [];
  const sic = new SicGateway({get:async path=>{paths.push(path);return [];}});
  await sic.registration('012.345.678-90');
  assert.deepEqual(paths,['/SRVW-MIS-01/cadastro_portal/01234567890']);
});

test('CPF and numeric/alphanumeric CNPJ checksums and formatting', () => {
  for (const value of [document, '11.222.333/0001-81', '12.ABC.345/01DE-35']) assert.equal(validDocument(value), true, value);
  for (const value of ['11111111111', '11222333000182', '12ABC34501DE36', '../52998224725', '52998224725?x=1']) assert.equal(validDocument(value), false, value);
  assert.equal(formatDocument('12ABC34501DE35', 'cnpj'), '12.ABC.345/01DE-35');
});
test('registration deduplicates mobile destinations and preserves per-contact authorization', async () => {
  const result = await gateway([registration, { ...registration, telefone: '+55 (11) 98765-4321' }, { ...registration, Codigo_Interno: 102, telefone: '21987651234' }, { ...registration, telefone: '' }]).registration(document);
  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') return;
  assert.deepEqual(result.contacts, [{ phone: '+5511987654321', internalIds: [101] }, { phone: '+5521987651234', internalIds: [102] }]);
  assert.equal('Nome' in result, false);
});
test('conflicting identities and corporate authority require review; names in different order match', async () => {
  assert.equal((await gateway([registration, { ...registration, Nome: 'OUTRA PESSOA' }]).registration(document)).kind, 'review_required');
  assert.equal((await gateway([registration, { ...registration, Nome: 'EXEMPLO CLIENTE' }]).registration(document)).kind, 'ready');
  assert.equal((await gateway([{ ...registration, CPF_CNPJ: '11222333000181' }]).registration('11222333000181')).kind, 'review_required');
  assert.equal((await gateway([{ ...registration, telefone: '' }]).registration(document)).kind, 'no_contacts');
  assert.equal((await gateway([]).registration(document)).kind, 'not_found');
});
test('phone candidates reject landlines, invalid DDD, repeated digits and injected text', () => {
  for (const value of ['', '1133334444', '20987654321', '11999999999', '<script>11987654321']) assert.equal(normalizeWhatsapp(value), null);
});
test('invalid document does not call the upstream; mixed-document responses fail closed', async () => {
  let calls = 0;
  const sic = new SicGateway({ get: async () => { calls++; return []; } });
  await assert.rejects(sic.registration('../123'), /configuration/); assert.equal(calls, 0);
  for (const operation of ['registration', 'debts', 'agreements'] as const) {
    const body = operation === 'registration' ? registration : operation === 'debts' ? debt : agreement;
    const sic = gateway([{ ...body, CPF_CNPJ: '11144477735' }]);
    await assert.rejects(operation === 'registration' ? sic.registration(document) : sic[operation](scope), /invalid_response/);
  }
});
test('debts keep exact cents and zero, filter unauthorized IDs and never expose full contract or identity', async () => {
  const result = await gateway([{ ...debt, Saldo_Atual: 0 }, { ...debt, Codigo_Interno: 102 }]).debts(scope);
  assert.equal(result.length, 1); assert.equal(result[0].balanceCents, 0); assert.equal(result[0].sourceStatus, 'PARALISADO');
  assert.equal(result[0].contractEnding, '7890'); assert.equal(result[0].dueDate, '2026-09-01');
  const serialized = JSON.stringify(result);
  for (const secret of [document, debt.nome, debt.cartao.trim()]) assert.equal(serialized.includes(secret), false);
  assert.equal((await gateway([debt]).debts(scope))[0].balanceCents, 12345);
});
test('financial payload validation rejects negative/fractional values, bad dates, identity conflicts and duplicate conflicts', async () => {
  for (const patch of [{ Saldo_Atual: -1 }, { Saldo_Atual: 1.123 }, { Saldo_Atual: '1.00' }, { Vencimento: '2026-02-30T00:00:00' }, { Vencimento: '2026-09-01T99:00:00' }, { nome: 'OUTRA PESSOA' }, { Banco: '<script>' }]) await assert.rejects(gateway([{ ...debt, ...patch }]).debts(scope), /invalid_response/);
  await assert.rejects(gateway([debt, { ...debt, Saldo_Atual: 2 }]).debts(scope), /invalid_response/);
  await assert.rejects(gateway([debt, { ...debt, cartao: '9999997890' }]).debts(scope), /invalid_response/);
  assert.equal((await gateway([debt, debt]).debts(scope)).length, 1);
});
test('agreements group installments, deduplicate and retain actual payment date without inferred status', async () => {
  const second = { ...agreement, parcela: 2, pagamento: '2026-09-27T12:00:00' };
  const result = await gateway([second, agreement, agreement]).agreements(scope);
  assert.equal(result.length, 1); assert.deepEqual(result[0].installments.map(item => item.number), [1, 2]);
  assert.equal(result[0].installments[0].paidAt, null); assert.equal(result[0].installments[1].paidAt, '2026-09-27');
  for (const patch of [{ pagamento: true }, { parcela: 3 }, { parcelas: 0 }]) await assert.rejects(gateway([{ ...agreement, ...patch }]).agreements(scope), /invalid_response/);
  await assert.rejects(gateway([agreement, { ...agreement, valor_da_parcela: 2 }]).agreements(scope), /invalid_response/);
});
test('bounded HTTP accepts JSON only and sanitizes exceptions', async () => {
  for (const response of [new Response('<html>private</html>'), new Response('{bad', { headers: { 'Content-Type': 'application/json' } }), new Response('[]', { headers: { 'Content-Type': 'application/json', 'Content-Length': '2000000' } }), new Response(' '.repeat(1_048_577), { headers: { 'Content-Type': 'application/json' } })]) {
    await assert.rejects(requestJson(async () => response, 'https://example.test', {}), /invalid_response/);
  }
  await assert.rejects(requestJson(async () => { throw new Error('sensitive'); }, 'https://example.test', {}), error => error instanceof Error && !error.message.includes('sensitive'));
});
test('adapter rejects path injection before login and always disables redirects/cache', async () => {
  let calls = 0;
  const client = new LealAuthClient({ authUrl: 'https://example.test/auth/login', username: 'test', password: 'test' }, async () => { calls++; throw new Error('unexpected'); });
  for (const path of ['//evil.test', '/a/../b', '/a/%2e%2e/b', '/a?cpf=1', '/a#fragment', 'https://evil.test']) await assert.rejects(client.get(path), /configuration/);
  assert.equal(calls, 0);
  await requestJson(async (_url, init) => { assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store'); assert.ok(init?.signal); return Response.json([]); }, 'https://example.test', {});
});
