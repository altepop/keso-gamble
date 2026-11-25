/** P12: independent scheduled-slot watchdog for duel-deployment-watch.yml.
 * Cron in that workflow is 43 * * * * (UTC), hourly. GitHub may run late:
 * only evaluate a slot once its 120-minute grace window has fully elapsed.
 * GitHub metadata only, no Cloudflare/D1/KP reads or writes.
 */
import {pathToFileURL} from 'node:url';
const root='https://api.github.com/repos/altepop/keso-gamble';
export const DEPLOYMENT_SCHEDULE_ISSUE='P12 hourly duel deployment health schedule gap: investigation required';
export const DEPLOYMENT_SCHEDULE_GRACE_MS=120*60_000;
const HOUR=60*60_000, MINUTE=60_000;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const headers=env=>({Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});
export function lastMaturedDeploymentSlot(now=Date.now()){
 if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid time');
 const elapsed=now-DEPLOYMENT_SCHEDULE_GRACE_MS-43*MINUTE;
 if(elapsed<0)return null;
 return Math.floor(elapsed/HOUR)*HOUR+43*MINUTE;
}
export function evaluateDeploymentSchedule(runs,now=Date.now()){
 if(!Array.isArray(runs))throw Error('Invalid schedule runs');
 const slot=lastMaturedDeploymentSlot(now);
 if(slot===null)return {state:'grace',ok:true,slot:null,runId:null};
 // A successful run can be delayed, so do not require created_at.minute===43.
 // Time alone cannot prove which queued cron slot produced a late execution.
 const candidates=runs.filter(r=>r?.event==='schedule'&&
  r.name==='P12 duel deployment health (read-only)'&&positive(r.id)&&
  typeof r.created_at==='string'&&Number.isFinite(Date.parse(r.created_at))&&
  Date.parse(r.created_at)>=slot-5*MINUTE&&
  Date.parse(r.created_at)<=slot+DEPLOYMENT_SCHEDULE_GRACE_MS)
  .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id-a.id);
 const latest=candidates[0];
 if(!latest)return {state:'missing',ok:false,slot,runId:null};
 if(latest.status!=='completed')return {state:'stalled',ok:false,slot,runId:latest.id};
 if(latest.conclusion!=='success')return {state:'failed',ok:false,slot,runId:latest.id};
 return {state:'healthy',ok:true,slot,runId:latest.id};
}
export function deploymentScheduleIssue(report){
 if(!report||report.ok!==false||!['missing','stalled','failed','unknown'].includes(report.state))return null;
 return {title:DEPLOYMENT_SCHEDULE_ISSUE,body:[
  'P12 duel-deployment-watch.yml: 宣言cronは毎時43分UTC（43 * * * *）、JSTでも毎時43分。',
  '判定: '+report.state,
  '判定可能になった期待cron枠(UTC): '+(report.slot===null?'unknown':new Date(report.slot).toISOString()),
  'Scheduled run ID: '+(positive(report.runId)?report.runId:'未確認'),
  'GitHub Actionsはcron発火が遅延し得るため、120分の猶予を設けた。実際のcreated_atはcronの予定時刻とは異なり得る。',
  '11/24 11:36 JSTのScheduled成功も確認されているため、過去の:43枠すべてを確定missingとは扱わない。',
  report.state==='unknown'?'GitHub API監査不能。未発火と断定せず手動確認を要する。':'',
  'push・workflow_dispatchは定期実行の代替証跡としない。',
  '同名Issue重複起票なし・自動クローズなし。D1/KP、cron時刻、hard cap、監視閾値は変更しない。'
 ].filter(Boolean).join('\n')};
}
export async function inspectAndNotifyDeploymentSchedule(env=process.env,request=fetch,now=Date.now()){
 if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN)throw Error('GitHub Actions permission required');
 let report;
 try{
  const res=await request(root+'/actions/workflows/duel-deployment-watch.yml/runs?event=schedule&per_page=40',
   {headers:headers(env),signal:AbortSignal.timeout(18_000)});
  if(!res.ok)throw Error('Schedule metadata unavailable');
  const data=await res.json();
  if(!Array.isArray(data?.workflow_runs))throw Error('Invalid schedule list');
  report=evaluateDeploymentSchedule(data.workflow_runs,now);
 }catch{
  report={state:'unknown',ok:false,slot:lastMaturedDeploymentSlot(now),runId:null};
 }
 const issue=deploymentScheduleIssue(report);
 if(!issue)return {state:report.state,action:'healthy'};
 const res=await request(root+'/issues?state=open&per_page=100',
  {headers:headers(env),signal:AbortSignal.timeout(15_000)});
 if(!res.ok)throw Error('Open Issue lookup unavailable');
 const issues=await res.json();
 if(!Array.isArray(issues))throw Error('Invalid Issue lookup');
 if(issues.some(x=>!x.pull_request&&x.title===DEPLOYMENT_SCHEDULE_ISSUE))
  return {state:report.state,action:'deduplicated'};
 if(issues.length>=100)throw Error('Issue list saturated');
 const created=await request(root+'/issues',{method:'POST',
  headers:{...headers(env),'Content-Type':'application/json'},
  body:JSON.stringify(issue),signal:AbortSignal.timeout(15_000)});
 if(!created.ok)throw Error('Issue create failed');
 const data=await created.json();
 if(!positive(data?.number))throw Error('Invalid Issue response');
 return {state:report.state,action:'created',issue:data.number};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 inspectAndNotifyDeploymentSchedule().then(r=>{
  console.log('DUEL_DEPLOYMENT_SCHEDULE',JSON.stringify(r));
  if(['missing','stalled','failed','unknown'].includes(r.state))process.exitCode=1;
 }).catch(()=>{console.error('DUEL_DEPLOYMENT_SCHEDULE_UNAVAILABLE');process.exitCode=1;});
}
