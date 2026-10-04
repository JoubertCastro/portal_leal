import test from 'node:test';
import assert from 'node:assert/strict';
import { LealAuthClient } from '../src/server/integrations/leal';
import { MetaOtpSender } from '../src/server/integrations/meta';
import type { Fetcher } from '../src/server/integrations/http';
const config = { authUrl: 'https://sic.example/auth/login', username: 'test', password: 'test' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('concurrent calls share login and expiry triggers renewal', async () => {
  let count = 0; let now = 0;
  const fetcher: Fetcher = async () => { count++; return json({ access_token: `token-${count}`, token_type: 'bearer', expires_in: 43200 }); };
  const client = new LealAuthClient(config, fetcher, () => now);
  assert.deepEqual(await Promise.all([client.getToken(), client.getToken(), client.getToken()]), ['token-1', 'token-1', 'token-1']);
  assert.equal(count, 1); now = 43200 * 1000;
  assert.equal(await client.getToken(), 'token-2');
});
test('401 renews once and external URLs never receive credentials', async () => {
  let logins = 0; let reads = 0;
  const fetcher: Fetcher = async (url) => {
    if (String(url).endsWith('/auth/login')) { logins++; return json({ access_token: `t-${logins}`, token_type: 'bearer', expires_in: 43200 }); }
    reads++; return reads === 1 ? json({}, 401) : json({ ok: true });
  };
  const client = new LealAuthClient(config, fetcher);
  assert.deepEqual(await client.get('/auth/me'), { ok: true });
  assert.equal(logins, 2); assert.equal(reads, 2);
  await assert.rejects(client.get('//other.example/private'), /configuration/);
  assert.equal(reads, 2);
});
test('upstream malformed response, outage and repeated 401 fail safely', async () => {
  const malformed = new LealAuthClient(config, async () => json({ token: 'not-the-contract' }));
  await assert.rejects(malformed.getToken(), /invalid_response/);
  const outage = new LealAuthClient(config, async () => { throw new Error('private upstream details'); });
  await assert.rejects(outage.getToken(), error => error instanceof Error && error.message === 'Integration error: unavailable');
  let calls = 0;
  const client = new LealAuthClient(config, async url => { calls++; return String(url).endsWith('/auth/login') ? json({ access_token: 't', token_type: 'bearer', expires_in: 43200 }) : json({}, 401); });
  await assert.rejects(client.get('/auth/me'), /unauthorized/); assert.equal(calls, 4);
});
test('Meta sends approved template shape and never retries ambiguous delivery', async () => {
  let calls = 0;
  const sender = new MetaOtpSender({ version: 'v23.0', phoneNumberId: '123', accessToken: 'test', template: 'test_auth', language: 'pt_BR' }, async (url, init) => {
    calls++; assert.equal(String(url), 'https://graph.facebook.com/v23.0/123/messages');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.to, '5561999999999'); assert.equal(body.template.components[1].parameters[0].text, '123456');
    assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store');
    return json({ messages: [{ id: 'fake-message' }] });
  });
  assert.deepEqual(await sender.send('+5561999999999', '123456'),{messageId:'fake-message'}); assert.equal(calls, 1);
  await assert.rejects(sender.send('invalid', '123456'), /configuration/); assert.equal(calls, 1);
});
