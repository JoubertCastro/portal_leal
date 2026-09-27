import 'server-only';
export class IntegrationError extends Error {
  constructor(public readonly code: 'configuration' | 'unavailable' | 'unauthorized' | 'invalid_response') {
    super(`Integration error: ${code}`);
  }
}
export type Fetcher = typeof fetch;
export async function requestJson(fetcher: Fetcher, url: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
  try {
    const response = await fetcher(url, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return { status: response.status, body: null };
    return { status: response.status, body: await response.json() as unknown };
  } catch { throw new IntegrationError('unavailable'); }
}
