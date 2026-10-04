import 'server-only';
import type { Pool } from 'pg';
import { transaction } from './database';
import type { MetaDeliveryEvent } from './integrations/meta-webhook';
export async function saveMetaDelivery(db:Pool,events:MetaDeliveryEvent[]) {
  await transaction(db,async client=>{
    for(const event of events)await client.query('INSERT INTO leal_whatsapp.delivery_events(message_hash,status,occurred_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[event.messageHash,event.status,event.occurredAt]);
    await client.query("DELETE FROM leal_whatsapp.delivery_events WHERE received_at < now()-interval '30 days'");
  });
}
