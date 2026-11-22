// P12 exception notification: one GitHub Issue, no Discord/KP/D1 access.
// Only explicit failed/stalled/missing deployment decisions can notify.
import {readFileSync} from 'node:fs';
export const ALERT_TITLE='P12 duel deployment alert: action required';
const badStates=new Set(['failed','stalled','missing','invalid-timestamp']);
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
async function execute(){
 const path=process.env.DUEL_WATCH_REPORT,repo=process.env.GITHUB_REPOSITORY,token=process.env.GITHUB_TOKEN;
 if(repo!=='altepop/keso-gamble'||!path||!token)throw Error('Alert requires authorized repository, report and GITHUB_TOKEN');
 let report;
 try{report=JSON.parse(readFileSync(path,'utf8'));}catch(e){console.log('DUEL_ALERT_SKIPPED: no valid monitor report');return;}
 const alert=buildDeploymentAlert(report);
 if(!alert){console.log('DUEL_ALERT_SKIPPED: no actionable deployment anomaly');return;}
 const base='https://api.github.com/repos/'+repo;
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const list=await fetch(base+'/issues?state=open&per_page=100',{headers,signal:AbortSignal.timeout(15000)});
 if(!list.ok)throw Error('Cannot check existing alert issues: '+list.status);
 const issues=await list.json();
 if(!Array.isArray(issues))throw Error('Unexpected issue response');
 if(issues.some(i=>!i.pull_request&&i.title===ALERT_TITLE)){console.log('DUEL_ALERT_DEDUPED: open issue exists');return;}
 // Fail closed rather than creating duplicates if pagination could hide an older alert.
 if(issues.length>=100){console.log('DUEL_ALERT_SKIPPED: issue list saturated, manual review');return;}
 const made=await fetch(base+'/issues',{method:'POST',headers:{...headers,'Content-Type':'application/json'},
  body:JSON.stringify({title:alert.title,body:alert.body,labels:[]}),signal:AbortSignal.timeout(15000)});
 if(!made.ok)throw Error('Could not create deployment alert: '+made.status);
 const item=await made.json();
 console.log('DUEL_ALERT_CREATED: issue #'+item.number);
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 execute().catch(e=>{console.error('DUEL_ALERT_ERROR '+e.message);process.exitCode=1;});
