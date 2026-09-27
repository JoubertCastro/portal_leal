import { z } from 'zod';

// Taxonomy is deliberately closed: no arbitrary payload, URL, CPF, phone, or debt values.
export const eventName = z.enum(['portal_viewed', 'access_started', 'authentication_completed', 'debts_viewed', 'agreement_confirmed']);
export const analyticsEvent = z.object({
  id: z.uuid(), name: eventName, occurredAt: z.iso.datetime(),
  journeyId: z.uuid(), source: z.enum(['browser', 'server']),
}).strict();
export type AnalyticsEvent = z.infer<typeof analyticsEvent>;
export interface EventRepository { appendOnce(event: AnalyticsEvent): Promise<void> }
export interface Campaign { source?: string; medium?: string; campaign?: string }
// Approved campaign codes only. Unknown/raw query parameters must never be persisted.
export function approvedCampaign(search: string, allowlist: ReadonlySet<string>): Campaign {
  const params = new URLSearchParams(search);
  const result: Campaign = {};
  for (const field of ['source', 'medium', 'campaign'] as const) {
    const value = params.get(`utm_${field}`);
    if (value && allowlist.has(value)) result[field] = value;
  }
  return result;
}
