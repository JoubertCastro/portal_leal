import pg from 'pg';
import {databaseConfig} from '../src/server/database-config';
import {adminPhone,adminDigest} from '../src/server/admin-auth';
async function main(){
 const phone=adminPhone(process.argv[2]??'');const db=new pg.Client(databaseConfig(process.env.DATABASE_ADMIN_URL??''));
 try{await db.connect();await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(71309029)');
 const existing=await db.query('SELECT bootstrap_phone_key,password_hash FROM leal_admin.account WHERE id=1');
 if(existing.rowCount){if(existing.rows[0].password_hash||existing.rows[0].bootstrap_phone_key!==adminDigest('phone:'+phone))throw new Error('ALREADY_PROVISIONED');}
 else await db.query('INSERT INTO leal_admin.account(id,bootstrap_phone_key) VALUES(1,$1)',[adminDigest('phone:'+phone)]);
 await db.query('COMMIT');console.log('Administrator enrollment prepared. Initial credentials only unlock phone verification and password replacement.');
 }catch{await db.query('ROLLBACK').catch(()=>{});console.error('ADMIN_PROVISION_FAILED');process.exitCode=1;}finally{await db.end();}
}
void main().catch(()=>{console.error('ADMIN_PROVISION_CONFIGURATION_INVALID');process.exitCode=1;});
