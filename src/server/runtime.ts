import 'server-only';
import { LealAuthClient } from './integrations/leal';
import { MetaOtpSender } from './integrations/meta';
import { SicGateway } from './integrations/sic';
// Lazy composition: build and preview never require credentials or call providers.
let leal: LealAuthClient | undefined;
export function getLealAuth(): LealAuthClient {
  return leal ??= new LealAuthClient({ authUrl: process.env.LEAL_AUTH_URL ?? '', username: process.env.LEAL_AUTH_USUARIO ?? '', password: process.env.LEAL_AUTH_SENHA ?? '' });
}
export function getOtpSender(): MetaOtpSender {
  return new MetaOtpSender({ version: process.env.META_GRAPH_VERSION ?? '', phoneNumberId: process.env.META_PHONE_NUMBER_ID ?? '', accessToken: process.env.META_ACCESS_TOKEN ?? '', template: process.env.META_AUTH_TEMPLATE ?? '', language: process.env.META_AUTH_LANGUAGE ?? 'pt_BR' });
}
export function getSicGateway(): SicGateway {
  return new SicGateway(getLealAuth(), process.env.LEAL_SERVER ?? 'SRVW-MIS-01');
}
export const authReadiness = { available: false, reason: 'shared_persistence_and_whatsapp_activation_pending' } as const;
