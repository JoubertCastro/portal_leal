import 'server-only';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { normalizeDocument, validDocument } from '../domain/document';
import type { RateLimiter } from '../domain/contracts';
import { SicGateway, type RecordScope } from './integrations/sic';
import { maskWhatsapp } from './integrations/sic-schema';
import { customerAnalytics, type CustomerAnalytics } from './analytics/customer-events';

export class AccessError extends Error {
  constructor(public readonly code: 'invalid_request' | 'unauthenticated' | 'rate_limited' | 'unavailable') { super(`Access error: ${code}`); }
}
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export const WHATSAPP_NOTICE_VERSION = '2026-09-27-v1';
export const WHATSAPP_NOTICES = {
  authentication: 'Quero receber um código de acesso no WhatsApp selecionado para confirmar minha identidade.',
  communications: 'Quero receber também mensagens e comunicados da Leal pelo WhatsApp. Esta escolha é opcional e pode ser cancelada.',
} as const;

export interface PendingSelection {
  idHash: string; browserTokenHash: string; expiresAt: number;
  options: { id: string; phone: string; scope: RecordScope }[];
}
export interface VerifiedCustomerSession {
  tokenHash: string; browserTokenHash: string; scope: RecordScope;
  verifiedAt: number; expiresAt: number; revokedAt: number | null;
}
// Implementations must use shared storage, encryption for PII and bounded retention.
// No in-memory implementation is installed in production.
export interface CustomerAccessStore {
  saveSelection(selection: PendingSelection): Promise<void>;
  // Atomic single-use claim, bound to browser and expiry. Never look up an arbitrary phone.
  claimSelection(input: { idHash: string; browserTokenHash: string; optionId: string; now: number }): Promise<PendingSelection['options'][number] | null>;
  findSession(tokenHash: string): Promise<VerifiedCustomerSession | null>;
}
export interface CodeChallengeIssuer {
  // Atomically enforce send quotas/resend delay; persist a keyed OTP digest, max attempts,
  // expiry and the scope. Persist consent as confirmed only after successful verification.
  // Use an outbox/provider idempotency policy, never retry ambiguous sends blindly.
  issue(input: { phone: string; scope: RecordScope; browserTokenHash: string; consent: { noticeVersion: string; authentication: true; communications: boolean; requestedAt: number } }): Promise<{ challengeId: string }>;
}

