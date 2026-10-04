import { readFileSync } from 'node:fs';
import { checkServerIdentity } from 'node:tls';
import type { PoolConfig } from 'pg';

// Shared by migration CLI and server. SSL URL options cannot override verification.
export function databaseConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || [...url.searchParams.keys()].some(key => key.startsWith('ssl'))) throw new Error('Invalid database configuration');
  const ca=process.env.DATABASE_CA_PEM || (process.env.DATABASE_CA_FILE?readFileSync(process.env.DATABASE_CA_FILE,'utf8'):undefined);
  const expectedName=process.env.DATABASE_TLS_SERVERNAME;
  if(expectedName && (!ca || !/^[A-Za-z0-9.-]+$/.test(expectedName)))throw new Error('An authenticated CA is required for a certificate name override');
  return {
    connectionString, max: 5, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000,
    statement_timeout: 8000, query_timeout: 10000, application_name: 'leal-portal',
    // pg overwrites TLS servername with the TCP proxy host. Keep normal chain
    // verification and explicitly verify the authenticated certificate DNS name.
    ssl: { rejectUnauthorized: true, ...(ca?{ca}:{}), ...(expectedName?{checkServerIdentity:(_host,cert)=>checkServerIdentity(expectedName,cert)}:{}) },
  };
}
