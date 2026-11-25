/** Fail-closed GitHub Issue alert for missed/failed hourly duel monitor schedule.
 * Separate from deployment failure issue; no D1/KP/Cloudflare/Discord writes.
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const HEARTBEAT_ALERT_TITLE='P12 duel monitor heartbeat missing: manual investigation required';
const actionable=new Set(['missing','stale','stalled','failed','unknown']);
export function buildHeartbeatAlert(report){
 if(!report||report.ok!==false||!actionable.has(report.state))return null;
 const runId=Number.isSafeInteger(report.runId)&&report.runId>0?report.runId:null;
 const minutes=Number.isSafeInteger(report.ageMinutes)&&report.ageMinutes>=0&&report.ageMinutes<100000?
  report.ageMinutes:null;
 return {title:HEARTBEAT_ALERT_TITLE,body:[
  'P12決闘の配備監視ワークフロー自体の定期実行に問題がある可能性を検知した。',
  '判定: '+report.state,
  ...(report.state==='unknown'?['GitHub Actionsメタデータ取得に失敗し、監視の実行有無・配備状態を判定できない。欠落や配備失敗を断定しない。']:[]),
  '監視ワークフローの最新予定実行ID: '+(runId??'不明'),
  '経過時間（分）: '+(minutes??'不明'),
  '',
  'GitHub Actionsのスケジュール遅延・キャンセル・権限・ワークフロー無効化を手動確認すること。',
  '配備失敗を示す証拠ではない。配備異常通知のIssueとは別案件として扱う。',
  'この通知は自動復旧を実行せず、D1/KPデータを変更しない。',
  '未解決の同名Issueが存在すれば重複起票せず、正常化による自動クローズも行わない。'
 ].join('\n')};
}
export async function notifyHeartbeat(env=process.env,request=fetch){
 if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN||!env.DUEL_HEARTBEAT_REPORT)
  throw Error('Heartbeat alert requires authorized repository, token and report path');
 let report;
 try{report=JSON.parse(readFileSync(env.DUEL_HEARTBEAT_REPORT,'utf8'));}
 catch{report={state:'unknown',ok:false,runId:null,ageMinutes:null};}
 const alert=buildHeartbeatAlert(report);
 if(!alert){console.log('DUEL_HEARTBEAT_ALERT_SKIP: no actionable heartbeat anomaly');return 'healthy';}
 const headers={Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28'};
 const base='https://api.github.com/repos/altepop/keso-gamble';
 const res=await request(base+'/issues?state=open&per_page=100',{
  headers,signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('Heartbeat alert issue list failed: HTTP '+res.status);
 const issues=await res.json();
 if(!Array.isArray(issues))throw Error('Heartbeat alert issue list invalid');
 if(issues.some(issue=>!issue.pull_request&&issue.title===HEARTBEAT_ALERT_TITLE)){
  console.log('DUEL_HEARTBEAT_ALERT_DEDUPED');return 'deduplicated';
 }
 if(issues.length>=100)throw Error('Heartbeat alert issue list saturated: manual check required');
 const made=await request(base+'/issues',{method:'POST',
  headers:{...headers,'Content-Type':'application/json'},
  body:JSON.stringify({title:alert.title,body:alert.body}),signal:AbortSignal.timeout(15000)});
 if(!made.ok)throw Error('Heartbeat issue creation failed: HTTP '+made.status);
 const record=await made.json();
 if(!Number.isSafeInteger(record?.number)||record.number<=0)
  throw Error('Heartbeat issue creation response invalid');
 console.log('DUEL_HEARTBEAT_ALERT_CREATED #'+record.number);
 return 'created';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 notifyHeartbeat().catch(error=>{console.error('DUEL_HEARTBEAT_ALERT_ERROR '+error.message);process.exitCode=1;});
}
