/** Independent P12 watchdog: scheduled backup retention assessment must actually run.
 * GitHub Actions metadata only. Does not claim that any backup artifact is valid.
 */
import {appendFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const WATCHED_WORKFLOW='P12 duel retained encrypted backup readiness';
export const MAX_AGE_MS=28*60*60*1000;
export const RUN_GRACE_MS=90*60*1000;
export function evaluateBackupSchedule(runs,now=Date.now()){
 if(!Array.isArray(runs)||!Number.isSafeInteger(now)||now<0)
  throw Error('Invalid backup schedule inventory');
 const scheduled=runs.filter(r=>r?.name===WATCHED_WORKFLOW&&r.event==='schedule'&&
  Number.isSafeInteger(r.id)&&r.id>0&&typeof r.created_at==='string'&&
  Number.isFinite(Date.parse(r.created_at))&&Date.parse(r.created_at)<=now)
  .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id-a.id);
 if(!scheduled.length)return {state:'missing',ok:false,runId:null,ageMinutes:null};
 const run=scheduled[0],age=now-Date.parse(run.created_at);
 const basic={runId:run.id,ageMinutes:Math.floor(age/60000)};
 if(age>MAX_AGE_MS)return {state:'stale',ok:false,...basic};
 if(run.status!=='completed')
  return {state:age<=RUN_GRACE_MS?'running':'stalled',ok:age<=RUN_GRACE_MS,...basic};
 // An assessment that ran and failed already has #790's dedicated failure notification.
 // This watchdog checks only execution liveness; failure is not a missing schedule.
 if(run.conclusion==='success'||run.conclusion==='failure')
  return {state:run.conclusion==='success'?'healthy':'assessment-failed',ok:true,...basic};
 return {state:'interrupted',ok:false,...basic};
}
export async function inspectBackupSchedule(env=process.env,request=fetch,now=Date.now()){
 if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN)
  throw Error('Authorized GitHub Actions read access unavailable');
 const url='https://api.github.com/repos/altepop/keso-gamble/actions/workflows/duel-retained-backup-health.yml/runs?event=schedule&per_page=10';
 const res=await request(url,{headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,
  Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
  signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw Error('Backup schedule metadata HTTP '+res.status);
 const data=await res.json();
 if(!Array.isArray(data?.workflow_runs))throw Error('Invalid backup schedule response');
 return evaluateBackupSchedule(data.workflow_runs,now);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 inspectBackupSchedule().then(result=>{
  if(process.env.DUEL_BACKUP_WATCHDOG_REPORT)
   writeFileSync(process.env.DUEL_BACKUP_WATCHDOG_REPORT,JSON.stringify(result),{mode:0o600});
  console.log('DUEL_BACKUP_SCHEDULE_WATCHDOG '+JSON.stringify(result));
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   '# P12 backup retention monitor schedule watchdog\n\n'+
   '| State | '+result.state+' |\n| Run ID | '+(result.runId??'none')+
   ' |\n| Age (minutes) | '+(result.ageMinutes??'unknown')+
   ' |\n\nGitHub Actions scheduled-run metadata only. Assessment failure is handled by #790.\n');
  if(!result.ok)process.exitCode=1;
 }).catch(e=>{
  if(process.env.DUEL_BACKUP_WATCHDOG_REPORT)
   writeFileSync(process.env.DUEL_BACKUP_WATCHDOG_REPORT,JSON.stringify({state:'unknown',ok:false,runId:null,ageMinutes:null}),{mode:0o600});
  console.error('DUEL_BACKUP_SCHEDULE_WATCHDOG_ERROR '+e.message);
  process.exitCode=1;
 });
}
