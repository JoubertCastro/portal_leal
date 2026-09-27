import 'server-only';
import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
export function newSessionToken(): string { return randomBytes(32).toString('base64url'); }
export function sessionHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function newOtp(): string { return randomInt(0, 1_000_000).toString().padStart(6, '0'); }
// Low-entropy OTPs need a keyed digest, not a plain hash. Secret stays outside DB.
export function otpDigest(challengeId: string, code: string, secret: string): string {
  if (secret.length < 32 || !/^\d{6}$/.test(code)) throw new Error('Invalid OTP configuration');
  return createHmac('sha256', secret).update(JSON.stringify([challengeId, code])).digest('hex');
}
