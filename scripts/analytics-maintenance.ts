import pg from 'pg';
import { databaseConfig } from '../src/server/database-config';
import { AnalyticsRepository } from '../src/server/analytics/repository';
async function main(){
const pool=new pg.Pool(databaseConfig(process.env.DATABASE_URL??''));
try{await new AnalyticsRepository(pool).maintain();console.log('Analytics retention completed.');}
catch{console.error('ANALYTICS_RETENTION_FAILED');process.exitCode=1;}
finally{await pool.end();}
}
void main().catch(()=>{console.error('ANALYTICS_CONFIGURATION_ERROR');process.exitCode=1;});
