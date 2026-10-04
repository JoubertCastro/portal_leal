import test from 'node:test';
import assert from 'node:assert/strict';
import { homologationAllowed } from '../src/server/homologation';
import { SicGateway } from '../src/server/integrations/sic';
const now=Date.now();
const env={HOMOLOGATION_ENABLED:'true',HOMOLOGATION_ACCESS_KEY:'a'.repeat(43),HOMOLOGATION_DOCUMENT:'52998224725',HOMOLOGATION_EXPIRES_AT:new Date(now+3600000).toISOString()};
const input={key:'a'.repeat(43),code:'1234',document:'529.982.247-25'};
test('fixed code alone cannot authorize a test; document, key and bounded expiry are mandatory',()=>{
  assert.equal(homologationAllowed(input,env,now),true);
  for(const change of [{key:''},{key:'b'.repeat(43)},{code:'4321'},{document:'11144477735'}]) assert.equal(homologationAllowed({...input,...change},env,now),false);
  for(const change of [{HOMOLOGATION_ENABLED:'false'},{HOMOLOGATION_EXPIRES_AT:'invalid'},{HOMOLOGATION_EXPIRES_AT:new Date(now-1).toISOString()},{HOMOLOGATION_EXPIRES_AT:new Date(now+86400001).toISOString()}]) assert.equal(homologationAllowed(input,{...env,...change},now),false);
});
test('only documented no-agreements sentinel maps to an empty list',async()=>{
  const scope={document:'52998224725',identityKey:'TEST',internalIds:[1]};
  assert.deepEqual(await new SicGateway({get:async()=>({error:'Acordos não encontrados'})}).agreements(scope),[]);
  for(const response of [{error:'Internal error'},{error:'Acordos não encontrados',extra:true},null]) await assert.rejects(new SicGateway({get:async()=>response}).agreements(scope),/invalid_response/);
});
