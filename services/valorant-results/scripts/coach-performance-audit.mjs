import {coachMemberCoverage} from '../src/coach-member-archive.ts';
import {readFileSync} from 'node:fs';
import {readCoachMemberReport} from '../src/coach-member-report.ts';
export function readOnlyCoachDb(query){
 const state={queries:0,rowsRead:0,rowsReadKnown:true};
 const prepare=(sql,params=[])=>{
  if(!/^\s*SELECT\b/i.test(sql)||sql.includes(';'))throw Error('read_only_select_required');
  const all=async()=>{const r=await query(sql,params);state.queries++;if(Number.isSafeInteger(r.rowsRead)&&r.rowsRead>=0)state.rowsRead+=r.rowsRead;else state.rowsReadKnown=false;return {results:r.rows};};
  return {bind:(...p)=>prepare(sql,p),all,first:async()=> (await all()).results[0]??null};
 };
 return {prepare,state};
}
export async function auditPerformance(db){
 const people=[],coverage=await coachMemberCoverage(db);
 for(const person of ['神戸','VDK','石原','藤村','小林']){
  const before={...db.state},r=await readCoachMemberReport(db,person,coverage),p=r.performance;
  people.push({person,archiveMatches:r.archivedMatches,roundAnalysisMatches:r.usableMatches,performanceMatches:p.overall.matches,
   kdMatches:p.overall.kdMatches,kprMatches:p.overall.rateBases.kpr.matches,dprMatches:p.overall.rateBases.dpr.matches,aprMatches:p.overall.rateBases.apr.matches,acsMatches:p.overall.acsMatches,hsMatches:p.overall.hitMatches,
   roundContributionMatches:r.roundContribution.quality.validMatches,
   coverage:{enabled:r.coverage.enabled,discovered:r.coverage.discovered,pending:r.coverage.pending,unavailable:r.coverage.unavailable,partial:r.coverage.partial},
   excluded:p.quality.excluded,queries:db.state.queries-before.queries,rowsRead:before.rowsReadKnown&&db.state.rowsReadKnown?db.state.rowsRead-before.rowsRead:null});
 }
 const schemas=await db.prepare("SELECT json_extract(CASE WHEN json_valid(players_json) THEN players_json ELSE '[]' END,'$[0].sourceFields') AS fields FROM valorant_match_rosters WHERE rowid>(SELECT COALESCE(MAX(rowid),0)-32 FROM valorant_match_rosters)").all();
 const evidence=schemas.results.flatMap(r=>{try{const f=JSON.parse(r.fields);return f?.contract==='henrik-v4-direct'?[f]:[];}catch{return [];}});
 const directProviderFields={responses:evidence.length};
 for(const key of ['kills','deaths','assists','score','headshots','bodyshots','legshots','statsDamageDealt','statsDamageReceived','statsDamageMade','roundPlayers','roundPlayerStats','killAssistants','damageEvents','roundPlant','roundDefuse'])directProviderFields[key]=evidence.filter(f=>Number.isSafeInteger(f[key])&&f[key]>0&&f[key]<=10).length;
 return {people,directProviderFields,queries:db.state.queries,rowsRead:db.state.rowsReadKnown?db.state.rowsRead:null,mutations:0};
}
if(process.argv[1]?.endsWith('/coach-performance-audit.mjs')){
 try{
  const config=JSON.parse(readFileSync('wrangler.jsonc','utf8')),binding=config.d1_databases?.find(b=>b.binding==='DB'),env=process.env;
  if(config.name!=='valorant-results'||!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!/^[a-f0-9-]{36}$/i.test(binding?.database_id??'')||!env.CLOUDFLARE_API_TOKEN)throw Error('config');
  const db=readOnlyCoachDb(async(sql,params)=>{
   const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+binding.database_id+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),redirect:'error',signal:AbortSignal.timeout(30000)});
   if(!r.ok)throw Error('read');const b=await r.json(),q=b.result?.[0];if(!b.success||!q?.success)throw Error('read');return {rows:q.results??[],rowsRead:q.meta?.rows_read};
  });
  console.log('COACH_PERFORMANCE_AUDIT '+JSON.stringify(await auditPerformance(db)));
 }catch{console.error('COACH_PERFORMANCE_AUDIT_FAILED (no SQL, identifiers or raw errors logged)');process.exitCode=1;}
}
