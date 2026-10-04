import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { AnalyticsRepository } from '../src/server/analytics/repository';
import { signTrackingToken, verifyTrackingToken, subjectKey, trustedGeography, deviceContext } from '../src/server/analytics/privacy';
import { trackingBatch, serverTrackingEvent } from '../src/domain/tracking';
import { databaseConfig } from '../src/server/database-config';

test('browser cannot send personal data, server outcomes, journey IDs or financial counts',()=>{
  const event={id:randomUUID(),name:'document_completed',occurredAt:new Date().toISOString(),documentKind:'cpf'};
  assert.equal(trackingBatch.safeParse({events:[event]}).success,true);
  for(const patch of [{cpf:'52998224725'},{name:'registration_found'},{source:'server'},{debtCount:1},{journeyId:randomUUID()},{url:'https://example.test/?cpf=123'}])assert.equal(trackingBatch.safeParse({events:[{...event,...patch}]}).success,false);
  assert.equal(serverTrackingEvent.safeParse({id:randomUUID(),name:'registration_found',debtCount:0}).success,false);
  assert.equal(serverTrackingEvent.safeParse({id:randomUUID(),name:'portfolio_loaded',debtCount:0,agreementCount:1}).success,true);
});
test('signed identifiers bind purpose, expiry and version; document keys are keyed and normalized',()=>{
  process.env.ANALYTICS_COOKIE_SECRET='test-cookie-secret-at-least-32-bytes';process.env.ANALYTICS_SUBJECT_SECRET='test-subject-secret-at-least-32-bytes';
  const id=randomUUID();const value=signTrackingToken(id,'journey',60);
  assert.equal(verifyTrackingToken(value,'journey'),id);assert.equal(verifyTrackingToken(value,'consent'),null);
  assert.equal(verifyTrackingToken(value+'bad','journey'),null);assert.equal(verifyTrackingToken(signTrackingToken(id,'journey',-1),'journey'),null);
  const key=subjectKey('529.982.247-25');assert.match(key,/^v1:[a-f0-9]{64}$/);assert.equal(subjectKey('52998224725'),key);assert.ok(!key.includes('52998224725'));
  process.env.ANALYTICS_SUBJECT_SECRET='different-test-secret-at-least-32-bytes';assert.notEqual(subjectKey('52998224725'),key);
});
test('geolocation ignores untrusted headers, rounds trusted coordinates and never persists user agent',()=>{
  process.env.ANALYTICS_EDGE_SECRET='test-edge-secret-at-least-32-bytes';
  const h=new Headers({'x-leal-geo':JSON.stringify({country:'BR',region:'Distrito Federal',city:'Brasília',latitude:-15.793889,longitude:-47.882778})});
  assert.equal(trustedGeography(h),null);h.set('x-leal-edge-key',process.env.ANALYTICS_EDGE_SECRET);
  assert.deepEqual(trustedGeography(h),{country:'BR',region:'Distrito Federal',city:'Brasília',latitude:-15.8,longitude:-47.9});
  assert.deepEqual(deviceContext('Mozilla iPhone Mobile Safari'),{device:'mobile',browser:'safari'});
});
test('database TLS cannot be downgraded by connection string',()=>{
  assert.throws(()=>databaseConfig('postgres://example.test/db?sslmode=disable'));
  assert.equal((databaseConfig('postgres://example.test/db').ssl as {rejectUnauthorized:boolean}).rejectUnauthorized,true);
});

test('PostgreSQL migration and repository: consent, idempotency, funnels, isolation, withdrawal and retention',async()=>{
  const pg=new PGlite();
  try{
    await pg.exec(await readFile('migrations/001_analytics.sql','utf8'));
    const query=async(text:string,values?:unknown[])=>{const result=await pg.query(text,values);return {...result,rowCount:result.rows.length||result.affectedRows||0};};
    const db={query,connect:async()=>({query,release:()=>{}})} as unknown as Pool;
    const repo=new AnalyticsRepository(db);const consent=randomUUID();
    await assert.rejects(repo.start(consent,null,{referrerGroup:'direct'},new Headers()),/consent_required/);
    await repo.saveConsent(consent,true);
    const journey=await repo.start(consent,null,{referrerGroup:'direct',campaignCode:'unknown-campaign'},new Headers());
    assert.equal(await repo.start(consent,journey,{referrerGroup:'social'},new Headers()),journey);
    const event={id:randomUUID(),name:'document_completed' as const,occurredAt:new Date().toISOString(),documentKind:'cpf' as const};
    await repo.appendBrowser(consent,journey,[event]);await repo.appendBrowser(consent,journey,[event]);
    assert.equal((await pg.query<{n:number}>('SELECT count(*)::int AS n FROM leal_analytics.events')).rows[0].n,1);
    await pg.query("UPDATE leal_analytics.journeys SET last_seen_at=now()-interval '31 minutes' WHERE id=$1",[journey]);
    assert.equal((await pg.query<{outcome:string}>('SELECT outcome FROM leal_analytics.journey_funnel WHERE id=$1',[journey])).rows[0].outcome,'completed_not_submitted');
    await repo.appendBrowser(consent,journey,[{...event,id:randomUUID(),name:'access_unavailable'}]);
    await pg.query("UPDATE leal_analytics.journeys SET last_seen_at=now()-interval '31 minutes' WHERE id=$1",[journey]);
    assert.equal((await pg.query<{outcome:string}>('SELECT outcome FROM leal_analytics.journey_funnel WHERE id=$1',[journey])).rows[0].outcome,'service_unavailable');
    await assert.rejects(repo.appendBrowser(randomUUID(),journey,[event]),/consent_required/);
    await repo.appendServer(consent,journey,{id:randomUUID(),name:'portfolio_loaded',debtCount:0,agreementCount:1},{document:'52998224725',verified:true});
    const funnel=(await pg.query<{no_debt_returned:boolean;has_agreement:boolean}>('SELECT * FROM leal_analytics.journey_funnel WHERE id=$1',[journey])).rows[0];
    assert.equal(funnel.no_debt_returned,true);assert.equal(funnel.has_agreement,true);
    assert.equal((await pg.query('SELECT * FROM leal_analytics.access_map')).rows.length,0);
    await assert.rejects(repo.appendBrowser(consent,journey,[{...event,id:randomUUID(),occurredAt:'2000-01-01T00:00:00.000Z'}]),/invalid_event/);
    await repo.saveConsent(consent,false);assert.equal((await pg.query('SELECT * FROM leal_analytics.events')).rows.length,0);
    await assert.rejects(repo.appendBrowser(consent,journey,[event]),/consent_required/);
    await repo.saveConsent(consent,true);const stale=await repo.start(consent,null,{referrerGroup:'direct'},new Headers());
    await pg.query("UPDATE leal_analytics.journeys SET created_at=now()-interval '91 days' WHERE id=$1",[stale]);
    await pg.query("DELETE FROM leal_analytics.rate_limits WHERE key='retention-lease'");await repo.maintain();
    assert.equal((await pg.query('SELECT * FROM leal_analytics.journeys')).rows.length,0);
    await repo.limit('test',1,60);await assert.rejects(repo.limit('test',1,60),/rate_limited/);
  }finally{await pg.close();}
});
