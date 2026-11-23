/** P12 backup readiness alert. A failed daily metadata assessment creates one
 * actionable GitHub Issue, with no Cloudflare/D1/KP/Discord access or auto-close.
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const BACKUP_ALERT_TITLE='P12 duel encrypted backup retention: action required';
const actionable=new Set(['missing','expired','expiring','unknown']);
export function buildBackupAlert(report){
 if(!report||report.ok!==false||!actionable.has(report.state))return null;
 const id=v=>Number.isSafeInteger(v)&&v>0?String(v):'未確認';
 const days=Number.isSafeInteger(report.daysRemaining)&&report.daysRemaining>=0?
  String(report.daysRemaining):'未確認';
 return {title:BACKUP_ALERT_TITLE,body:[
  'P12決闘の暗号化バックアップ保管メタデータ監視が異常を検出した。',
  '判定: '+report.state,
  '暗号化成果物ID: '+id(report.artifactId),
  'バックアップ実行ID: '+id(report.sourceRunId),
  '残存日数: '+days,
  '',
  'GitHub Actionsの暗号化バックアップworkflow、成果物保管期限・権限・失敗履歴を手動確認すること。',
  'unknownは監視自体が判定不能だった状態であり、バックアップ欠落を断定しない。',
  'メタデータの可用性のみを監視し、暗号文の整合性・復号鍵・復元成功は証明しない。',
  '自動復旧・自動クローズ・D1/KP/Cloudflare/Discordへの書込みはしない。',
  '未解決の同名Issueがあれば重複起票しない。'
 ].join('\n')};
}
export async function notifyBackupRetention(env=process.env,request=fetch){
 if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN||!env.DUEL_BACKUP_REPORT)
  throw Error('Authorized backup alert environment missing');
 let report;
 try{report=JSON.parse(readFileSync(env.DUEL_BACKUP_REPORT,'utf8'));}
 catch{throw Error('Backup readiness report unavailable or malformed');}
 const alert=buildBackupAlert(report);
 if(!alert){console.log('DUEL_BACKUP_ALERT_SKIP: no actionable anomaly');return 'healthy';}
 const base='https://api.github.com/repos/altepop/keso-gamble';
 const headers={Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28'};
 const res=await request(base+'/issues?state=open&per_page=100',{
  headers,signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('Backup alert issue inventory HTTP '+res.status);
 const issues=await res.json();
 if(!Array.isArray(issues))throw Error('Backup alert issue inventory invalid');
 if(issues.some(i=>!i.pull_request&&i.title===BACKUP_ALERT_TITLE)){
  console.log('DUEL_BACKUP_ALERT_DEDUPED');return 'deduplicated';
 }
 if(issues.length>=100)throw Error('Backup alert inventory saturated; cannot guarantee deduplication');
 const made=await request(base+'/issues',{method:'POST',
  headers:{...headers,'Content-Type':'application/json'},
  body:JSON.stringify(alert),signal:AbortSignal.timeout(15000)});
 if(!made.ok)throw Error('Backup alert issue create HTTP '+made.status);
 const record=await made.json();
 if(!Number.isSafeInteger(record?.number)||record.number<=0)
  throw Error('Backup alert issue create response invalid');
 console.log('DUEL_BACKUP_ALERT_CREATED #'+record.number);
 return 'created';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 notifyBackupRetention().catch(e=>{console.error('DUEL_BACKUP_ALERT_ERROR '+e.message);process.exitCode=1;});
}
