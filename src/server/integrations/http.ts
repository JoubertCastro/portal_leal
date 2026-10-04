import 'server-only';
export class IntegrationError extends Error {
  constructor(public readonly code: 'configuration' | 'unavailable' | 'unauthorized' | 'invalid_response') {
    super(`Integration error: ${code}`);
  }
}
export type Fetcher = typeof fetch;
const MAX_RESPONSE_BYTES = 1_048_576;
export async function requestJson(fetcher: Fetcher, url: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
  try {
    const response = await fetcher(url, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) { await response.body?.cancel(); return { status: response.status, body: null }; }
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
    throw new IntegrationError('unavailable');
  }
}
