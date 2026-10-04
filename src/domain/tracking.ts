import { z } from 'zod';
export const CONSENT_VERSION = 'analytics-2026-09-v1';
export const browserEventName = z.enum(['portal_viewed','document_started','document_completed','document_invalid','access_submitted','access_unavailable','help_clicked','demo_opened','page_hidden','page_resumed']);
export const serverEventName = z.enum(['registration_requested','registration_not_found','registration_found','registration_no_contacts','registration_review_required','registration_failed','otp_requested','authentication_completed','portfolio_loaded','portfolio_failed','agreement_confirmed']);
export type BrowserEventName = z.infer<typeof browserEventName>;
export type ServerEventName = z.infer<typeof serverEventName>;
export const browserTrackingEvent = z.object({
  id: z.uuid(), name: browserEventName, occurredAt: z.iso.datetime(),
  documentKind: z.enum(['cpf','cnpj']).optional(),
  durationMs: z.number().int().min(0).max(86400000).optional(),
}).strict();
export const trackingBatch = z.object({ events: z.array(browserTrackingEvent).min(1).max(20) }).strict();
export const startJourney = z.object({
  campaignCode: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/).optional(),
  referrerGroup: z.enum(['direct','search','social','internal','other']),
}).strict();
export type BrowserTrackingEvent = z.infer<typeof browserTrackingEvent>;
export const serverTrackingEvent = z.object({ id: z.uuid(), name: serverEventName, documentKind: z.enum(['cpf','cnpj']).optional(), durationMs: z.number().int().min(0).max(86400000).optional(), debtCount: z.number().int().min(0).max(500).optional(), agreementCount: z.number().int().min(0).max(2000).optional() }).strict().refine(value => value.name === 'portfolio_loaded' ? value.debtCount !== undefined && value.agreementCount !== undefined : value.debtCount === undefined && value.agreementCount === undefined);
export type ServerTrackingEvent = z.infer<typeof serverTrackingEvent>;
