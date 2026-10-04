import 'server-only';
import { Pool, type PoolClient } from 'pg';
import { databaseConfig } from './database-config';
let pool: Pool | undefined;
export function getDatabase(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('Database unavailable');
  if (!pool) {
    pool = new Pool(databaseConfig(process.env.DATABASE_URL));
    pool.on('error', () => { console.error('DATABASE_POOL_UNAVAILABLE'); });
  }
  return pool;
}
export async function transaction<T>(db: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
