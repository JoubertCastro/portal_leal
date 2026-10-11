import { z } from 'zod';
import { HEATMAP_LAYOUT, interactionIds } from './interaction-catalog';
export const CONSENT_VERSION = 'analytics-2026-10-v2';
export const browserEventName = z.enum(['portal_viewed','document_started','document_completed','document_invalid','access_submitted','access_unavailable','help_clicked','demo_opened','page_hidden','page_resumed','control_clicked','human_handoff']);
export const serverEventName = z.enum(['registration_requested','registration_not_found','registration_found','registration_no_contacts','registration_review_required','registration_failed','otp_requested','authentication_completed','portfolio_loaded','portfolio_failed','agreement_confirmed','simulation_requested','simulation_completed','agreement_confirmation_requested','agreement_confirmation_unknown','agreement_confirmation_failed','boleto_available','boleto_whatsapp_accepted']);
export type BrowserEventName = z.infer<typeof browserEventName>;
export type ServerEventName = z.infer<typeof serverEventName>;
const percentage = z.number().int().min(0).max(100);
export const interaction = z.object({
  control: z.enum(interactionIds), layout: z.literal(HEATMAP_LAYOUT),
  page: z.enum(['home','portal','demo','privacy','other']),
  section: z.enum(['header','navigation','content','footer','consent','agreement','other']),
  screen: z.enum(['inicio','pendencias','acordos','ajuda','other']),
  viewport: z.enum(['small','medium','large']), modality: z.enum(['pointer','keyboard']),
  elementX: percentage.optional(), elementY: percentage.optional(),
  pageX: percentage.optional(), pageY: percentage.optional(),
  scroll: percentage, channel: z.enum(['whatsapp','phone','email']).optional(),
}).strict().refine(v=>v.modality==='keyboard'?[v.elementX,v.elementY,v.pageX,v.pageY].every(x=>x===undefined):[v.elementX,v.elementY,v.pageX,v.pageY].every(x=>x!==undefined));
export const browserTrackingEvent = z.object({
  id: z.uuid(), name: browserEventName, occurredAt: z.iso.datetime(),
  documentKind: z.enum(['cpf','cnpj']).optional(),
  durationMs: z.number().int().min(0).max(86400000).optional(),
  interaction: interaction.optional(),
}).strict().refine(v=>['control_clicked','human_handoff'].includes(v.name)?!!v.interaction:v.interaction===undefined).refine(v=>v.name!=='human_handoff'||!!v.interaction?.channel);
export const trackingBatch = z.object({ events: z.array(browserTrackingEvent).min(1).max(20) }).strict();
export const startJourney = z.object({
  campaignCode: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/).optional(),
  referrerGroup: z.enum(['direct','search','social','internal','other']),
}).strict();
export type BrowserTrackingEvent = z.infer<typeof browserTrackingEvent>;
export const serverTrackingEvent = z.object({ id: z.uuid(), name: serverEventName, documentKind: z.enum(['cpf','cnpj']).optional(), durationMs: z.number().int().min(0).max(86400000).optional(), debtCount: z.number().int().min(0).max(500).optional(), agreementCount: z.number().int().min(0).max(2000).optional() }).strict().refine(value => value.name === 'portfolio_loaded' ? value.debtCount !== undefined && value.agreementCount !== undefined : value.debtCount === undefined && value.agreementCount === undefined);
export type ServerTrackingEvent = z.infer<typeof serverTrackingEvent>;