/** Only masked numbers and opaque random IDs cross the pre-authentication boundary. */
export class CustomerAccessService {
  constructor(private sic: SicGateway, private store: CustomerAccessStore, private limiter: RateLimiter, private issuer: CodeChallengeIssuer, private rateKey: string, private now = Date.now, private analytics: CustomerAnalytics = customerAnalytics) {
    if (Buffer.byteLength(rateKey) < 32) throw new AccessError('unavailable');
  }
  private async limit(namespace: string, value: string, count: number, window: number) {
    const key = createHmac('sha256', this.rateKey).update(`${namespace}:${value}`).digest('hex');
    if (!(await this.limiter.take(key, count, window)).allowed) throw new AccessError('rate_limited');
  }
  async prepare(documentInput: string, browserToken: string, trustedNetworkKey: string, legalName?: string) {
    if (!validDocument(documentInput) || !tokenPattern.test(browserToken) || !trustedNetworkKey || trustedNetworkKey.length > 128) throw new AccessError('invalid_request');
    const document = normalizeDocument(documentInput);
    // trustedNetworkKey must come from the configured reverse proxy, not arbitrary X-Forwarded-For.
    await this.limit('network', trustedNetworkKey, 20, 900_000);
    await this.limit('browser', browserToken, 5, 900_000);
    await this.limit('document', document, 5, 900_000);
    const documentKind = document.length===11?'cpf' as const:'cnpj' as const;
    const started=this.now();
    await this.analytics.record({name:'registration_requested',documentKind},{document,verified:false});
    let registration;
    try { registration = await this.sic.registration(document, legalName); }
    catch(error){await this.analytics.record({name:'registration_failed',documentKind,durationMs:Math.max(0,this.now()-started)});throw error;}
    await this.analytics.record({name:registration.kind==='not_found'?'registration_not_found':'registration_found',documentKind,durationMs:Math.max(0,this.now()-started)},{document,verified:false});
    if(registration.kind==='no_contacts'||registration.kind==='review_required')await this.analytics.record({name:registration.kind==='no_contacts'?'registration_no_contacts':'registration_review_required',documentKind});
    // Same public result for missing, conflicting, corporate and contactless records.
    if (registration.kind !== 'ready') return { kind: 'assistance_required' as const };
    const selectionId = randomBytes(32).toString('base64url');
    const options = registration.contacts.map(contact => ({ id: randomBytes(32).toString('base64url'), phone: contact.phone, scope: { document, identityKey: registration.identityKey, internalIds: contact.internalIds, acceptedNames: registration.acceptedNames.filter(item => contact.internalIds.includes(item.internalId)) } }));
    const expiresAt = this.now() + 300_000;
    await this.store.saveSelection({ idHash: hash(selectionId), browserTokenHash: hash(browserToken), expiresAt, options });
    return { kind: 'select_phone' as const, selectionId, expiresAt, noticeVersion: WHATSAPP_NOTICE_VERSION, options: options.map(option => ({ id: option.id, label: maskWhatsapp(option.phone) })) };
  }
  async requestCode(input: { selectionId: string; optionId: string; browserToken: string; authentication: boolean; communications: boolean; noticeVersion: string }) {
    if (![input.selectionId, input.optionId, input.browserToken].every(value => tokenPattern.test(value)) || input.authentication !== true || typeof input.communications !== 'boolean' || input.noticeVersion !== WHATSAPP_NOTICE_VERSION) throw new AccessError('invalid_request');
    await this.limit('send', input.browserToken, 3, 900_000);
    const now = this.now();
    const browserTokenHash = hash(input.browserToken);
    const selected = await this.store.claimSelection({ idHash: hash(input.selectionId), browserTokenHash, optionId: input.optionId, now });
    if (!selected) throw new AccessError('invalid_request');
    // Destination and scope come exclusively from the stored selection.
    const result=await this.issuer.issue({ phone: selected.phone, scope: selected.scope, browserTokenHash, consent: { noticeVersion: WHATSAPP_NOTICE_VERSION, authentication: true, communications: input.communications, requestedAt: now } });
    await this.analytics.record({name:'otp_requested'});
    return result;
  }
  async portfolio(sessionToken: string, browserToken: string) {
    if (!tokenPattern.test(sessionToken) || !tokenPattern.test(browserToken)) throw new AccessError('unauthenticated');
    const tokenHash = hash(sessionToken);
    const session = await this.store.findSession(tokenHash);
    const now = this.now();
    if (!session || session.tokenHash !== tokenHash || session.browserTokenHash !== hash(browserToken) || session.revokedAt !== null || !Number.isFinite(session.expiresAt) || session.expiresAt <= now || !Number.isFinite(session.verifiedAt) || session.verifiedAt > now || session.verifiedAt >= session.expiresAt) throw new AccessError('unauthenticated');
    await this.limit('portfolio', tokenHash, 30, 60_000);
    const started=this.now();
    let debts;let agreements;
    try{[debts,agreements]=await Promise.all([this.sic.debts(session.scope),this.sic.agreements(session.scope)]);}
    catch(error){await this.analytics.record({name:'portfolio_failed',durationMs:Math.max(0,this.now()-started)});throw error;}
    await this.analytics.record({name:'portfolio_loaded',debtCount:debts.length,agreementCount:agreements.length,durationMs:Math.max(0,this.now()-started)},{document:session.scope.document,verified:true});
    return { debts, agreements };
  }
}
