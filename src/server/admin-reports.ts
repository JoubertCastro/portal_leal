import 'server-only';
import {z} from 'zod';
import type {Pool} from 'pg';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
export const reportInput=z.object({report:z.enum(['funnel','operations','integrations','performance','negotiations','timeline','heatmap','geography']),from:date,to:date,page:z.coerce.number().int().min(1).max(10000).default(1),provider:z.enum(['all','arc4','sic','meta']).default('all')}).strict().refine(v=>Date.parse(v.to)>Date.parse(v.from)&&Date.parse(v.to)-Date.parse(v.from)<=31*86400000);
export type ReportInput=z.infer<typeof reportInput>;
const sources={funnel:['leal_analytics.daily_funnel_v2','day'],operations:['leal_audit.operational_funnel','day'],integrations:['leal_audit.integration_report','started_at'],performance:['leal_audit.daily_integrations','day'],negotiations:['leal_audit.negotiations','first_confirmed_at'],timeline:['leal_analytics.timeline','received_at'],heatmap:['leal_analytics.heatmap_cells','day'],geography:['leal_analytics.journey_funnel_v2','created_at']} as const;
export async function adminReport(db:Pool,input:ReportInput){
 const [source,time]=sources[input.report];const isDay=time==='day';const values:unknown[]=[input.from,input.to];
 let where=`${time} >= $1::date${isDay?'':" AT TIME ZONE 'America/Sao_Paulo'"} AND ${time} < $2::date${isDay?'':" AT TIME ZONE 'America/Sao_Paulo'"}`;
 if(['integrations','performance'].includes(input.report)&&input.provider!=='all'){values.push(input.provider);where+=' AND provider=$3';}
 // Geography is aggregated only, never an individual customer location table.
 const query=input.report==='geography'?`SELECT country,region,city,latitude,longitude,count(*) AS journeys FROM leal_analytics.journeys WHERE ${where} AND geo_source='trusted_edge' GROUP BY country,region,city,latitude,longitude HAVING count(DISTINCT consent_id)>=5`:`SELECT * FROM ${source} WHERE ${where}`;
 values.push((input.page-1)*100);
 const result=await db.query(`SELECT * FROM (${query}) report ORDER BY ${input.report==='geography'?'journeys DESC':time+' DESC'},to_jsonb(report)::text LIMIT 101 OFFSET $${values.length}`,values);
 let summary:Record<string,number>|undefined;
 if(input.report==='funnel'){
  const totals=await db.query(`SELECT sum(consented_journeys)::int AS consented_journeys,sum(submitted)::int AS submitted,sum(found)::int AS found,sum(with_debts)::int AS with_debts,sum(simulated)::int AS simulated,sum(negotiated)::int AS negotiated,sum(human_handoff)::int AS human_handoff FROM (${query}) total`,[input.from,input.to]);
  summary=Object.fromEntries(Object.entries(totals.rows[0]).map(([k,v])=>[k,Number(v??0)]));
 }
 return {columns:result.fields.map(f=>f.name),rows:result.rows.slice(0,100),hasMore:result.rows.length>100,page:input.page,summary};
}
