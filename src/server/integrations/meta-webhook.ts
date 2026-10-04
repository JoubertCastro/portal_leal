import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export function validMetaSignature(body: Uint8Array, signature: string | null, secret: string): boolean {
  if(secret.length<16 || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature))return false;
  return timingSafeEqual(createHmac('sha256',secret).update(body).digest(),Buffer.from(signature.slice(7),'hex'));
}
export function verifyMetaSubscription(url: URL, expected: string): string | null {
  const token=url.searchParams.get('hub.verify_token'); const challenge=url.searchParams.get('hub.challenge');
  if(expected.length<32 || url.searchParams.get('hub.mode')!=='subscribe' || !token || token.length>256 || !challenge || !/^\d{1,100}$/.test(challenge))return null;
  return timingSafeEqual(createHash('sha256').update(token).digest(),createHash('sha256').update(expected).digest())?challenge:null;
}
const statusSchema=z.object({id:z.string().min(1).max(512),status:z.enum(['sent','delivered','read','failed']),timestamp:z.string().regex(/^\d{1,12}$/)});
const envelope=z.object({object:z.literal('whatsapp_business_account'),entry:z.array(z.object({id:z.string().regex(/^\d+$/),changes:z.array(z.object({field:z.string().max(100),value:z.object({metadata:z.object({phone_number_id:z.string().regex(/^\d+$/)}).optional(),statuses:z.array(statusSchema).max(1000).optional()})})).max(100)})).max(100)});
export interface MetaDeliveryEvent { messageHash:string; status:'sent'|'delivered'|'read'|'failed'; occurredAt:Date }
export function metaDeliveryEvents(raw: unknown, accountId:string, phoneId:string, now=Date.now()): MetaDeliveryEvent[] {
  if(!/^\d+$/.test(accountId)||!/^\d+$/.test(phoneId))throw new Error('META_CONFIGURATION');
  const data=envelope.parse(raw);const events:MetaDeliveryEvent[]=[];
  for(const entry of data.entry){
    if(entry.id!==accountId)continue;
    for(const change of entry.changes){
      if(change.field!=='messages'||change.value.metadata?.phone_number_id!==phoneId)continue;
      for(const status of change.value.statuses??[]){
        const ms=Number(status.timestamp)*1000;
        if(ms<now-30*86400000||ms>now+300000)continue;
        events.push({messageHash:createHash('sha256').update(status.id).digest('hex'),status:status.status,occurredAt:new Date(ms)});
        if(events.length>1000)throw new Error('META_BATCH_LIMIT');
      }
    }
  }
  return events;
}
