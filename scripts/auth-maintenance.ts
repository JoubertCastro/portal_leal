import pg from 'pg';
import {databaseConfig} from '../src/server/database-config';
import {CustomerAuthStore} from '../src/server/customer-auth-store';
async function main(){
  const db=new pg.Pool(databaseConfig(process.env.DATABASE_URL??''));
  try{
    const store=new CustomerAuthStore(db,{send:async()=>{throw new Error('SENDING_DISABLED');}},process.env.AUTH_ENCRYPTION_KEY??'',process.env.AUTH_DIGEST_KEY??'');
    await store.maintain();
    await db.query("DELETE FROM leal_whatsapp.delivery_events WHERE received_at<now()-interval '30 days'");
    await db.query('SELECT leal_creditor.purge_abandoned_quotes()');
    console.log('Authentication retention completed.');
  }finally{await db.end();}
}
void main().catch(()=>{console.error('AUTH_RETENTION_FAILED');process.exitCode=1;});
