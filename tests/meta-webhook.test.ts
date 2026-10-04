import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { metaDeliveryEvents, validMetaSignature, verifyMetaSubscription } from '../src/server/integrations/meta-webhook';
import { saveMetaDelivery } from '../src/server/whatsapp-delivery';
const now=Date.now();
const payload={object:'whatsapp_business_account',entry:[{id:'100',changes:[{field:'messages',value:{metadata:{phone_number_id:'200'},statuses:[{id:'wamid.synthetic',status:'delivered',timestamp:String(Math.floor(now/1000)),recipient_id:'sensitive',errors:[{message:'private'}]}]}}]}]};
test('Meta signature binds exact raw bytes and rejects forged or missing signatures',()=>{
  const body=Buffer.from(JSON.stringify(payload));const secret='synthetic-app-secret-long-enough';
  const sig='sha256='+createHmac('sha256',secret).update(body).digest('hex');
  assert.equal(validMetaSignature(body,sig,secret),true);
  assert.equal(validMetaSignature(Buffer.concat([body,Buffer.from(' ')]),sig,secret),false);
  for(const bad of [null,'sha256=00','sha1='+'a'.repeat(64)])assert.equal(validMetaSignature(body,bad,secret),false);
});
test('subscription verification requires configured token and expected mode',()=>{
  const secret='x'.repeat(43);const url=new URL('https://portal.test/api/webhooks/whatsapp');
  url.search=new URLSearchParams({'hub.mode':'subscribe','hub.challenge':'123','hub.verify_token':secret}).toString();
  assert.equal(verifyMetaSubscription(url,secret),'123');
  assert.equal(verifyMetaSubscription(url,'z'.repeat(43)),null);
  url.searchParams.set('hub.mode','unsubscribe');assert.equal(verifyMetaSubscription(url,secret),null);
});
test('delivery events restrict account and number and discard private fields',()=>{
  const events=metaDeliveryEvents(payload,'100','200',now);
  assert.equal(events.length,1);assert.deepEqual(Object.keys(events[0]),['messageHash','status','occurredAt']);
  assert.match(events[0].messageHash,/^[a-f0-9]{64}$/);
  assert.equal(metaDeliveryEvents(payload,'101','200',now).length,0);
  assert.equal(metaDeliveryEvents(payload,'100','201',now).length,0);
  assert.equal(metaDeliveryEvents(payload,'100','200',now+31*86400000).length,0);
  assert.ok(!JSON.stringify(events).includes('sensitive'));
});
test('delivery persistence is idempotent and retains out-of-order statuses independently',async()=>{
  const pg=new PGlite();try{
    await pg.exec(await readFile('migrations/002_whatsapp.sql','utf8'));
    const query=async(text:string,values?:unknown[])=>pg.query(text,values);
    const db={connect:async()=>({query,release:()=>{}})} as unknown as Pool;
    const events=metaDeliveryEvents(payload,'100','200',now);
    await saveMetaDelivery(db,events);await saveMetaDelivery(db,events);
    await saveMetaDelivery(db,[{...events[0],status:'sent',occurredAt:new Date(now-10000)}]);
    assert.equal((await pg.query<{n:number}>('SELECT count(*)::int AS n FROM leal_whatsapp.delivery_events')).rows[0].n,2);
    await pg.query("UPDATE leal_whatsapp.delivery_events SET received_at=now()-interval '31 days'");
    await saveMetaDelivery(db,[]);
    assert.equal((await pg.query<{n:number}>('SELECT count(*)::int AS n FROM leal_whatsapp.delivery_events')).rows[0].n,0);
  }finally{await pg.close();}
});
