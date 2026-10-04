import 'server-only';
import { z } from 'zod';
import { IntegrationError, requestJson, type Fetcher } from './http';

const tokenSchema = z.object({ access_token: z.string().min(1), token_type: z.string().regex(/^bearer$/i), expires_in: z.number().int().min(60).max(86400) });
export interface LealConfig { authUrl: string; username: string; password: string }

// Instantiate once per process. Tokens are service credentials, never customer sessions.
// Customer endpoints are composed by SicGateway. No browser-controlled URLs.
export class LealAuthClient {
  private cached?: { value: string; expiresAt: number };
  private pending?: Promise<string>;
  private readonly origin: string;
  constructor(private config: LealConfig, private fetcher: Fetcher = fetch, private now = Date.now) {
    let url: URL;
    try { url = new URL(config.authUrl); } catch { throw new IntegrationError('configuration'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !config.username || !config.password) throw new IntegrationError('configuration');
    this.origin = url.origin;
  }
  async getToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > this.now()) return this.cached.value;
    if (this.pending) return this.pending;
    this.pending = this.login();
    try { return await this.pending; } finally { this.pending = undefined; }
  }
  private async login(): Promise<string> {
    const startedAt = this.now();
    const result = await requestJson(this.fetcher, this.config.authUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: this.config.username, senha: this.config.password }),
    });
    if (result.status === 401 || result.status === 403) throw new IntegrationError('unauthorized');
    if (result.status !== 200) throw new IntegrationError('unavailable');
    const parsed = tokenSchema.safeParse(result.body);
    if (!parsed.success) throw new IntegrationError('invalid_response');
    this.cached = { value: parsed.data.access_token, expiresAt: startedAt + (parsed.data.expires_in - 30) * 1000 };
    return this.cached.value;
  }
  // Internal adapter use only. Never forward browser-supplied paths to this method.
  async get(path: string): Promise<unknown> {
    if (!/^\/[A-Za-z0-9/_-]+$/.test(path) || path.includes('//')) throw new IntegrationError('configuration');
    const url = new URL(path, this.origin);
    if (url.origin !== this.origin || url.username || url.password || url.hash || url.search) throw new IntegrationError('configuration');
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.getToken();
      const result = await requestJson(this.fetcher, url.href, { headers: { Authorization: `Bearer ${token}` } });
      if (result.status === 401) {
        if (this.cached?.value === token) this.cached = undefined;
        if (attempt === 0) continue;
        throw new IntegrationError('unauthorized');
      }
      if (result.status === 403) throw new IntegrationError('unauthorized');
      if (result.status !== 200) throw new IntegrationError('unavailable');
      return result.body;
    }
    throw new IntegrationError('unauthorized');
  }
}
