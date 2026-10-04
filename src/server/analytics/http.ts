import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getDatabase } from '../database';
import { AnalyticsRepository, TrackingError } from './repository';
import { verifyTrackingToken } from './privacy';
import { apiError } from '../http';

export const CONSENT_COOKIE = 'leal_analytics_consent';
export const JOURNEY_COOKIE = 'leal_analytics_journey';
export const cookieOptions = () => ({ httpOnly: true, sameSite: 'strict' as const, secure: process.env.APP_ORIGIN?.startsWith('https://') ?? true, path: '/' });
export function analyticsEnabled() { return process.env.ANALYTICS_ENABLED === 'true' && !!process.env.DATABASE_URL && (process.env.ANALYTICS_COOKIE_SECRET?.length ?? 0)>=32; }
export function analyticsRepository() { if (!analyticsEnabled()) throw new Error('Analytics unavailable'); return new AnalyticsRepository(getDatabase()); }
export async function trackingCookies() {
  const jar = await cookies();
  return { consentId: verifyTrackingToken(jar.get(CONSENT_COOKIE)?.value, 'consent'), journeyId: verifyTrackingToken(jar.get(JOURNEY_COOKIE)?.value, 'journey') };
}
export async function boundedJson(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length'))>16384 || !request.body) throw new TrackingError('invalid_event');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size=0;
  try { while (true) { const next = await reader.read(); if(next.done) break; size+=next.value.byteLength; if(size>16384) { await reader.cancel(); throw new TrackingError('invalid_event'); } chunks.push(next.value); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new TrackingError('invalid_event'); }
}
export function trackingFailure(error: unknown) {
  if(error instanceof TrackingError) return apiError(error.code==='rate_limited'?429:error.code==='invalid_event'?400:403, error.code.toUpperCase(), 'Não foi possível registrar esta solicitação.');
  // Never log the DB exception: it may contain query arguments, connection details or PII.
  return apiError(503,'ANALYTICS_UNAVAILABLE','Estatísticas temporariamente indisponíveis.');
}
export const trackingResponse = (body: unknown, status=200) => NextResponse.json(body,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie'}});
