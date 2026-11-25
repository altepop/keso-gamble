/** P12 independent metadata-only check of the D1 schedule's deployment-watch-fallback job.
 * Missing *schedule runs* are covered by #845. This isolates a missing/failed job
 * within a valid completed schedule run, so it never treats push as a schedule.
 */
import {pathToFileURL} from 'node:url';
import {inspectD1Schedule} from './duel-d1-schedule-watch.mjs';
export const FALLBACK_JOB='deployment-watch-fallback';
export const FALLBACK_JOB_ISSUE='P12 D1 deployment fallback job failed or missing: investigate';
const repo='https://api.github.com/repos/altepop/keso-gamble';
const alertStates=new Set(['missing-job','skipped','failed','stalled','unknown']);
const pos=n=>Number.isSafeInteger(n)&&n>0;
const auth=env=>({Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});
function validEnv(env){if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN)throw Error('Authorized Actions metadata access required');}
export function evaluateFallbackJob(jobs,ageMinutes){
 if(!Array.isArray(jobs)||jobs.length>=100||!Number.isSafeInteger(ageMinutes)||ageMinutes<0)
  return {state:'unknown',ok:false};
 const candidates=jobs.filter(j=>j&&j.name===FALLBACK_JOB&&pos(j.id));
 if(candidates.length!==1)return {state:candidates.length===0?'missing-job':'unknown',ok:false};
 const j=candidates[0];
 if(j.status!=='completed')return ageMinutes>45?{state:'stalled',ok:false}:{state:'running',ok:true};
 if(j.conclusion==='success')return {state:'healthy',ok:true};
 return {state:j.conclusion==='skipped'?'skipped':'failed',ok:false};
}
export function fallbackIssue(state,runId){
 if(!alertStates.has(state))return null;
 return {title:FALLBACK_JOB_ISSUE,body:[
  'D1 Insights scheduleの配備監視fallbackジョブを、GitHub Actionsのジョブメタデータで独立確認した。',
  '判定: '+state,
  'schedule実行ID: '+(pos(runId)?runId:'不明'),
  'D1 scheduleそのものの未発火は別Issue対象（#845）。この分割はscheduled run内のfallbackジョブのみ対象。',
  state==='unknown'?'APIの結果が不完全で、fallback実行状態や本番配備失敗は断定できない。':'',
  'GitHub Actionsのジョブ条件・権限・失敗・スキップを手動確認すること。push成功やdispatchは代用しない。',
  'D1・KP・Cloudflareは書き換えず、障害の自動復旧も行わない。',
  '同名open Issueがあれば追加作成せず、自動解決も行わない。'
 ].filter(Boolean).join('\n')};
}
export async function inspectFallback(env=process.env,request=fetch,now=Date.now()){
 validEnv(env);
 const upstream=await inspectD1Schedule(env,request,now);
 if(upstream.state==='missing'||upstream.state==='stale')
  return {state:'upstream-missing',ok:false,runId:null}; // handled by #845
 if(upstream.state==='running')return {state:'upstream-running',ok:true,runId:upstream.runId};
 if(!pos(upstream.runId))return {state:'unknown',ok:false,runId:null};
 const res=await request(repo+'/actions/runs/'+upstream.runId+'/jobs?per_page=100',
  {headers:auth(env),signal:AbortSignal.timeout(18000)});
 if(!res.ok)throw Error('Fallback jobs metadata unavailable (HTTP '+res.status+')');
 const data=await res.json();
 if(!Array.isArray(data?.jobs))throw Error('Unexpected fallback jobs metadata');
 return {...evaluateFallbackJob(data.jobs,upstream.ageMinutes),runId:upstream.runId};
}
export async function inspectAndNotifyFallback(env=process.env,request=fetch,now=Date.now()){
 validEnv(env);
 let result;
 try{result=await inspectFallback(env,request,now);}
 catch{result={state:'unknown',ok:false,runId:null};}
 const issue=fallbackIssue(result.state,result.runId);
 if(!issue)return {state:result.state,action:'skipped'};
 const headers=auth(env);
 const res=await request(repo+'/issues?state=open&per_page=100',{headers,signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('Fallback incident list unavailable');
 const open=await res.json();
 if(!Array.isArray(open))throw Error('Fallback incident list invalid');
 if(open.some(i=>!i.pull_request&&i.title===FALLBACK_JOB_ISSUE))return {state:result.state,action:'deduplicated'};
 if(open.length>=100)throw Error('Fallback incident list saturated');
 const made=await request(repo+'/issues',{method:'POST',headers:{...headers,'Content-Type':'application/json'},
  body:JSON.stringify(issue),signal:AbortSignal.timeout(15000)});
 if(!made.ok)throw Error('Fallback incident creation unavailable');
 const data=await made.json();
 if(!pos(data?.number))throw Error('Fallback incident identifier invalid');
 return {state:result.state,action:'created',number:data.number};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 inspectAndNotifyFallback().then(r=>{
  console.log('D1_FALLBACK_JOB_MONITOR',JSON.stringify(r));
  if(alertStates.has(r.state))process.exitCode=1;
 }).catch(()=>{console.error('D1_FALLBACK_JOB_MONITOR_UNAVAILABLE');process.exitCode=1;});
}
