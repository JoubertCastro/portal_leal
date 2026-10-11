import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type {Pool} from 'pg';
import {AuditRepository,audited,auditedHttp,auditIdentity,auditOutcome,auditResource,classifyCall} from '../src/server/audit';
import {AnalyticsRepository} from '../src/server/analytics/repository';
import {browserTrackingEvent} from '../src/domain/tracking';
import {HEATMAP_LAYOUT,interactionIds} from '../src/domain/interaction-catalog';
const sample={control:interactionIds[0],layout:HEATMAP_LAYOUT,page:'portal' as const,section:'content' as const,screen:'inicio' as const,viewport:'large' as const,modality:'pointer' as const,elementX:50,elementY:50,pageX:20,pageY:30,scroll:10};
test('interaction input is closed, bounded and cannot forge business outcomes',()=>{
 const event={id:randomUUID(),name:'control_clicked',occurredAt:new Date().toISOString(),interaction:sample};
 assert.ok(browserTrackingEvent.safeParse(event).success);
 for(const patch of [{control:'CPF 52998224725'},{text:'private'},{elementX:101},{url:'https://private.test'}])assert.equal(browserTrackingEvent.safeParse({...event,interaction:{...sample,...patch}}).success,false);
 assert.equal(browserTrackingEvent.safeParse({...event,name:'agreement_confirmed'}).success,false);
 assert.equal(browserTrackingEvent.safeParse({...event,name:'human_handoff'}).success,false);
});
test('audit correlates concurrent actions, sanitizes calls, encrypts identities and records ambiguous failures',async()=>{
 process.env.AUTH_DIGEST_KEY='test-digest-key-at-least-32-characters';process.env.AUTH_ENCRYPTION_KEY='ab'.repeat(32);
 const pg=new PGlite();
 try{
 await pg.exec(await readFile('migrations/006_integration_audit.sql','utf8'));
 await pg.exec(await readFile('migrations/008_negotiation_report.sql','utf8'));
 const db={query:async(sql:string,values?:unknown[])=>pg.query(sql,values)} as unknown as Pool;
 const repo=new AuditRepository(db);const quote=randomUUID();
 await Promise.all(['portfolio','simulation'].map(action=>audited(action as 'portfolio'|'simulation',async()=>{
   await auditIdentity('52998224725',true,'CONTRACT-TEST','ARC4U');
   await auditedHttp('https://agreements-api.btgpactual.com/v2/negotiation/customers/52998224725/balance?secret=never',{headers:{Authorization:'Bearer never'}},async observe=>{observe(200);return {status:200};});
   await auditOutcome('success');
 },'private-session',repo)));
 await assert.rejects(audited('agreement_confirmation',async()=>{await auditResource(quote);await auditedHttp('https://agreements-api.btgpactual.com/v2/negotiation/customers/52998224725/agreements',{method:'POST',body:'private-payload'},async()=>{throw new Error('private-provider-response');});},undefined,repo));
 const actions=(await pg.query<{id:string;identity_cipher:string;subject_key:string;state:string}>('SELECT * FROM leal_audit.actions')).rows;
 assert.equal(actions.length,3);assert.equal(actions.filter(x=>x.state==='failed').length,1);
 assert.equal(actions[0].subject_key,actions[1].subject_key);assert.notEqual(actions[0].identity_cipher,actions[1].identity_cipher);
 const reports=(await pg.query<{trace_id:string}>('SELECT * FROM leal_audit.integration_report')).rows;
 assert.equal(new Set(reports.map(x=>x.trace_id)).size,3);
 for(const secret of ['52998224725','CONTRACT-TEST','private-session','private-provider-response','never','private-payload'])assert.ok(!JSON.stringify(reports).includes(secret));
 assert.equal((await pg.query('SELECT * FROM leal_audit.daily_integrations WHERE failed=1')).rows.length,1);
 for(let i=0;i<2;i++)await audited('agreement_confirmation',async()=>{await auditResource(quote);await auditOutcome('created');},undefined,repo);
 assert.equal((await pg.query('SELECT * FROM leal_audit.negotiations')).rows.length,1);
 let called=false;
 const broken={start:async()=>{throw new Error('offline');}} as unknown as AuditRepository;
 await assert.rejects(audited('simulation',async()=>{called=true;},undefined,broken));assert.equal(called,false);
 assert.equal(classifyCall('https://graph.facebook.com/v25.0/private/media','POST').endpoint,'/{version}/{phone_id}/media');
 }finally{await pg.close();}
});
test('interaction storage deduplicates, funnel counts journeys and withdrawal cascades',async()=>{
 const pg=new PGlite();try{
 for(const migration of ['001_analytics.sql','007_interaction_funnel.sql'])await pg.exec(await readFile('migrations/'+migration,'utf8'));
 const query=async(sql:string,values?:unknown[])=>{const r=await pg.query(sql,values);return {...r,rowCount:r.rows.length||r.affectedRows||0};};
 const db={query,connect:async()=>({query,release(){}})} as unknown as Pool;
 const repo=new AnalyticsRepository(db);const consent=randomUUID();await repo.saveConsent(consent,true);
 const journey=await repo.start(consent,null,{referrerGroup:'direct'},new Headers());
 const event=browserTrackingEvent.parse({id:randomUUID(),name:'control_clicked',occurredAt:new Date().toISOString(),interaction:sample});
 await repo.appendBrowser(consent,journey,[event]);await repo.appendBrowser(consent,journey,[event]);
 assert.equal((await pg.query<{clicks:number}>('SELECT clicks::int FROM leal_analytics.heatmap_cells')).rows[0].clicks,1);
 for(let i=0;i<2;i++)await repo.appendServer(consent,journey,{id:randomUUID(),name:'simulation_completed'});
 assert.equal((await pg.query<{simulated:number}>('SELECT simulated::int FROM leal_analytics.daily_funnel_v2')).rows[0].simulated,1);
 await repo.saveConsent(consent,false);assert.equal((await pg.query('SELECT * FROM leal_analytics.interactions')).rows.length,0);
 }finally{await pg.close();}
});
