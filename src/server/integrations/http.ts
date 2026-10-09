import 'server-only';
export class IntegrationError extends Error {
  constructor(public readonly code: 'configuration' | 'unavailable' | 'unauthorized' | 'invalid_response', public readonly diagnostic?: { kind: 'timeout' | 'network' | 'http'; status?: number; reason?: string }) {
    super(`Integration error: ${code}`);
  }
}
export type Fetcher = typeof fetch;
const MAX_RESPONSE_BYTES = 1_048_576;
async function safeProblem(response: Response): Promise<string | undefined> {
  // Closed vocabulary only. Never retain or log error descriptions, request URLs or bodies.
  if (!response.headers.get('content-type')?.includes('json') || !response.body) { await response.body?.cancel(); return 'non_json_error'; }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 32768) { await reader.cancel(); return 'oversized_error'; } chunks.push(part.value); }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const codes = ['invalid_client', 'invalid_grant', 'invalid_request', 'invalid_scope', 'unauthorized_client', 'unsupported_grant_type'];
    if (codes.includes(value?.error)) return value.error;
    return 'provider_validation';
  } catch { return 'unreadable_error'; }
  finally { reader.releaseLock(); }
}
export async function requestJson(fetcher: Fetcher, url: string, init: RequestInit): Promise<{ status: number; body: unknown; problem?: string }> {
  try {
    const response = await fetcher(url, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return { status: response.status, body: null, problem: await safeProblem(response) };
    if (!/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
      await response.body?.cancel(); throw new IntegrationError('invalid_response');
    }
    if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
      await response.body?.cancel(); throw new IntegrationError('invalid_response');
    }
    if (!response.body) throw new IntegrationError('invalid_response');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new IntegrationError('invalid_response'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new IntegrationError('invalid_response'); }
    return { status: response.status, body };
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    throw new IntegrationError('unavailable', { kind: error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'network' });
  }
}
