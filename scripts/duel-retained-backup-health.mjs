/** P12 backup-retention readiness monitor. GitHub Actions metadata only.
 * Does not download ciphertext or access Cloudflare/D1/KP.
 * Evidence is availability, NOT validation of the backup contents or decryption key.
 */
import {appendFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const BACKUP_PREFIX='keso-duel-d1-restorable-';
export const BACKUP_WORKFLOW='P12 duel D1 encrypted backup and isolated restore';
const MS_DAY=86400000;
const validId=id=>Number.isSafeInteger(id)&&id>0;
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
export function selectRetainedDuelBackup(artifacts,now=Date.now()){
 if(!Array.isArray(artifacts)||!Number.isSafeInteger(now)||now<MS_DAY)
  throw Error('Invalid artifact inventory');
 // Do not turn a truncated first page into a false absence/presence claim.
 if(artifacts.length>=100)throw Error('Artifact inventory saturated; audit cannot prove latest backup');
 const matches=artifacts.filter(a=>typeof a?.name==='string'&&
  /^keso-duel-d1-restorable-[1-9][0-9]{0,14}$/.test(a.name));
 if(!matches.length)return {state:'missing',ok:false,artifactId:null,sourceRunId:null,daysRemaining:null};
 for(const a of matches){
  const id=Number(a.name.slice(BACKUP_PREFIX.length));
  if(!validId(id)||!validId(a.id)||!validTime(a.created_at)||
     !validTime(a.expires_at)||Date.parse(a.created_at)>now||
     Date.parse(a.expires_at)<=Date.parse(a.created_at)||
     !validId(a.workflow_run?.id)||a.workflow_run.id!==id||
     !Number.isSafeInteger(a.size_in_bytes)||a.size_in_bytes<=0||
     typeof a.expired!=='boolean')
   throw Error('Duel backup artifact metadata invalid');
 }
 matches.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id-a.id);
 const latest=matches[0],expire=Date.parse(latest.expires_at);
 const days=Math.floor((expire-now)/MS_DAY);
 const state=latest.expired||expire<=now?'expired':expire-now<=7*MS_DAY?'expiring':'available';
 return {state,ok:state==='available',artifactId:latest.id,
  sourceRunId:latest.workflow_run.id,daysRemaining:Math.max(0,days)};
}
export function validateRetainedBackupRun(run,id){
 if(!validId(id)||run?.id!==id||run?.name!==BACKUP_WORKFLOW||
  run?.status!=='completed'||run?.conclusion!=='success'||
  run?.repository?.full_name!=='altepop/keso-gamble'||run?.head_branch!=='main')
  throw Error('Retained backup source run not verified as successful main backup');
 return true;
}
export async function assessRetainedBackup(env=process.env,request=fetch,now=Date.now()){
 if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN)
  throw Error('Authorized Actions metadata unavailable');
 const base='https://api.github.com/repos/altepop/keso-gamble/actions';
 const headers={Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28'};
 async function read(url){
  const res=await request(url,{headers,signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw Error('GitHub backup metadata HTTP '+res.status);
  return res.json();
 }
 const runs=await read(base+'/workflows/duel-d1-backup.yml/runs?status=success&per_page=100');
 if(!Array.isArray(runs?.workflow_runs))
  throw Error('Backup workflow run inventory invalid');
 // The workflow-run endpoint is already sorted newest first. A saturated
 // result cannot establish the full inventory but still identifies latest.
 const run=runs.workflow_runs.find(r=>r?.name===BACKUP_WORKFLOW&&
  r?.status==='completed'&&r?.conclusion==='success'&&r?.head_branch==='main');
 if(!run)return {state:'missing',ok:false,artifactId:null,sourceRunId:null,daysRemaining:null};
 validateRetainedBackupRun(run,run.id);
 const data=await read(base+'/runs/'+run.id+'/artifacts?per_page=100');
 if(!Array.isArray(data?.artifacts)||!Number.isSafeInteger(data.total_count)||data.total_count<0)
  throw Error('Backup run artifact inventory invalid');
 if(data.total_count>data.artifacts.length)
  throw Error('Backup run artifact inventory pagination unresolved');
 const outcome=selectRetainedDuelBackup(data.artifacts,now);
 if(outcome.sourceRunId!==null&&outcome.sourceRunId!==run.id)
  throw Error('Backup artifact is not linked to the approved source run');
 return outcome;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assessRetainedBackup().then(r=>{
  if(process.env.DUEL_BACKUP_REPORT)writeFileSync(process.env.DUEL_BACKUP_REPORT,JSON.stringify(r));
  console.log('DUEL_RETAINED_BACKUP_READINESS '+JSON.stringify(r));
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   '# P12 retained duel backup metadata readiness\n\n'+
   '| State | '+r.state+' |\n| Artifact ID | '+(r.artifactId??'none')+
   ' |\n| Backup workflow run | '+(r.sourceRunId??'none')+
   ' |\n| Days remaining | '+(r.daysRemaining??'unknown')+
   ' |\n\nMetadata availability only; ciphertext integrity, key possession and restore success NOT checked. No D1/KP access.\n');
  if(!r.ok)process.exitCode=1;
 }).catch(e=>{
  if(process.env.DUEL_BACKUP_REPORT)writeFileSync(process.env.DUEL_BACKUP_REPORT,JSON.stringify({state:'unknown',ok:false,artifactId:null,sourceRunId:null,daysRemaining:null}));
  console.error('DUEL_RETAINED_BACKUP_READINESS_UNKNOWN '+e.message);process.exitCode=1;
 });
}
