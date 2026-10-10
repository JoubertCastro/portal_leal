import { readFile, readdir, appendFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { databaseConfig } from '../src/server/database-config';

async function main(){
const client = new pg.Client(databaseConfig(process.env.DATABASE_ADMIN_URL ?? ''));
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(71309028)');
  await client.query('CREATE SCHEMA IF NOT EXISTS leal_migrations');
  await client.query('REVOKE ALL ON SCHEMA leal_migrations FROM PUBLIC');
  await client.query('CREATE TABLE IF NOT EXISTS leal_migrations.applied (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const name of (await readdir('migrations')).filter(name => /^\d+_[a-z_]+\.sql$/.test(name)).sort()) {
    const sql = await readFile(`migrations/${name}`, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await client.query('SELECT checksum FROM leal_migrations.applied WHERE name=$1', [name]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error('MIGRATION_CHECKSUM_MISMATCH');
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO leal_migrations.applied(name,checksum) VALUES($1,$2)', [name, checksum]);
    console.log(`Applied ${name}`);
  }
  let runtimeUrl: string | undefined;
  if (process.argv.includes('--provision')) {
    if (!(await client.query("SELECT 1 FROM pg_roles WHERE rolname='leal_portal_runtime'")).rowCount) {
      const password = randomBytes(32).toString('hex');
      // Fixed identifier and locally generated hex: no untrusted SQL interpolation.
      await client.query(`CREATE ROLE leal_portal_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 15`);
      const url = new URL(process.env.DATABASE_ADMIN_URL!); url.username = 'leal_portal_runtime'; url.password = password; runtimeUrl = url.href;
    }
    await client.query('GRANT USAGE ON SCHEMA leal_analytics TO leal_portal_runtime');
    await client.query('GRANT SELECT,INSERT,UPDATE,DELETE ON leal_analytics.consents,leal_analytics.journeys,leal_analytics.rate_limits TO leal_portal_runtime');
    await client.query('GRANT SELECT,INSERT ON leal_analytics.events,leal_analytics.consent_history TO leal_portal_runtime');
    await client.query('GRANT SELECT ON leal_analytics.campaigns TO leal_portal_runtime');
    await client.query('GRANT USAGE ON ALL SEQUENCES IN SCHEMA leal_analytics TO leal_portal_runtime');
    await client.query('GRANT USAGE ON SCHEMA leal_whatsapp TO leal_portal_runtime');
    await client.query('GRANT SELECT,INSERT,DELETE ON leal_whatsapp.delivery_events TO leal_portal_runtime');
    await client.query('GRANT USAGE ON SCHEMA leal_auth TO leal_portal_runtime');
    await client.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA leal_auth TO leal_portal_runtime');
    await client.query('GRANT USAGE ON SCHEMA leal_creditor TO leal_portal_runtime');
    await client.query('GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA leal_creditor TO leal_portal_runtime');
    await client.query('GRANT EXECUTE ON FUNCTION leal_creditor.purge_abandoned_quotes() TO leal_portal_runtime');
    if (!(await client.query("SELECT 1 FROM pg_roles WHERE rolname='leal_analytics_reader'")).rowCount) await client.query('CREATE ROLE leal_analytics_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE');
    await client.query('GRANT USAGE ON SCHEMA leal_analytics TO leal_analytics_reader');
    await client.query('GRANT SELECT ON leal_analytics.daily_funnel,leal_analytics.journey_funnel,leal_analytics.access_map,leal_analytics.timeline,leal_analytics.campaign_funnel TO leal_analytics_reader');
  }
  // Save the new app credential before commit; on failure the role is rolled back.
  if (runtimeUrl) await appendFile('.env.local', `\nDATABASE_URL=${runtimeUrl}\nANALYTICS_ENABLED=false\nANALYTICS_COOKIE_SECRET=${randomBytes(32).toString('hex')}\nANALYTICS_SUBJECT_SECRET=${randomBytes(32).toString('hex')}\n`);
  await client.query('COMMIT');
  console.log('Database migrations complete. No credentials printed.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Migration failed:', typeof error === 'object' && error && 'code' in error ? String(error.code) : 'CONFIGURATION_OR_MIGRATION_ERROR');
  process.exitCode = 1;
} finally { await client.end(); }
}
void main().catch(()=>{console.error('MIGRATION_CONFIGURATION_ERROR');process.exitCode=1;});
