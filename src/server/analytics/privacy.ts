import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { normalizeDocument, validDocument } from '../../domain/document';
import { CONSENT_VERSION } from '../../domain/tracking';

const token = z.object({ id: z.uuid(), kind: z.enum(['consent','journey']), expires: z.number().int(), version: z.literal(CONSENT_VERSION) }).strict();
function secret() { const value = process.env.ANALYTICS_COOKIE_SECRET ?? ''; if (value.length < 32) throw new Error('Analytics unavailable'); return value; }
export function signTrackingToken(id: string, kind: 'consent' | 'journey', maxAge: number) {
  const body = Buffer.from(JSON.stringify({ id, kind, expires: Date.now() + maxAge * 1000, version: CONSENT_VERSION })).toString('base64url');
  return `${body}.${createHmac('sha256', secret()).update(body).digest('base64url')}`;
}
export function verifyTrackingToken(value: string | undefined, kind: 'consent' | 'journey'): string | null {
  if (!value || value.length > 500) return null;
  const parts = value.split('.'); if (parts.length !== 2) return null;
  const expected = createHmac('sha256', secret()).update(parts[0]).digest(); const actual = Buffer.from(parts[1], 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try { const parsed = token.safeParse(JSON.parse(Buffer.from(parts[0], 'base64url').toString())); return parsed.success && parsed.data.kind === kind && parsed.data.expires > Date.now() ? parsed.data.id : null; } catch { return null; }
}
export function subjectKey(document: string): string {
  const key = process.env.ANALYTICS_SUBJECT_SECRET ?? '';
  if (key.length < 32 || !validDocument(document)) throw new Error('Invalid analytics identity');
  return `v1:${createHmac('sha256', key).update(normalizeDocument(document)).digest('hex')}`;
}
export function deviceContext(userAgent: string) {
  const ua = userAgent.slice(0, 1000);
  return { device: /ipad|tablet/i.test(ua) ? 'tablet' : /mobile|iphone|android/i.test(ua) ? 'mobile' : ua ? 'desktop' : 'unknown', browser: /edg\//i.test(ua) ? 'edge' : /chrome|crios/i.test(ua) ? 'chrome' : /firefox|fxios/i.test(ua) ? 'firefox' : /safari/i.test(ua) ? 'safari' : 'other' };
}
const geography = z.object({ country: z.string().regex(/^[A-Z]{2}$/), region: z.string().max(80).regex(/^[\p{L} .'-]+$/u), city: z.string().max(100).regex(/^[\p{L} .'-]+$/u), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict();
export function trustedGeography(headers: Headers) {
  const configured = process.env.ANALYTICS_EDGE_SECRET ?? ''; const supplied = headers.get('x-leal-edge-key') ?? '';
  if (configured.length < 32 || supplied.length > 256) return null;
  const a = Buffer.from(configured); const b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const raw = headers.get('x-leal-geo') ?? ''; if (raw.length > 1000) return null;
  try { const value = geography.safeParse(JSON.parse(raw)); return value.success ? { ...value.data, latitude: Math.round(value.data.latitude * 10) / 10, longitude: Math.round(value.data.longitude * 10) / 10 } : null; } catch { return null; }
}
