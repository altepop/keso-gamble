/** P12 D1 hourly schedule watchdog (GitHub metadata only; no D1/KP/Cloudflare requests).
 * A manual dispatch of this independent monitor does not count as a scheduled D1 run.
 */
import {pathToFileURL} from 'node:url';
const api='https://api.github.com/repos/altepop/keso-gamble';
export const D1_SCHEDULE_ALERT_TITLE='P12 D1 scheduled insights missing: investigation required';
export const D1_SCHEDULE_MAX_AGE_MINUTES=150; // hourly :17, allow >two scheduled slots
const validStates=new Set(['missing','stale','stalled','failed','unknown']);
const isPositive=n=>Number.isSafeInteger(n)&&n>0;
export function evaluateD1Schedule(runs,now=Date.now()){
 if(!Array.isArray(runs)||!Number.isSafeInteger(now)||now<0)throw Error('Invalid schedule metadata');
 const matching=runs.filter(r=>r&&r.event==='schedule'&&isPositive(r.id)&&
  typeof r.created_at==='string'&&Number.isFinite(Date.parse(r.created_at))&&
  Date.parse(r.created_at)<=now&&r.name==='D1 read-only insights report')
  .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id-a.id);
 const latest=matching[0];
 if(!latest)return {ok:false,state:'missing',runId:null,ageMinutes:null};
 const ageMinutes=Math.floor((now-Date.parse(latest.created_at))/60000);
 if(ageMinutes>D1_SCHEDULE_MAX_AGE_MINUTES)return {ok:false,state:'stale',runId:latest.id,ageMinutes};
 if(latest.status!=='completed')
  return {ok:ageMinutes<=45,state:ageMinutes>45?'stalled':'running',runId:latest.id,ageMinutes};
 if(latest.conclusion!=='success')return {ok:false,state:'failed',runId:latest.id,ageMinutes};
 return {ok:true,state:'healthy',runId:latest.id,ageMinutes};
}
function headers(env){return {Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};}
function requireGitHub(env){
 if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN)
  throw Error('Authorized GitHub Actions access required');
}
export async function inspectD1Schedule(env=process.env,request=fetch,now=Date.now()){
 requireGitHub(env);
 const res=await request(api+'/actions/workflows/d1-insights-report.yml/runs?event=schedule&per_page=10',
  {headers:headers(env),signal:AbortSignal.timeout(18000)});
 if(!res.ok)throw Error('D1 schedule metadata unavailable (HTTP '+res.status+')');
 const data=await res.json();
 if(!Array.isArray(data?.workflow_runs))throw Error('Unexpected D1 schedule metadata');
 return evaluateD1Schedule(data.workflow_runs,now);
}
export function d1ScheduleIssue(report){
 if(!report||report.ok!==false||!validStates.has(report.state))return null;
 const id=isPositive(report.runId)?report.runId:'不明';
 const age=Number.isSafeInteger(report.ageMinutes)&&report.ageMinutes>=0&&report.ageMinutes<100000?report.ageMinutes:'不明';
 return {title:D1_SCHEDULE_ALERT_TITLE,body:[
  'D1 Insights定期実行のGitHub Actions履歴を確認できなかった、または最新の予定実行が失敗・長期未完了だった。',
  '判定: '+report.state,
  '最後の有効なschedule実行ID: '+id,
  '作成からの経過分: '+age,
  report.state==='unknown'?'GitHub API監査不能。schedule欠落・D1読み取りゼロ・デプロイ失敗を断定しない。':'',
  'workflow_dispatchとpushはschedule実行の証拠として扱わない。',
  '原因は未特定。GitHub Actionsの定期発火と権限、スケジューラ、ワークフロー有効性を人手で確認すること。',
  'D1/KPのデータ・予算閾値・Cloudflare設定は自動変更しない。',
  '同名の未解決Issueがあれば重複起票せず自動クローズもしない。'
 ].filter(Boolean).join('\n')};
}
export async function inspectAndNotify(env=process.env,request=fetch,now=Date.now()){
 requireGitHub(env);
 let report;
 try{report=await inspectD1Schedule(env,request,now);}
 catch{report={ok:false,state:'unknown',runId:null,ageMinutes:null};}
 const alert=d1ScheduleIssue(report);
 if(!alert)return {state:report.state,action:'healthy'};
 const list=await request(api+'/issues?state=open&per_page=100',{
  headers:headers(env),signal:AbortSignal.timeout(15000)});
 if(!list.ok)throw Error('D1 schedule issue list unavailable (HTTP '+list.status+')');
 const items=await list.json();
 if(!Array.isArray(items))throw Error('D1 schedule issue list invalid');
 if(items.some(i=>!i.pull_request&&i.title===D1_SCHEDULE_ALERT_TITLE))
  return {state:report.state,action:'deduplicated'};
 if(items.length>=100)throw Error('D1 schedule issue list saturated; manual check required');
 const made=await request(api+'/issues',{method:'POST',
  headers:{...headers(env),'Content-Type':'application/json'},
  body:JSON.stringify(alert),signal:AbortSignal.timeout(15000)});
 if(!made.ok)throw Error('D1 schedule issue creation failed (HTTP '+made.status+')');
 const record=await made.json();
 if(!isPositive(record?.number))throw Error('D1 schedule issue response invalid');
 return {state:report.state,action:'created',issue:record.number};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 inspectAndNotify().then(result=>{console.log('D1_SCHEDULE_HEARTBEAT',JSON.stringify(result));
  if(result.state!=='healthy'&&result.state!=='running')process.exitCode=1;
 }).catch(()=>{console.error('D1_SCHEDULE_HEARTBEAT_ERROR: GitHub metadata/alert unavailable');process.exitCode=1;});
}
