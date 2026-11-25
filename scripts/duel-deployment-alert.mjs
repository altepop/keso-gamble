// P12 exception notification: one GitHub Issue, no Discord/KP/D1 access.
// Only explicit failed/stalled/missing deployment decisions can notify.
import {readFileSync} from 'node:fs';
export const ALERT_TITLE='P12 duel deployment alert: action required';
export const MONITOR_UNAVAILABLE_TITLE='P12 duel deployment monitor unavailable: review required';
/** A missing or unreadable report is a monitor failure, never evidence of a failed deploy. */
export function buildMonitorUnavailableAlert(){
 return {title:MONITOR_UNAVAILABLE_TITLE,body:[
  'P12決闘の配備監視結果を読み取れなかった。これは監視自体の異常であり、Pages/Workerの配備失敗を意味しない。',
  '',
  'Actionsの監視実行ログ、レポート出力、権限、Pages/Worker配備状況を手動で照合すること。',
  '監視はD1/KPの読み書き、自動再配備、復旧操作を行わない。',
  '同名の未解決Issueは重複起票せず、自動クローズもしない。'
 ].join('\n')};
}
const badStates=new Set(['failed','stalled','missing','invalid-timestamp']);
const expectedNames=new Set(['Pages','Worker']);
const knownStates=new Set(['healthy','pending',...badStates]);
/** A valid JSON report can still be internally inconsistent.
 * That is a monitor-result failure, NOT proof of a deployment failure.
 */
export function isCoherentDeploymentReport(report){
 if(!report||typeof report!=='object'||Array.isArray(report)||
  typeof report.ok!=='boolean'||!Array.isArray(report.results)||report.results.length!==2)return false;
 const names=new Set(report.results.map(row=>row?.name));
 if(names.size!==2||[...names].some(name=>!expectedNames.has(name)))return false;
 if(report.results.some(row=>!row||!knownStates.has(row.state)))return false;
 const hasFailure=report.results.some(row=>badStates.has(row.state));
 return report.ok===!hasFailure;
}

export function buildDeploymentAlert(report){
 if(!report||!Array.isArray(report.results)||report.results.length!==2)return null;
 const validNames=new Set(['Pages','Worker']);
 if(new Set(report.results.map(r=>r.name)).size!==2||report.results.some(r=>!validNames.has(r.name)))return null;
 const failures=report.results.filter(r=>badStates.has(r.state));
 if(report.ok!==false||!failures.length)return null;
 const safeRun=r=>Number.isSafeInteger(r.runId)&&r.runId>0?String(r.runId):'-';
 const safeSha=r=>typeof r.sha==='string'&&/^[0-9a-f]{7,40}$/i.test(r.sha)?r.sha:'-';
 const lines=report.results.map(r=>'- '+r.name+': '+(badStates.has(r.state)?r.state:r.state==='healthy'?'healthy':'pending')+
  ' (run '+safeRun(r)+', SHA '+safeSha(r)+')');
 return {title:ALERT_TITLE,body:[
  'P12決闘の配備監視で要確認の状態を検出した。監視は読取り専用であり、自動再配備やD1/KP操作は行わない。',
  '',...lines,'','手動でActionsの配備履歴と本番スモークを確認し、必要に応じて復旧手順を検討すること。',
  '同名の未解決Issueがある場合は重複起票しない。自動クローズもしない。'
 ].join('\n')};
}
export async function notifyDeploymentAnomaly(env=process.env,request=fetch){
 const path=env.DUEL_WATCH_REPORT,repo=env.GITHUB_REPOSITORY,token=env.GITHUB_TOKEN;
 if(repo!=='altepop/keso-gamble'||!path||!token)throw Error('Alert requires authorized repository, report and GITHUB_TOKEN');
 let report;
 let alert;
 try{report=JSON.parse(readFileSync(path,'utf8'));}
 catch{alert=buildMonitorUnavailableAlert();}
 if(!alert){
  if(!isCoherentDeploymentReport(report))alert=buildMonitorUnavailableAlert();
  else {
   alert=buildDeploymentAlert(report);
   if(!alert){console.log('DUEL_ALERT_SKIPPED: no actionable deployment anomaly');return 'healthy';}
  }
}
 const base='https://api.github.com/repos/'+repo;
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const list=await request(base+'/issues?state=open&per_page=100',{headers,signal:AbortSignal.timeout(15000)});
 if(!list.ok)throw Error('Cannot check existing alert issues: '+list.status);
 const issues=await list.json();
 if(!Array.isArray(issues))throw Error('Unexpected issue response');
 if(issues.some(i=>!i.pull_request&&i.title===alert.title)){console.log('DUEL_ALERT_DEDUPED: open issue exists');return;}
 // Fail closed rather than creating duplicates if pagination could hide an older alert.
 if(issues.length>=100){console.log('DUEL_ALERT_SKIPPED: issue list saturated, manual review');return;}
 const made=await request(base+'/issues',{method:'POST',headers:{...headers,'Content-Type':'application/json'},
  body:JSON.stringify({title:alert.title,body:alert.body,labels:[]}),signal:AbortSignal.timeout(15000)});
 if(!made.ok)throw Error('Could not create deployment alert: '+made.status);
 const item=await made.json();
 console.log('DUEL_ALERT_CREATED: issue #'+item.number);
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 notifyDeploymentAnomaly().catch(e=>{console.error('DUEL_ALERT_ERROR '+e.message);process.exitCode=1;});
