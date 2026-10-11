import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createCipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { getDatabase } from './database';
import { validDocument, normalizeDocument } from '../domain/document';

export type AuditAction = 'identification' | 'otp_send' | 'authentication' | 'portfolio' | 'logout' | 'creditor_overview' | 'simulation' | 'agreement_confirmation' | 'agreement_status' | 'agreement_details' | 'boleto_download' | 'boleto_whatsapp' | 'integration_background';
type Context = { id: string; repository: AuditRepository };
const context = new AsyncLocalStorage<Context>();
let nextMaintenance=0;
const outcomes = new Set(['success','not_found','found','no_contacts','review_required','verified','invalid_code','created','processing','unknown','changed','failed','accepted','sending']);
const errorCodes = new Set(['configuration','unavailable','unauthorized','invalid_response','unauthenticated','invalid_request','rate_limited','invalid_selection','payment_unavailable','pending','not_found','expired','changed','unknown','busy']);
export function auditEnabled() { return process.env.AUDIT_ENABLED === 'true'; }
function digest(value: string) {
  const secret = process.env.AUTH_DIGEST_KEY ?? ''; if (secret.length < 32) throw new Error('AUDIT_UNAVAILABLE');
  return createHmac('sha256', secret).update('audit:v1:' + value).digest('hex');
}
function seal(value: unknown, id: string) {
  const key = process.env.AUTH_ENCRYPTION_KEY ?? ''; if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('AUDIT_UNAVAILABLE');
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv); c.setAAD(Buffer.from('audit:' + id));
  return Buffer.concat([iv, c.update(JSON.stringify(value)), c.final(), c.getAuthTag()]).toString('base64url');
}
export class AuditRepository {
  constructor(private db: Pool) {}
  async start(action: AuditAction, session?: string) {
    const id = randomUUID();
    await this.db.query('INSERT INTO leal_audit.actions(id,action,session_key) VALUES($1,$2,$3)', [id, action, session ? digest('session:' + session) : null]); return id;
  }
  async identity(id: string, document: string, verified: boolean, contract?: string, creditor?: string) {
    if (!validDocument(document) || (contract?.length ?? 0) > 150) return;
    const normalized = normalizeDocument(document);
    await this.db.query('UPDATE leal_audit.actions SET subject_key=$2,subject_verified=$3,contract_key=$4,creditor=$5,identity_cipher=$6 WHERE id=$1', [id, digest('subject:' + normalized), verified, contract ? digest('contract:' + normalized + ':' + contract) : null, creditor === 'ARC4U' ? 'ARC4U' : null, seal({ document: normalized, ...(contract ? { contract } : {}) }, id)]);
  }
  async resource(id:string,resource:string){
    if(!/^[a-f0-9-]{36}$/i.test(resource))return;
    await this.db.query('UPDATE leal_audit.actions SET resource_id=$2 WHERE id=$1',[id,resource]);
  }
  async outcome(id: string, outcome: string, counts?: { debts?: number; agreements?: number }) {
    if (!outcomes.has(outcome)) throw new Error('AUDIT_INVALID_OUTCOME');
    await this.db.query('UPDATE leal_audit.actions SET outcome=$2,debt_count=COALESCE($3,debt_count),agreement_count=COALESCE($4,agreement_count) WHERE id=$1', [id, outcome, counts?.debts ?? null, counts?.agreements ?? null]);
  }
  async finish(id: string, error?: unknown) {
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && errorCodes.has(error.code) ? error.code : error ? 'unavailable' : null;
    await this.db.query("UPDATE leal_audit.actions SET finished_at=clock_timestamp(),state=$2,error_code=$3,outcome=COALESCE(outcome,$4) WHERE id=$1", [id, error ? 'failed' : 'completed', code, error ? 'failed' : 'success']);
  }
  async httpStart(traceId: string, metadata: ReturnType<typeof classifyCall>) {
    const id = randomUUID(); await this.db.query('INSERT INTO leal_audit.api_calls(id,trace_id,provider,operation,method,endpoint_template) VALUES($1,$2,$3,$4,$5,$6)', [id, traceId, metadata.provider, metadata.operation, metadata.method, metadata.endpoint]); return id;
  }
  async httpFinish(id: string, status: number | null, kind: string | null) {
    await this.db.query('UPDATE leal_audit.api_calls SET finished_at=clock_timestamp(),http_status=$2,error_kind=$3 WHERE id=$1', [id, status, kind]);
  }
}
export async function audited<T>(action: AuditAction, work: () => Promise<T>, session?: string, repository?: AuditRepository): Promise<T> {
  if (!repository && !auditEnabled()) return work();
  if(!repository&&Date.now()>nextMaintenance){
    await getDatabase().query('SELECT leal_audit.purge_expired()');nextMaintenance=Date.now()+3600000;
  }
  const repo = repository ?? new AuditRepository(getDatabase()); const id = await repo.start(action, session);
  return context.run({ id, repository: repo }, async () => {
    try { const value = await work(); await repo.finish(id); return value; }
    catch (error) { await repo.finish(id, error).catch(() => console.error('AUDIT_COMPLETION_FAILED')); throw error; }
  });
}
export async function auditIdentity(document: string, verified: boolean, contract?: string, creditor?: string) { const c = context.getStore(); if (c) await c.repository.identity(c.id, document, verified, contract, creditor); }
export async function auditResource(resource:string){const c=context.getStore();if(c)await c.repository.resource(c.id,resource);}
export async function auditOutcome(outcome: string, counts?: { debts?: number; agreements?: number }) { const c = context.getStore(); if (c) await c.repository.outcome(c.id, outcome, counts); }

