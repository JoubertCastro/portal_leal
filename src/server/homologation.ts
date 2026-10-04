import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { normalizeDocument, validDocument } from '../domain/document';

export function homologationAllowed(input: { key: string; code: string; document: string }, env: Record<string, string | undefined> = process.env, now = Date.now()): boolean {
  const expires = Date.parse(env.HOMOLOGATION_EXPIRES_AT ?? '');
  const secret = env.HOMOLOGATION_ACCESS_KEY ?? '';
  if (env.HOMOLOGATION_ENABLED !== 'true' || secret.length < 32 || !Number.isFinite(expires) || expires <= now || expires > now + 86_400_000 || !validDocument(input.document)) return false;
  const equal = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
  return equal(input.key, secret) && equal(input.code, '1234') && equal(normalizeDocument(input.document), env.HOMOLOGATION_DOCUMENT ?? '');
}
