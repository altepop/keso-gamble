/** P12: GitHub-only independent watchdog for #780 07:11 JST administrator evidence schedule.
 * This checks scheduled runs, not push/dispatch. Does not query or mutate D1.
 */
import {pathToFileURL} from 'node:url';
const root='https://api.github.com/repos/altepop/keso-gamble';
export const ADMIN_EVIDENCE_CRON_ISSUE='P12 daily duel administrator evidence cron missing: investigation required';
const dailyMinute=22*60+11; // 07:11 JST == 22:11 UTC, previous UTC date
const graceMs=120*60_000;
const positive=x=>Number.isSafeInteger(x)&&x>0;
function headers(env){return {Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};}
function authorize(env){if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN)throw Error('GitHub Actions permission required');}
export function lastExpectedAdminEvidenceSlot(now=Date.now()){
 if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid time');
 const today=Math.floor(now/86_400_000)*86_400_000;
 const slot=today+dailyMinute*60_000;
 return now>=slot?slot:slot-86_400_000;
}
export function evaluateAdminEvidenceCron(runs,now=Date.now()){
 if(!Array.isArray(runs))throw Error('Invalid run list');
 const slot=lastExpectedAdminEvidenceSlot(now);
 if(now<slot+graceMs)return {state:'grace',ok:true,slot,runId:null};
 const items=runs.filter(r=>r?.event==='schedule'&&positive(r.id)&&
  r.name==='P12 duel administrator deployment evidence'&&
  typeof r.created_at==='string'&&Number.isFinite(Date.parse(r.created_at))&&
  Date.parse(r.created_at)>=slot-5*60_000&&Date.parse(r.created_at)<=now)
  .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id-a.id);
 const r=items[0];
 if(!r)return {state:'missing',ok:false,slot,runId:null};
 if(r.status!=='completed')return {state:'stalled',ok:false,slot,runId:r.id};
 if(r.conclusion!=='success')return {state:'failed',ok:false,slot,runId:r.id};
 return {state:'healthy',ok:true,slot,runId:r.id};
}
export function adminEvidenceCronIssue(report){
 if(!report||report.ok!==false||!['missing','stalled','failed','unknown'].includes(report.state))return null;
 const slot=Number.isSafeInteger(report.slot)&&report.slot>=0?new Date(report.slot).toISOString():'unknown';
 return {title:ADMIN_EVIDENCE_CRON_ISSUE,body:[
  'P12 #780の07:11 JST管理者証跡cronを独立したGitHub Actions schedule履歴で確認した。',
  '判定: '+report.state,'期待schedule枠(UTC): '+slot,
  'schedule run ID: '+(positive(report.runId)?report.runId:'未確認'),
  report.state==='unknown'?'GitHub API監査不能。未発火やD1監査失敗と断定せず手動で確認すること。':'',
  'push／workflow_dispatchの成功はScheduled発火の証拠にしない。',
  'GitHub scheduler・ワークフロー有効性・job実行ログを確認すること。',
  '同名Issueの重複作成・自動クローズなし。D1/KP・監視閾値・cron設定は変更しない。'
 ].filter(Boolean).join('\n')};
}
export async function inspectAndNotifyAdminEvidenceCron(env=process.env,request=fetch,now=Date.now()){
 authorize(env);
 let report;
 try{
  const res=await request(root+'/actions/workflows/duel-admin-evidence.yml/runs?event=schedule&per_page=15',
   {headers:headers(env),signal:AbortSignal.timeout(18_000)});
  if(!res.ok)throw Error('Schedule history unavailable');
  const data=await res.json();
  if(!Array.isArray(data?.workflow_runs))throw Error('Invalid schedule history');
  report=evaluateAdminEvidenceCron(data.workflow_runs,now);
 }catch{report={state:'unknown',ok:false,slot:lastExpectedAdminEvidenceSlot(now),runId:null};}
 const alert=adminEvidenceCronIssue(report);
 if(!alert)return {state:report.state,action:'healthy'};
 const res=await request(root+'/issues?state=open&per_page=100',{
  headers:headers(env),signal:AbortSignal.timeout(15_000)});
 if(!res.ok)throw Error('Issue read unavailable');
 const issues=await res.json();
 if(!Array.isArray(issues))throw Error('Invalid issue list');
 if(issues.some(i=>!i.pull_request&&i.title===ADMIN_EVIDENCE_CRON_ISSUE))
  return {state:report.state,action:'deduplicated'};
 if(issues.length>=100)throw Error('Issue list saturated; manual investigation required');
 const created=await request(root+'/issues',{method:'POST',
  headers:{...headers(env),'Content-Type':'application/json'},
  body:JSON.stringify(alert),signal:AbortSignal.timeout(15_000)});
 if(!created.ok)throw Error('Unable to post issue');
 const record=await created.json();
 if(!positive(record?.number))throw Error('Invalid issue response');
 return {state:report.state,action:'created',issue:record.number};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 inspectAndNotifyAdminEvidenceCron().then(r=>{
  console.log('DUEL_ADMIN_EVIDENCE_CRON',JSON.stringify(r));
  if(['missing','stalled','failed','unknown'].includes(r.state))process.exitCode=1;
 }).catch(()=>{console.error('DUEL_ADMIN_EVIDENCE_CRON_UNAVAILABLE');process.exitCode=1;});
}
