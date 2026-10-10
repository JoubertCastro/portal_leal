import 'server-only';
import { LealAuthClient } from './integrations/leal';
import { MetaOtpSender } from './integrations/meta';
import { SicGateway } from './integrations/sic';
import { CustomerAuthStore } from './customer-auth-store';
import { CustomerAccessService } from './customer-access';
import { getDatabase } from './database';
import { Arc4Client } from './integrations/creditors/arc4';
import { CustomerCreditorService } from './customer-creditors';
import { AgreementStore } from './agreement-store';
import { AgreementService } from './agreement-service';
import { MetaBoletoSender } from './integrations/meta-boleto';
// Lazy composition: build and preview never require credentials or call providers.
let leal: LealAuthClient | undefined;
let arc4: Arc4Client | undefined;
export function getCustomerCreditors() {
  const auth = getCustomerAuth();
  return new CustomerCreditorService(auth.service, getSicGateway(), () => {
    if (process.env.ARC4_ENABLED !== 'true') throw new Error('ARC4_UNAVAILABLE');
    return arc4 ??= new Arc4Client({ clientId: process.env.ARC4_CLIENT_ID ?? '', clientSecret: process.env.ARC4_CLIENT_SECRET ?? '' });
  }, new AgreementService(new AgreementStore(getDatabase(), process.env.AUTH_ENCRYPTION_KEY ?? '', process.env.AUTH_DIGEST_KEY ?? ''), process.env.ARC4_CREATED_BY?.trim() ?? ''), {
    phone: (session, browser) => auth.store.verifiedPhone(session, browser),
    sender: () => new MetaBoletoSender({ version: process.env.META_GRAPH_VERSION ?? '', phoneNumberId: process.env.META_PHONE_NUMBER_ID ?? '', accessToken: process.env.META_ACCESS_TOKEN ?? '', template: process.env.META_BOLETO_TEMPLATE ?? 'enviar_boleto', language: process.env.META_BOLETO_LANGUAGE ?? 'pt_BR' }),
  });
}
export function getLealAuth(): LealAuthClient {
  return leal ??= new LealAuthClient({ authUrl: process.env.LEAL_AUTH_URL ?? '', username: process.env.LEAL_AUTH_USUARIO ?? '', password: process.env.LEAL_AUTH_SENHA ?? '' });
}
export function getOtpSender(): MetaOtpSender {
  return new MetaOtpSender({ version: process.env.META_GRAPH_VERSION ?? '', phoneNumberId: process.env.META_PHONE_NUMBER_ID ?? '', accessToken: process.env.META_ACCESS_TOKEN ?? '', template: process.env.META_AUTH_TEMPLATE ?? '', language: process.env.META_AUTH_LANGUAGE ?? 'pt_BR' });
}
export function getSicGateway(): SicGateway {
  return new SicGateway(getLealAuth(), process.env.LEAL_SERVER ?? 'SRVW-MIS-01');
}
export const authReadiness = { get available() {
  return process.env.AUTH_ENABLED==='true' && ['DATABASE_URL','AUTH_ENCRYPTION_KEY','AUTH_DIGEST_KEY','META_GRAPH_VERSION','META_PHONE_NUMBER_ID','META_ACCESS_TOKEN','META_AUTH_TEMPLATE','LEAL_AUTH_URL','LEAL_AUTH_USUARIO','LEAL_AUTH_SENHA'].every(key=>!!process.env[key]);
}, reason: 'configuration_and_shared_persistence_required' };
export function getCustomerAuth(){
  if(!authReadiness.available)throw new Error('AUTH_UNAVAILABLE');
  const store=new CustomerAuthStore(getDatabase(),getOtpSender(),process.env.AUTH_ENCRYPTION_KEY??'',process.env.AUTH_DIGEST_KEY??'');
  return {store,service:new CustomerAccessService(getSicGateway(),store,store,store,process.env.AUTH_DIGEST_KEY??'')};
}
