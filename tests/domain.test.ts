import test from 'node:test';
import assert from 'node:assert/strict';
import { validCpf, formatCpf } from '../src/domain/cpf';
import { analyticsEvent, approvedCampaign } from '../src/domain/analytics';
import { newOtp, newSessionToken, sessionHash, otpDigest } from '../src/server/security/tokens';

test('CPF rejects repeated digits, invalid checksum and letters', () => {
  assert.equal(validCpf('111.111.111-11'), false);
  assert.equal(validCpf('529.982.247-26'), false);
  assert.equal(validCpf('abc52998224725'), false);
  assert.equal(validCpf('529.982.247-25'), true);
  assert.equal(formatCpf('52998224725'), '529.982.247-25');
});
test('analytics rejects extra personal data and unapproved campaign values', () => {
  const event = { id: crypto.randomUUID(), name: 'portal_viewed', occurredAt: new Date().toISOString(), journeyId: crypto.randomUUID(), source: 'browser' };
  assert.equal(analyticsEvent.safeParse(event).success, true);
  assert.equal(analyticsEvent.safeParse({ ...event, cpf: '52998224725' }).success, false);
  assert.equal(analyticsEvent.safeParse({ ...event, name: 'arbitrary' }).success, false);
  assert.deepEqual(approvedCampaign('?utm_source=google&utm_campaign=52998224725&phone=123', new Set(['google'])), { source: 'google' });
});
test('session entropy and keyed OTP digests are challenge-specific', () => {
  const a = newSessionToken(); const b = newSessionToken();
  assert.notEqual(a, b); assert.equal(sessionHash(a).length, 64);
  assert.match(newOtp(), /^\d{6}$/);
  const secret = 'test-only-secret-at-least-32-characters';
  assert.notEqual(otpDigest('a', '123456', secret), otpDigest('b', '123456', secret));
  assert.throws(() => otpDigest('a', '123456', 'short'));
});
