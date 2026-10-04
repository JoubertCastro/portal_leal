import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CustomerAccessService, WHATSAPP_NOTICE_VERSION, type PendingSelection, type VerifiedCustomerSession, type CodeChallengeIssuer, type CustomerAccessStore } from '../src/server/customer-access';
import { SicGateway } from '../src/server/integrations/sic';

const document = '52998224725';
const browser = 'b'.repeat(43); const sessionToken = 's'.repeat(43);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const registration = { Codigo_Interno: 101, CPF_CNPJ: document, Nome: 'CLIENTE EXEMPLO', Descricao: 'PARALISADO', telefone: '11987654321' };
function fixture(rows: unknown = [registration]) {
  let selection: PendingSelection | undefined;
  let session: VerifiedCustomerSession | null = null;
  const issued: Parameters<CodeChallengeIssuer['issue']>[0][] = [];
  const paths: string[] = []; const limitKeys: string[] = [];
  let allowed = true;
  // Test double only. A real store must implement this claim in one transaction.
  const store: CustomerAccessStore = {
    saveSelection: async value => { selection = value; },
    claimSelection: async input => {
      if (!selection || selection.idHash !== input.idHash || selection.browserTokenHash !== input.browserTokenHash || selection.expiresAt <= input.now) return null;
      const option = selection.options.find(item => item.id === input.optionId);
      if (!option) return null;
      selection = undefined; return option;
    },
    findSession: async () => session,
  };
  const sic = new SicGateway({ get: async path => { paths.push(path); return path.includes('/cadastro_portal/') ? rows : []; } });
  const service = new CustomerAccessService(sic, store, { take: async key => { limitKeys.push(key); return { allowed, retryAfterSeconds: 60 }; } }, { issue: async input => { issued.push(input); return { challengeId: 'opaque-challenge' }; } }, 'test-only-key-with-at-least-32-bytes', () => 1000);
  return { service, paths, issued, limitKeys, getSelection: () => selection, setSession: (value: VerifiedCustomerSession | null) => { session = value; }, deny: () => { allowed = false; } };
}
const validSession = (): VerifiedCustomerSession => ({ tokenHash: hash(sessionToken), browserTokenHash: hash(browser), scope: { document, identityKey: 'CLIENTE EXEMPLO', internalIds: [101] }, verifiedAt: 900, expiresAt: 2000, revokedAt: null });

