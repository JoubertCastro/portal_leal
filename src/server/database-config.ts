import { readFileSync } from 'node:fs';
import type { PoolConfig } from 'pg';

// Shared by migration CLI and server. SSL URL options cannot override verification.
export function databaseConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || [...url.searchParams.keys()].some(key => key.startsWith('ssl'))) throw new Error('Invalid database configuration');
  return {
    connectionString, max: 5, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000,
    statement_timeout: 8000, query_timeout: 10000, application_name: 'leal-portal',
    ssl: { rejectUnauthorized: true, ...(process.env.DATABASE_CA_FILE ? { ca: readFileSync(process.env.DATABASE_CA_FILE, 'utf8') } : {}), ...(process.env.DATABASE_TLS_SERVERNAME ? { servername: process.env.DATABASE_TLS_SERVERNAME } : {}) },
  };
}
