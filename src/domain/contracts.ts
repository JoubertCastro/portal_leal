// Domain contracts. No framework, provider response, or database dependency.
export interface Customer { id: string; externalId: string; displayName: string }
export interface Debt { id: string; creditor: string; amountCents: number; status: 'open' | 'negotiating' }
export interface Agreement { id: string; creditor: string; installmentCents: number; installments: number; paidInstallments: number; nextDueDate: string }
export interface OtpSender { send(to: string, code: string): Promise<{ messageId: string }> }
export interface Session {
  tokenHash: string; customerId: string; createdAt: number; expiresAt: number; revokedAt: number | null;
}
export interface SessionRepository {
  create(session: Session): Promise<void>;
  findActive(tokenHash: string, now: number): Promise<Session | null>;
  revoke(tokenHash: string, now: number): Promise<void>;
}
export interface Challenge {
  id: string; customerId: string; browserTokenHash: string; codeDigest: string;
  expiresAt: number; attemptsRemaining: number; resendAfter: number;
}
export interface ChallengeRepository {
  // The shared implementation MUST atomically invalidate older challenges and enforce resend limits.
  issue(challenge: Challenge, now: number): Promise<'issued' | 'rate_limited'>;
  // Compare, decrement attempts, consume once, and create session in ONE database transaction.
  consumeAndCreateSession(input: {
    id: string; browserTokenHash: string; codeDigest: string; now: number;
    sessionTokenHash: string; sessionExpiresAt: number;
  }): Promise<'verified' | 'invalid' | 'expired' | 'locked'>;
}
export interface RateLimiter {
  // Atomic and shared across instances. Keys must be pseudonymous, never raw CPF/phone.
  take(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}
