import test from 'node:test';
import assert from 'node:assert/strict';
import type {ConnectionOptions,DetailedPeerCertificate} from 'node:tls';
import {databaseConfig} from '../src/server/database-config';
test('proxy certificate name override still verifies the configured DNS name and requires an explicit CA',()=>{
  const before={ca:process.env.DATABASE_CA_PEM,file:process.env.DATABASE_CA_FILE,name:process.env.DATABASE_TLS_SERVERNAME};
  try{
    delete process.env.DATABASE_CA_FILE;delete process.env.DATABASE_CA_PEM;process.env.DATABASE_TLS_SERVERNAME='localhost';
    assert.throws(()=>databaseConfig('postgres://test:test@proxy.test/test'),/authenticated CA/);
    process.env.DATABASE_CA_PEM='synthetic CA passed to TLS';
    const ssl=databaseConfig('postgres://test:test@proxy.test/test').ssl as ConnectionOptions;
    assert.equal(ssl.rejectUnauthorized,true);assert.equal(ssl.ca,process.env.DATABASE_CA_PEM);
    assert.equal(ssl.checkServerIdentity!('proxy.test',{subjectaltname:'DNS:localhost'} as DetailedPeerCertificate),undefined);
    assert.ok(ssl.checkServerIdentity!('proxy.test',{subjectaltname:'DNS:attacker.test'} as DetailedPeerCertificate) instanceof Error);
  }finally{for(const [key,value] of Object.entries({DATABASE_CA_PEM:before.ca,DATABASE_CA_FILE:before.file,DATABASE_TLS_SERVERNAME:before.name})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
