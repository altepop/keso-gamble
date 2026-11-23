/** P12 periodic duel audit. Exactly two aggregated SELECTs from production D1.
 * No live mutations, KP settlement, personal rows, raw SQL or identifiers in output.
 * The counts are across guilds in the single configured KESO PLAY D1; per-guild
 * tenant diagnostics remain the responsibility of duelOperationsAudit().
 */
import {appendFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {D1_PRODUCTION_ID} from './duel-d1-backup.mjs';

const DAY_MS=86_400_000;
export function duelAuditQueries(now=Date.now()){
 if(!Number.isSafeInteger(now)||now<90*DAY_MS)throw Error('Invalid audit clock');
 return [
  {kind:'pve',sql:"SELECT COALESCE(SUM(CASE WHEN turn='finished' AND updated_at<? THEN 1 ELSE 0 END),0) AS stale, COALESCE(SUM(CASE WHEN turn='human' THEN 1 ELSE 0 END),0) AS active FROM kp_duel_pve_sessions",params:[now-90*DAY_MS]},
  {kind:'pvp',sql:"SELECT COALESCE(SUM(CASE WHEN status IN ('finished','cancelled') AND updated_at<? THEN 1 ELSE 0 END),0) AS stale, COALESCE(SUM(CASE WHEN status IN ('active','pending') THEN 1 ELSE 0 END),0) AS active FROM kp_board_duels",params:[now-30*DAY_MS]}
 ];
}
function validCount(value){
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
}
export async function auditDuelOperations(env=process.env,request=fetch,now=Date.now()){
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[0-9a-f]{32}$/i.test(account||'')||!token)throw Error('D1 read-only audit credentials unavailable');
 const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+D1_PRODUCTION_ID+'/query';
 const rows=[];
 for(const item of duelAuditQueries(now)){
  // Static, allowlisted SELECT only; never execute caller-provided SQL.
  if(!/^SELECT\b/i.test(item.sql))throw Error('Audit query not read-only');
  const response=await request(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({sql:item.sql,params:item.params}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('D1 read-only audit HTTP '+response.status);
  const data=await response.json();
  if(data?.success!==true||!Array.isArray(data.result)||data.result.length!==1||
     data.result[0]?.success!==true||!Array.isArray(data.result[0]?.results)||
     data.result[0].results.length!==1)throw Error('D1 audit aggregate response invalid');
  const itemRow=data.result[0].results[0];
  const stale=validCount(itemRow?.stale),active=validCount(itemRow?.active);
  if(stale===null||active===null)throw Error('D1 audit aggregate count invalid');
  rows.push({kind:item.kind,stale,active});
 }
 const counts={staleFinishedPve:rows[0].stale,staleFinishedPvp:rows[1].stale,
  activePve:rows[0].active,activePvp:rows[1].active};
 return {asOf:now,retentionReviewDays:90,pvpRetentionReviewDays:30,counts,
  reviewRecommended:counts.staleFinishedPve+counts.staleFinishedPvp>0,deletionAuthorized:false,
  scope:'all-guild aggregate counts (no individual records)'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 auditDuelOperations().then(result=>{
  if(process.env.DUEL_OPERATIONS_AUDIT_REPORT)
   writeFileSync(process.env.DUEL_OPERATIONS_AUDIT_REPORT,JSON.stringify({
    state:result.reviewRecommended?'review':'healthy',ok:true,
    asOf:result.asOf,counts:result.counts,
    deletionAuthorized:false
   }),{mode:0o600});
  const summary={dateJst:new Date(result.asOf+9*60*60*1000).toISOString().slice(0,10),
   ...result.counts,reviewRecommended:result.reviewRecommended,deletionAuthorized:false};
  console.log('DUEL_OPERATIONS_AUDIT_OK '+JSON.stringify(summary));
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,[
   '# P12 scheduled duel operations audit (read-only)','',
   '| Metric | Aggregate |','|---|---:|',
   '| PVE finished older than 90 days | '+summary.staleFinishedPve+' |',
   '| PVP ended older than 30 days | '+summary.staleFinishedPvp+' |',
   '| Active PVE | '+summary.activePve+' |',
   '| Active PVP | '+summary.activePvp+' |',
   '| Review recommended | '+result.reviewRecommended+' |','',
   'No D1 writes, no KP changes, no deletion authorization. Counts are across guilds; no identifiers or private records are exported.',''
  ].join('\n'));
 }).catch(error=>{
  if(process.env.DUEL_OPERATIONS_AUDIT_REPORT)
   writeFileSync(process.env.DUEL_OPERATIONS_AUDIT_REPORT,JSON.stringify({
    state:'unknown',ok:false,counts:null,deletionAuthorized:false
   }),{mode:0o600});
  console.error('DUEL_OPERATIONS_AUDIT_UNAVAILABLE '+error.message);
  process.exitCode=1;
 });
}