test('pre-auth DTO contains masked phones, random options and no raw identity/scope', async () => {
  const f = fixture(); const result = await f.service.prepare(document, browser, 'trusted-network');
  assert.equal(result.kind, 'select_phone');
  if (result.kind !== 'select_phone') return;
  assert.match(result.selectionId, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(result.options[0].label, '+55 (••) •••••-4321');
  const serialized = JSON.stringify(result);
  for (const secret of [document, registration.telefone, registration.Nome, 'internalIds']) assert.equal(serialized.includes(secret), false);
  assert.notEqual(f.getSelection()?.idHash, result.selectionId);
  assert.ok(f.limitKeys.every(key => /^[a-f0-9]{64}$/.test(key)));
});
test('missing, conflicting and contactless registrations share public response', async () => {
  for (const rows of [[], [{ ...registration, telefone: '' }], [registration, { ...registration, Nome: 'OUTRA PESSOA' }]]) assert.deepEqual(await fixture(rows).service.prepare(document, browser, 'trusted-network'), { kind: 'assistance_required' });
});
test('PJ prepares masked selection only after matching the entered legal name', async () => {
  const f = fixture([{ ...registration, CPF_CNPJ: '11222333000181', Nome: 'EMPRESA EXEMPLO LTDA' }]);
  assert.deepEqual(await f.service.prepare('11222333000181', browser, 'network'), { kind: 'assistance_required' });
  const result = await f.service.prepare('11222333000181', browser, 'network', 'Empresa Exemplo Ltda.');
  assert.equal(result.kind, 'select_phone');
  assert.equal(JSON.stringify(result).includes('EMPRESA'), false);
  assert.equal(f.issued.length, 0);
});
test('rate limit and malformed input stop requests before upstream', async () => {
  const f = fixture(); f.deny();
  await assert.rejects(f.service.prepare(document, browser, 'network'), /rate_limited/);
  await assert.rejects(f.service.prepare('123', browser, 'network'), /invalid_request/);
  await assert.rejects(f.service.prepare(document, 'forged', 'network'), /invalid_request/);
  assert.equal(f.paths.length, 0);
});
test('selection cannot change browser, option, notice or mandatory authorization', async () => {
  const f = fixture(); const result = await f.service.prepare(document, browser, 'network');
  if (result.kind !== 'select_phone') throw new Error('fixture');
  const input = { selectionId: result.selectionId, optionId: result.options[0].id, browserToken: browser, authentication: true, communications: false, noticeVersion: WHATSAPP_NOTICE_VERSION };
  for (const patch of [{ browserToken: 'x'.repeat(43) }, { optionId: 'x'.repeat(43) }, { authentication: false }, { noticeVersion: 'old' }]) await assert.rejects(f.service.requestCode({ ...input, ...patch }), /invalid_request/);
  assert.equal(f.issued.length, 0);
  await f.service.requestCode(input);
  assert.equal(f.issued.length, 1); assert.equal(f.issued[0].phone, '+5511987654321'); assert.equal(f.issued[0].consent.communications, false);
  assert.deepEqual(f.issued[0].scope.internalIds, [101]);
  await assert.rejects(f.service.requestCode(input), /invalid_request/);
  assert.equal(f.issued.length, 1);
});
test('expired selection cannot trigger a code', async () => {
  const f = fixture(); const result = await f.service.prepare(document, browser, 'network');
  if (result.kind !== 'select_phone') throw new Error('fixture');
  f.getSelection()!.expiresAt = 1000;
  await assert.rejects(f.service.requestCode({ selectionId: result.selectionId, optionId: result.options[0].id, browserToken: browser, authentication: true, communications: true, noticeVersion: WHATSAPP_NOTICE_VERSION }), /invalid_request/);
  assert.equal(f.issued.length, 0);
});
test('selected phone scope excludes unrelated contracts for same document', async () => {
  const f = fixture([registration, { ...registration, Codigo_Interno: 102, telefone: '21987651234' }]);
  const result = await f.service.prepare(document, browser, 'network');
  if (result.kind !== 'select_phone') throw new Error('fixture');
  await f.service.requestCode({ selectionId: result.selectionId, optionId: result.options[1].id, browserToken: browser, authentication: true, communications: true, noticeVersion: WHATSAPP_NOTICE_VERSION });
  assert.deepEqual(f.issued[0].scope.internalIds, [102]);
  assert.equal(f.issued[0].consent.communications, true);
});
test('missing, expired, revoked, unverified and wrong-browser sessions never query financial endpoints', async () => {
  const f = fixture();
  for (const session of [null, { ...validSession(), expiresAt: 1000 }, { ...validSession(), revokedAt: 999 }, { ...validSession(), verifiedAt: 1001 }, { ...validSession(), verifiedAt: NaN }, { ...validSession(), browserTokenHash: hash('other') }, { ...validSession(), tokenHash: hash('other') }]) {
    f.setSession(session); await assert.rejects(f.service.portfolio(sessionToken, browser), /unauthenticated/);
  }
  assert.equal(f.paths.length, 0);
});
test('valid session determines upstream document, and portfolio limits fail before network', async () => {
  const f = fixture(); f.setSession(validSession());
  assert.deepEqual(await f.service.portfolio(sessionToken, browser), { debts: [], agreements: [] });
  assert.deepEqual(f.paths.sort(), [`/SRVW-MIS-01/acordos/${document}`, `/SRVW-MIS-01/divida/${document}`]);
  f.deny(); await assert.rejects(f.service.portfolio(sessionToken, browser), /rate_limited/); assert.equal(f.paths.length, 2);
});
