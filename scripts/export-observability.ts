import pg from 'pg';
import {mkdir,writeFile} from 'node:fs/promises';
import {databaseConfig} from '../src/server/database-config';
const views={negotiations:'leal_audit.negotiations',integrations:'leal_audit.integration_report',operations:'leal_audit.operational_funnel',funnel:'leal_analytics.daily_funnel_v2',heatmap:'leal_analytics.heatmap_cells'} as const;
function cell(value:unknown){let s=value instanceof Date?value.toISOString():value==null?'':String(value);if(/^[=+@\-\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
async function main(){
 const [kind,from,to,provider]=process.argv.slice(2);
 if(!(kind in views)||![from,to].every(v=>/^\d{4}-\d{2}-\d{2}$/.test(v??'')&&Number.isFinite(Date.parse(v)))||Date.parse(to)<=Date.parse(from)||Date.parse(to)-Date.parse(from)>31*86400000)throw new Error('INVALID_ARGUMENTS');
 if(kind==='integrations'&&!['arc4','sic','meta'].includes(provider))throw new Error('PROVIDER_REQUIRED');
 const pool=new pg.Pool(databaseConfig(process.env.DATABASE_REPORT_URL??process.env.DATABASE_ADMIN_URL??''));
 try{
 const view=views[kind as keyof typeof views];
 const where=kind==='negotiations'?"first_confirmed_at >= $1::date AT TIME ZONE 'America/Sao_Paulo' AND first_confirmed_at < $2::date AT TIME ZONE 'America/Sao_Paulo'":kind==='integrations'?"started_at >= $1::date AT TIME ZONE 'America/Sao_Paulo' AND started_at < $2::date AT TIME ZONE 'America/Sao_Paulo' AND provider=$3":"day >= $1::date AND day < $2::date";
 const result=await pool.query(`SELECT * FROM ${view} WHERE ${where} LIMIT 100001`,kind==='integrations'?[from,to,provider]:[from,to]);
 if(result.rows.length>100000)throw new Error('REDUCE_DATE_RANGE');
 const columns=result.fields.map(f=>f.name);const csv=[columns.map(cell).join(','),...result.rows.map(row=>columns.map(c=>cell(row[c])).join(','))].join('\r\n');
 await mkdir('exports',{recursive:true});const path=`exports/${kind}-${from}-${to}-${Date.now()}.csv`;
 await writeFile(path,'\uFEFF'+csv,{flag:'wx',mode:0o600});console.log(`Exported ${result.rows.length} rows to ${path}.`);
 }finally{await pool.end();}
}
void main().catch(()=>{console.error('EXPORT_FAILED: verify arguments, permissions and date range (max 31 days).');process.exitCode=1;});
