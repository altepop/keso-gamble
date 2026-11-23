/** P12 D1 Insights alert: sanitized GitHub Issue only. No D1/KP writes. */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const D1_READ_ALERT_TITLE='P12 D1 1h read budget: review required';
const THRESHOLD=80000;
const validCount=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
export function classifyD1ReadBudget(report){
 if(!report||typeof report!=='object'||Array.isArray(report)||
  report.threshold!==THRESHOLD||report.hardCapConfigured!==false||
  report.source!=='top-50-insights-lower-bound')return 'unknown';
 if(report.state==='warning'&&report.ok===false&&report.oneHourSources===2&&
  validCount(report.readLowerBound)&&report.readLowerBound>THRESHOLD)return 'warning';
 if(report.state==='healthy'&&report.ok===true&&report.oneHourSources===2&&
  report.insightsWindows===4&&report.insightsErrors===0&&
  validCount(report.readLowerBound)&&report.readLowerBound<=THRESHOLD)return 'healthy';
 return 'unknown';
}
export function buildD1ReadBudgetAlert(report){
 const state=classifyD1ReadBudget(report);
 if(state==='healthy')return null;
 return {title:D1_READ_ALERT_TITLE,body:[
  'P12 D1読取り監査の確認が必要だ。',
  '状態: '+(state==='warning'?'warning (上位50SQLの1時間読取り下限値が閾値超過)':'unknown (監査レポート未取得・不整合・取得不能の可能性)'),
  '1時間Rows read下限値: '+(state==='warning'?String(report.readLowerBound):'未確認'),
  '既存警告閾値: 80,000 Rows read/h（変更なし）',
  '対象はCloudflare D1 Insightsの上位50SQLであり、全D1使用量・請求・残余枠の確定値ではない。',
  'Cloudflare/D1の集計や権限、GitHub Actionsのinspectジョブを調査すること。',
  'D1厳密hard capは未設定。自動削除・KP変更・強制停止・再実行・課金操作は一切なし。',
  'これは単一GitHub Issueの重複防止通知であり、SQL本文やユーザーIDを公開しない。'
 ].join('\n')};
}
export async function notifyD1ReadBudget(env=process.env,request=fetch){
 if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN||
  !env.D1_READ_AUDIT_REPORT)throw Error('Authorized D1 alert environment missing');
 let report;
 try{report=JSON.parse(readFileSync(env.D1_READ_AUDIT_REPORT,'utf8'));}
 catch{report=null;}
 const alert=buildD1ReadBudgetAlert(report);
 if(!alert){console.log('D1_READ_BUDGET_ALERT_SKIP healthy');return 'healthy';}
 const base='https://api.github.com/repos/altepop/keso-gamble';
 const headers={Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28'};
 const inventory=await request(base+'/issues?state=open&per_page=100',{
  headers,signal:AbortSignal.timeout(15000)});
 if(!inventory.ok)throw Error('D1 alert Issue lookup HTTP '+inventory.status);
 const issues=await inventory.json();
 if(!Array.isArray(issues))throw Error('D1 alert Issue inventory invalid');
 if(issues.some(item=>!item.pull_request&&item.title===D1_READ_ALERT_TITLE))
  return 'deduplicated';
 if(issues.length>=100)throw Error('D1 alert Issue inventory saturated');
 const response=await request(base+'/issues',{method:'POST',
  headers:{...headers,'Content-Type':'application/json'},
  body:JSON.stringify(alert),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('D1 alert Issue creation HTTP '+response.status);
 const created=await response.json();
 if(!Number.isSafeInteger(created?.number)||created.number<=0)
  throw Error('D1 alert Issue creation unconfirmed');
 console.log('D1_READ_BUDGET_ALERT_CREATED #'+created.number);
 return 'created';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 notifyD1ReadBudget().catch(e=>{console.error('D1_READ_BUDGET_ALERT_ERROR '+e.message);process.exitCode=1;});
