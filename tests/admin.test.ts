import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type {Pool} from 'pg';
import {AdminAuth,adminDigest} from '../src/server/admin-auth';
import {adminReport,reportInput} from '../src/server/admin-reports';
test('admin initial credentials cannot access reports, enroll another phone, or survive activation; all subsequent logins require OTP',async()=>{
 process.env.AUTH_DIGEST_KEY='test-admin-digest-key-at-least-32-characters';process.env.AUTH_ENCRYPTION_KEY='cd'.repeat(32);
 const pg=new PGlite();try{
 await pg.exec(await readFile('migrations/009_admin.sql','utf8'));
 const query=async(sql:string,values?:unknown[])=>{const r=await pg.query(sql,values);return {...r,rowCount:r.rows.length||r.affectedRows||0};};
 const db={query,connect:async()=>({query,release(){}})} as unknown as Pool;
 await query('INSERT INTO leal_admin.account(id,bootstrap_phone_key) VALUES(1,$1)',[adminDigest('phone:+5511999999999')]);
 let code='',destination='';const admin=new AdminAuth(db,{send:async(to,c)=>{code=c;destination=to;return {messageId:'fake'};}});
 const token=await admin.login('admin','admin');const competing=await admin.login('admin','admin');
 assert.equal((await admin.status(token)).stage,'setup');await assert.rejects(admin.require(token),/expired/);
 await assert.rejects(admin.send(token,{password:'long-unique-password',phone:'11988888888'}),/invalid/);
 await assert.rejects(admin.send(token,{password:'short',phone:'11999999999'}),/invalid/);
 await admin.send(token,{password:'long-unique-password',phone:'11999999999'});assert.equal(destination,'+5511999999999');
 assert.equal(((await query('SELECT password_hash FROM leal_admin.account')).rows[0] as {password_hash:string|null}).password_hash,null);
 await assert.rejects(admin.require(token),/expired/);await assert.rejects(admin.verify(token,'000000'),/invalid/);
 const verified=await admin.verify(token,code);assert.equal((await admin.require(verified)).stage,'verified');
 await assert.rejects(admin.status(competing),/expired/);await assert.rejects(admin.verify(token,code),/expired/);await assert.rejects(admin.login('admin','admin'),/invalid/);
 const stored=(await query('SELECT password_hash,phone_cipher FROM leal_admin.account')).rows[0] as {password_hash:string;phone_cipher:string};assert.ok(!stored.password_hash.includes('long-unique-password'));assert.ok(!stored.phone_cipher.includes('11999999999'));
 const second=await admin.login('admin','long-unique-password');assert.equal((await admin.status(second)).stage,'otp');await assert.rejects(admin.require(second),/expired/);
 await admin.send(second);for(let i=0;i<5;i++)await assert.rejects(admin.verify(second,'000000'),/invalid/);await assert.rejects(admin.verify(second,code),/invalid/);
 await admin.logout(verified);await assert.rejects(admin.require(verified),/expired/);
 }finally{await pg.close();}
});
test('admin reports constrain dates and datasets, paginate, aggregate complete period and suppress sparse geography',async()=>{
 assert.equal(reportInput.safeParse({report:'account',from:'2026-10-01',to:'2026-10-10'}).success,false);
 assert.equal(reportInput.safeParse({report:'funnel',from:'2026-02-30',to:'2026-03-04'}).success,false);
 assert.equal(reportInput.safeParse({report:'funnel',from:'2026-01-01',to:'2026-10-10'}).success,false);
 const pg=new PGlite();try{
 for(const name of ['001_analytics.sql','006_integration_audit.sql','007_interaction_funnel.sql','008_negotiation_report.sql'])await pg.exec(await readFile('migrations/'+name,'utf8'));
 const db={query:(sql:string,values?:unknown[])=>pg.query(sql,values)} as unknown as Pool;
 for(const report of ['funnel','operations','integrations','performance','negotiations','timeline','heatmap','geography']){
 const input=reportInput.parse({report,from:'2026-10-01',to:'2026-10-11'});const result=await adminReport(db,input);assert.deepEqual(result.rows,[]);assert.equal(result.hasMore,false);
 if(report==='funnel')assert.equal(result.summary?.consented_journeys,0);
 }
 }finally{await pg.close();}
});