/** Closed endpoint vocabulary: URLs, query strings, headers and bodies are NEVER persisted. */
export function classifyCall(url: string, method = 'GET', body?: BodyInit | null) {
  const result = { provider: 'other', operation: 'unclassified', method: ['GET','POST','DELETE','PUT','PATCH'].includes(method) ? method : 'OTHER', endpoint: 'unclassified' };
  let u: URL; try { u = new URL(url); } catch { return result; }
  if (u.hostname === 'graph.facebook.com') {
    result.provider = 'meta';
    if (/\/media$/.test(u.pathname)) { result.operation = 'media_upload'; result.endpoint = '/{version}/{phone_id}/media'; }
    if (/\/messages$/.test(u.pathname)) { result.operation = 'message_send'; result.endpoint = '/{version}/{phone_id}/messages'; }
  } else if (u.hostname === 'btg-agreement.auth.sa-east-1.amazoncognito.com') {
    result.provider = 'arc4'; result.operation = 'oauth'; result.endpoint = '/oauth2/token';
  } else if (u.hostname === 'agreements-api.btgpactual.com') {
    result.provider = 'arc4';
    const routes: [RegExp, string, string][] = [
      [/\/balance$/, 'balance', '/customers/{document}/balance'], [/\/policies$/, 'policies', '/customers/{document}/policies'],
      [/\/offers$/, 'offer', '/customers/{document}/offers'], [/\/agreements$/, method === 'POST' ? 'agreement_create' : 'agreements', '/customers/{document}/agreements'],
      [/\/agreements\/[^/]+\/first-payment$/, 'first_payment', '/customers/{document}/agreements/{agreement}/first-payment'],
      [/\/installment\/[^/]+\/bankslip$/, 'installment_payment', '/customers/{document}/agreements/{agreement}/installment/{index}/bankslip'],
      [/\/agreements\/[^/]+$/, 'agreement_details', '/customers/{document}/agreements/{agreement}'],
    ];
    for (const [pattern, operation, endpoint] of routes) if (pattern.test(u.pathname)) { result.operation = operation; result.endpoint = endpoint; break; }
    if (result.operation === 'offer' && typeof body === 'string') { try { result.operation = JSON.parse(body).simulated === true ? 'offer_simulate' : 'offer_persist'; } catch {} }
  } else {
    let origin = ''; try { origin = new URL(process.env.LEAL_AUTH_URL ?? '').origin; } catch {}
    if (u.origin === origin) {
      result.provider = 'sic';
      if (u.pathname.endsWith('/auth/login')) { result.operation = 'login'; result.endpoint = '/auth/login'; }
      for (const name of ['cadastro_portal','divida','acordos']) if (new RegExp('/' + name + '/[^/]+$').test(u.pathname)) { result.operation = name; result.endpoint = '/{server}/' + name + '/{document}'; }
    }
  }
  return result;
}
export async function auditedHttp<T extends { status: number }>(url: string, init: RequestInit, work: (observedStatus: (status: number) => void) => Promise<T>): Promise<T> {
  const c = context.getStore();
  if (!c) return auditEnabled() ? audited('integration_background', () => auditedHttp(url, init, work)) : work(() => {});
  const id = await c.repository.httpStart(c.id, classifyCall(url, init.method ?? 'GET', init.body));
  let status: number | null = null;
  try { const result = await work(value => { status = value; }); status = result.status; await c.repository.httpFinish(id, status, status >= 400 ? 'http' : null); return result; }
  catch (error) {
    const kind = error && typeof error === 'object' && 'diagnostic' in error && error.diagnostic && typeof error.diagnostic === 'object' && 'kind' in error.diagnostic && ['timeout','network','http'].includes(String(error.diagnostic.kind)) ? String(error.diagnostic.kind) : 'invalid_response_or_unknown';
    await c.repository.httpFinish(id, status, kind).catch(() => console.error('AUDIT_HTTP_COMPLETION_FAILED')); throw error;
  }
}
