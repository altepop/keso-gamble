/** P12 scheduled duel operations audit notification.
 * Only aggregate counts and GitHub Issues metadata. No D1/KP/Cloudflare/Discord.
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const OPERATIONS_ALERT_TITLE='P12 duel scheduled operations audit: review required';
const validCount=v=>Number.isSafeInteger(v)&&v>=0;
/** Unknown is actionable when an audit report is inconsistent or incomplete.
 * Never trust malformed counts or a self-asserted successful state.
 */
export function classifyOperationsAuditReport(report){
 const counts=report?.counts;
 const completeCounts=counts&&typeof counts==='object'&&
  ['staleFinishedPve','staleFinishedPvp','activePve','activePvp']
   .every(key=>validCount(counts[key]));
 if(!report||typeof report!=='object'||Array.isArray(report)||
    report.deletionAuthorized!==false)return 'unknown';
 if(report.state==='unknown'&&report.ok===false)return 'unknown';
 if(report.ok!==true||!completeCounts)return 'unknown';
 const stale=counts.staleFinishedPve+counts.staleFinishedPvp;
 if(!Number.isSafeInteger(stale))return 'unknown';
 if(report.state==='healthy'&&stale===0)return 'healthy';
 if(report.state==='review'&&stale>0)return 'review';
 return 'unknown';
}
export function buildOperationsAlert(report){
 const classification=classifyOperationsAuditReport(report);
 if(classification==='healthy')return null;
 const unknown=classification==='unknown';
 const counts=classification==='review'?report.counts:null;
 const review=classification==='review';
 return {title:OPERATIONS_ALERT_TITLE,body:[
  'P12決闘の定期集計監査で確認が必要な状態を検知した。',
  '判定: '+(unknown?'unknown (監査未実施・判定失敗の可能性)':'review (保管期間超過の終了済み記録あり)'),
  'PvE 90日超の終了済み記録: '+(review?counts.staleFinishedPve:'未確認'),
  'PvP 30日超の終了済み記録: '+(review?counts.staleFinishedPvp:'未確認'),
  '稼働中PvE: '+(review?counts.activePve:'未確認'),
  '稼働中PvP: '+(review?counts.activePvp:'未確認'),
  '',
  'これは保存方針の確認依頼であり、消去指示やセキュリティ侵害確定ではない。',
  'unknownの場合は監査用資格情報・D1読取り・GitHub Actions実行履歴を確認すること。',
  '自動削除・自動復旧・自動クローズなし。D1/KP/Cloudflare/Discordの書込みなし。',
  '監査結果は全ギルド集計値のみであり、ユーザーIDや個別対戦を含めない。'
 ].join('\n')};
}
export async function notifyOperationsAudit(env=process.env,request=fetch){
 if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN||!env.DUEL_OPERATIONS_AUDIT_REPORT)
  throw Error('Authorized operations audit notification environment unavailable');
 let report;
 try{report=JSON.parse(readFileSync(env.DUEL_OPERATIONS_AUDIT_REPORT,'utf8'));}
 catch{report={state:'unknown',ok:false,deletionAuthorized:false};}
 const alert=buildOperationsAlert(report);
 if(!alert){console.log('DUEL_OPERATIONS_ALERT_SKIP');return 'healthy';}
 const base='https://api.github.com/repos/altepop/keso-gamble';
 const headers={Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28'};
 const list=await request(base+'/issues?state=open&per_page=100',{
  headers,signal:AbortSignal.timeout(15000)});
 if(!list.ok)throw Error('Operations alert issue inventory HTTP '+list.status);
 const issues=await list.json();
 if(!Array.isArray(issues))throw Error('Operations alert issue inventory invalid');
 if(issues.some(i=>!i.pull_request&&i.title===OPERATIONS_ALERT_TITLE))return 'deduplicated';
 if(issues.length>=100)throw Error('Operations alert issue inventory saturated; cannot deduplicate');
 const made=await request(base+'/issues',{method:'POST',
  headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(alert),
  signal:AbortSignal.timeout(15000)});
 if(!made.ok)throw Error('Operations alert issue creation HTTP '+made.status);
 const record=await made.json();
 if(!Number.isSafeInteger(record?.number)||record.number<=0)
  throw Error('Operations alert issue confirmation invalid');
 console.log('DUEL_OPERATIONS_ALERT_CREATED #'+record.number);
 return 'created';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 notifyOperationsAudit().catch(e=>{console.error('DUEL_OPERATIONS_ALERT_ERROR '+e.message);process.exitCode=1;});
