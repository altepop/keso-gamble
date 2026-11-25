/** GitHub-only fail-closed notification for missing daily backup readiness schedule. */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const WATCHDOG_ALERT_TITLE='P12 duel backup readiness schedule missing: action required';
const bad=new Set(['missing','stale','stalled','interrupted','unknown']);
export function buildBackupWatchdogAlert(report){
 if(!report||report.ok!==false||!bad.has(report.state))return null;
 const runId=Number.isSafeInteger(report.runId)&&report.runId>0?report.runId:'未確認';
 const age=Number.isSafeInteger(report.ageMinutes)&&report.ageMinutes>=0?
  report.ageMinutes:'未確認';
 return {title:WATCHDOG_ALERT_TITLE,body:[
  'P12 暗号化バックアップ保管監視（日次08:17 JST）が予定どおり実行されていない可能性がある。',
  '判定: '+report.state,
  '最新schedule実行: '+runId,
  '経過分: '+age,
  '',
  'Actionsのschedule、workflow無効化、権限、キャンセル、実行遅延を手動確認すること。',
  '実行済み監視による保管異常は#790の別Issue通知で扱う。',
  'この警告だけで暗号化バックアップの欠落や破損は確定しない。',
  '自動復旧・自動クローズ・D1/KP/Cloudflare/Discordへの書込みなし。'
 ].join('\n')};
}
export async function notifyBackupWatchdog(env=process.env,request=fetch){
 if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN||!env.DUEL_BACKUP_WATCHDOG_REPORT)
  throw Error('Authorized backup watchdog environment missing');
 let report;
 try{report=JSON.parse(readFileSync(env.DUEL_BACKUP_WATCHDOG_REPORT,'utf8'));}
 catch{throw Error('Backup watchdog report unreadable');}
 const alert=buildBackupWatchdogAlert(report);
 if(!alert)return 'healthy';
 const base='https://api.github.com/repos/altepop/keso-gamble';
 const headers={Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28'};
 const list=await request(base+'/issues?state=open&per_page=100',{
  headers,signal:AbortSignal.timeout(15000)});
 if(!list.ok)throw Error('Watchdog issue list HTTP '+list.status);
 const issues=await list.json();
 if(!Array.isArray(issues))throw Error('Invalid issue list');
 if(issues.some(x=>!x.pull_request&&x.title===WATCHDOG_ALERT_TITLE))return 'deduplicated';
 if(issues.length>=100)throw Error('Issue pagination unresolved: no safe deduplication');
 const created=await request(base+'/issues',{method:'POST',headers:{...headers,'Content-Type':'application/json'},
  body:JSON.stringify(alert),signal:AbortSignal.timeout(15000)});
 if(!created.ok)throw Error('Watchdog issue creation HTTP '+created.status);
 const result=await created.json();
 if(!Number.isSafeInteger(result?.number)||result.number<=0)
  throw Error('Watchdog Issue response invalid');
 console.log('DUEL_BACKUP_WATCHDOG_ALERT_CREATED #'+result.number);
 return 'created';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 notifyBackupWatchdog().catch(e=>{console.error('DUEL_BACKUP_WATCHDOG_ALERT_ERROR '+e.message);process.exitCode=1;});
