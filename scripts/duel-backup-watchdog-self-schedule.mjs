/** Independent P12 alarm for the backup-readiness watchdog itself (#791).
 * Uses only GitHub Actions metadata. 03:47 UTC daily = 12:47 JST.
 * The first scheduled opportunity is 2026-11-24; allow 120 minutes of delay.
 * Never claim a missed slot before the full grace interval has expired.
 */
import {pathToFileURL} from 'node:url';
const api='https://api.github.com/repos/altepop/keso-gamble';
export const SELF_WATCH_ISSUE='P12 backup schedule watchdog itself missing: investigation required';
export const FIRST_SLOT=Date.parse('2026-11-24T03:47:00Z');
export const GRACE_MS=120*60_000;
const DAY=24*60*60_000;
const positive=n=>Number.isSafeInteger(n)&&n>0;
export function latestMaturedSelfWatchSlot(now=Date.now()){
 if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid audit time');
 const delta=now-GRACE_MS-FIRST_SLOT;
 return delta<0?null:FIRST_SLOT+Math.floor(delta/DAY)*DAY;
}
export function evaluateSelfWatchSchedule(runs,now=Date.now()){
 if(!Array.isArray(runs))throw Error('Invalid scheduled-run inventory');
 const slot=latestMaturedSelfWatchSlot(now);
 if(slot===null)return {ok:true,state:'grace',slot:null,runId:null};
 const matches=runs.filter(r=>r?.name==='P12 duel retained backup schedule watchdog'&&
   r.event==='schedule'&&positive(r.id)&&
   typeof r.created_at==='string'&&Number.isFinite(Date.parse(r.created_at))&&
   Date.parse(r.created_at)>=slot-5*60_000&&
   Date.parse(r.created_at)<=now&&Date.parse(r.created_at)<slot+DAY-5*60_000)
  .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id-a.id);
 const latest=matches[0];
 if(!latest)return {ok:false,state:'missing',slot,runId:null};
 if(Date.parse(latest.created_at)>slot+GRACE_MS)return {ok:false,state:'late',slot,runId:latest.id};
 if(latest.status!=='completed')return {ok:false,state:'stalled',slot,runId:latest.id};
 if(latest.conclusion!=='success')return {ok:false,state:'failed',slot,runId:latest.id};
 return {ok:true,state:'healthy',slot,runId:latest.id};
}
const headers=env=>({Authorization:'Bearer '+env.GITHUB_TOKEN,
 Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});
export function selfWatchIssue(report){
 if(!report||report.ok!==false||!['missing','late','stalled','failed','unknown'].includes(report.state))return null;
 return {title:SELF_WATCH_ISSUE,body:[
  '#791の「バックアップ保管監視の日次実行欠落を検出するウォッチドッグ」そのもののScheduled実行を別経路で監査。',
  '期待cron: 47 3 * * * (UTC 03:47 / JST 12:47)、初回2026-11-24。120分猶予後に判定。',
  '状態: '+report.state,
  report.state==='late'?'猶予後のScheduled候補を確認。期限内成功とは扱わず、正確な割当枠・完了状態は別途確認する。':'',
  '成熟した期待時刻UTC: '+(report.slot===null?'不明':new Date(report.slot).toISOString()),
  '対象Scheduled run ID: '+(positive(report.runId)?report.runId:'未確認'),
  report.state==='unknown'?'GitHub API監査不能であり未発火と断定しない。':'',
  'push／PR／workflow_dispatchの成功はScheduled実行の証拠ではない。',
  '実行履歴のcreated_atから正確なcron割当枠を一意に復元できるとは断定しない。',
  '当該ウォッチドッグのScheduled成功は暗号化バックアップの実在や復元成功を意味しない。',
  '自動修復／自動クローズなし。同名未解決Issueは重複起票しない。',
  'D1／KP／Cloudflare設定、料金、hard capは変更しない。'
 ].filter(Boolean).join('\n')};
}
export async function inspectAndNotifySelfWatchSchedule(env=process.env,request=fetch,now=Date.now()){
 if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN)
  throw Error('Authorized GitHub Actions metadata access required');
 let report;
 try{
  const res=await request(api+'/actions/workflows/duel-retained-backup-watchdog.yml/runs?event=schedule&per_page=10',
   {headers:headers(env),signal:AbortSignal.timeout(18000)});
  if(!res.ok)throw Error('GitHub Scheduled metadata unavailable');
  const value=await res.json();
  if(!Array.isArray(value?.workflow_runs))throw Error('Invalid GitHub metadata');
  report=evaluateSelfWatchSchedule(value.workflow_runs,now);
 }catch{
  report={ok:false,state:'unknown',slot:latestMaturedSelfWatchSlot(now),runId:null};
 }
 const issue=selfWatchIssue(report);
 if(!issue)return {state:report.state,action:'healthy'};
 const list=await request(api+'/issues?state=open&per_page=100',{
  headers:headers(env),signal:AbortSignal.timeout(15000)});
 if(!list.ok)throw Error('GitHub Issue inventory unavailable');
 const items=await list.json();
 if(!Array.isArray(items))throw Error('Invalid GitHub Issue inventory');
 if(items.some(i=>!i.pull_request&&i.title===SELF_WATCH_ISSUE))
  return {state:report.state,action:'deduplicated'};
 if(items.length>=100)throw Error('Open Issue inventory saturated; manual review required');
 const made=await request(api+'/issues',{
  method:'POST',headers:{...headers(env),'Content-Type':'application/json'},
  body:JSON.stringify(issue),signal:AbortSignal.timeout(15000)});
 if(!made.ok)throw Error('Issue creation unavailable');
 const row=await made.json();
 if(!positive(row?.number))throw Error('Invalid issue creation response');
 return {state:report.state,action:'created',issue:row.number};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 inspectAndNotifySelfWatchSchedule().then(r=>{
  console.log('DUEL_BACKUP_WATCHDOG_SELF_SCHEDULE',JSON.stringify(r));
  if(['missing','late','stalled','failed','unknown'].includes(r.state))process.exitCode=1;
 }).catch(()=>{
  console.error('DUEL_BACKUP_WATCHDOG_SELF_SCHEDULE_UNAVAILABLE');
  process.exitCode=1;
 });
}
