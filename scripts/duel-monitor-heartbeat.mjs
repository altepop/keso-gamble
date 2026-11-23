/** P12 independent heartbeat for the hourly duel deployment monitor.
 * Reads GitHub Actions run metadata only. No Cloudflare/D1/KP operations.
 */
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const MONITOR_WORKFLOW='P12 duel deployment health (read-only)';
export const HEARTBEAT_MAX_AGE_MS=4*60*60*1000;
export const HEARTBEAT_RUN_GRACE_MS=45*60*1000;
export function evaluateMonitorHeartbeat(runs,now=Date.now()){
 if(!Array.isArray(runs)||!Number.isSafeInteger(now)||now<0)throw Error('Invalid monitor heartbeat input');
 const list=runs.filter(r=>r&&r.name===MONITOR_WORKFLOW&&r.event==='schedule'&&
  Number.isSafeInteger(r.id)&&r.id>0&&typeof r.created_at==='string'&&
  Number.isFinite(Date.parse(r.created_at))&&Date.parse(r.created_at)<=now)
  .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id-a.id);
 const latest=list[0];
 if(!latest)return {state:'missing',ok:false,runId:null,ageMinutes:null};
 const age=now-Date.parse(latest.created_at);
 const id=latest.id,minutes=Math.floor(age/60000);
 if(age>HEARTBEAT_MAX_AGE_MS)return {state:'stale',ok:false,runId:id,ageMinutes:minutes};
 if(latest.status!=='completed')return {state:age>HEARTBEAT_RUN_GRACE_MS?'stalled':'running',ok:age<=HEARTBEAT_RUN_GRACE_MS,runId:id,ageMinutes:minutes};
 if(latest.conclusion!=='success')return {state:'failed',ok:false,runId:id,ageMinutes:minutes};
 return {state:'healthy',ok:true,runId:id,ageMinutes:minutes};
}
export async function inspectMonitorHeartbeat(env=process.env,request=fetch,now=Date.now()){
 if(!env.GITHUB_TOKEN||env.GITHUB_REPOSITORY!=='altepop/keso-gamble')
  throw Error('Authorized GitHub Actions read access unavailable');
 const url='https://api.github.com/repos/altepop/keso-gamble/actions/workflows/duel-deployment-watch.yml/runs?event=schedule&per_page=10';
 const res=await request(url,{headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,
  Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw Error('Actions heartbeat metadata unavailable (HTTP '+res.status+')');
 const data=await res.json();
 if(!Array.isArray(data?.workflow_runs))throw Error('Unexpected GitHub Actions heartbeat response');
 return evaluateMonitorHeartbeat(data.workflow_runs,now);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 inspectMonitorHeartbeat().then(async result=>{
  if(process.env.DUEL_HEARTBEAT_REPORT){
   const {writeFileSync}=await import('node:fs');
   writeFileSync(process.env.DUEL_HEARTBEAT_REPORT,JSON.stringify(result),{mode:0o600});
  }
  console.log('DUEL_MONITOR_HEARTBEAT '+JSON.stringify(result));
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   '# P12 duel monitor heartbeat (read-only)\n\n'+
   '| State | '+result.state+' |\n| Run ID | '+(result.runId??'none')+
   ' |\n| Age minutes | '+(result.ageMinutes??'unknown')+' |\n\n'+
   'No D1, KP or Cloudflare operations. GitHub scheduled runs may be delayed or skipped.\n');
  if(!result.ok)process.exitCode=1;
 }).catch(e=>{
  // Monitoring blindness is actionable even when the source API cannot respond.
  // Do not forward untrusted API response bodies, bearer tokens, or raw errors
  // into the retained report or issue.
  if(process.env.DUEL_HEARTBEAT_REPORT){
   const {writeFileSync}=await import('node:fs');
   writeFileSync(process.env.DUEL_HEARTBEAT_REPORT,
    JSON.stringify({state:'unknown',ok:false,runId:null,ageMinutes:null}),{mode:0o600});
  }
  console.error('DUEL_MONITOR_HEARTBEAT_UNAVAILABLE: monitor metadata could not be verified');
  process.exitCode=1;
 });
}
