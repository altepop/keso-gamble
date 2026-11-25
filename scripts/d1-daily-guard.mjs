// Cloudflare GraphQL D1 analytics: current UTC billing day across ALL D1s.
// This dataset is estimated/adaptively sampled and can lag the enforced free
// quota; therefore never halt settlements, ranks, wallets or purchases.
// If the estimate crosses 4M, enable *only* optional read degradation for
// that UTC day. The flag expires automatically at 09:00 JST.
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const OPTIONAL_THRESHOLD=4_000_000,WARNING_THRESHOLD=3_500_000;
export const D1_B_ID='bf23ab40-814f-4626-9e0b-36739ac41750';
export const SETTING_KEY='d1_optional_conserve_utc_day';
/** Operator-facing P12 D1 cap contract: telemetry is sampled and no exact
 * account-wide D1 hard cap has been installed or verified on this account.
 * Free-tier quota enforcement is provided by Cloudflare when the plan is Free,
 * not by this sampled guard. Do not imply any Paid D1 invoice ceiling.
 */
export const D1_CAP_STATUS=Object.freeze({hardCapConfigured:false,hardCapVerified:false,
 hardCapEnforcement:'not-configured',softConserveScope:'optional-feed-and-trend-only'});


function sumMetric(account,utcDay,metric){
 if(!account||!Array.isArray(account.d1AnalyticsAdaptiveGroups))throw Error('Missing D1 analytics');
 let total=0;
 for(const group of account.d1AnalyticsAdaptiveGroups){
  if(group?.dimensions?.date!==utcDay)continue;
  const count=Number(group?.sum?.[metric]);
  if(!Number.isSafeInteger(count)||count<0)throw Error('Invalid D1 row sum');
  total+=count;
 }
 if(!Number.isSafeInteger(total))throw Error('D1 sum overflow');
 return total;
}
export const sumDailyRows=(account,day)=>sumMetric(account,day,'rowsRead');
export const sumDailyWrittenRows=(account,day)=>sumMetric(account,day,'rowsWritten');
export const WRITE_WARNING_THRESHOLD=70_000;
export const ANALYTICS_PAGE_LIMIT=100;
/** A bounded GraphQL response cannot prove account-wide coverage when saturated.
 * Empty/current-day-missing data must not be called zero usage.
 */
export function dailyAnalyticsCoverage(account,day){
 const groups=account?.d1AnalyticsAdaptiveGroups;
 if(!Array.isArray(groups)||groups.length===0)return {complete:false,reason:'empty'};
 if(groups.length>=ANALYTICS_PAGE_LIMIT)return {complete:false,reason:'saturated'};
 if(!groups.some(g=>g?.dimensions?.date===day))return {complete:false,reason:'current-day-missing'};
 return {complete:true,reason:null};
}
export function shouldConserve(estimate){return Number.isSafeInteger(estimate)&&estimate>=OPTIONAL_THRESHOLD;}
export const gqlQuery=`query D1DailyBudget($accountTag: string!, $day: Date!) {
 viewer { accounts(filter:{accountTag:$accountTag}) {
  d1AnalyticsAdaptiveGroups(limit:100,filter:{date_geq:$day,date_leq:$day},orderBy:[date_DESC]){
   dimensions{date databaseId}
   sum{rowsRead rowsWritten}
  }
 } }
}`;
export async function runGuard(env=process.env,request=fetch,now=new Date()){
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 const day=now.toISOString().slice(0,10);
 if(!/^[a-f\d]{32}$/i.test(account??'')||!token){
  console.warn('D1_BUDGET_UNAVAILABLE: Analytics credentials missing');
  return {status:'unavailable',day,...D1_CAP_STATUS};
 }
 const auth={'Authorization':'Bearer '+token,'Content-Type':'application/json'};
 const resp=await request('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:auth,body:JSON.stringify({query:gqlQuery,variables:{accountTag:account,day}}),signal:AbortSignal.timeout(18000)});
 if(!resp.ok)throw Error('D1 GraphQL HTTP '+resp.status);
 const data=await resp.json();
 if(data.errors?.length||data.data?.viewer?.accounts?.length!==1)throw Error('D1 Analytics response unavailable');
 const accountData=data.data.viewer.accounts[0];
 const coverage=dailyAnalyticsCoverage(accountData,day);
 if(!coverage.complete){
  console.warn('D1_BUDGET_COVERAGE_UNKNOWN '+day+' reason='+coverage.reason+' sampled=true hard_cap=false');
  if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,
   '\n## D1 budget telemetry incomplete\n\nUTC day: '+day+
   '; reason: '+coverage.reason+
   '. No optional flag written. Account-wide quota and spending **not guaranteed**; hard cap **not configured**.\n');
  return {status:'unavailable',day,reason:coverage.reason,...D1_CAP_STATUS};
 }
 const estimate=sumDailyRows(accountData,day);
 console.log('D1_ACCOUNT_DAILY_ESTIMATE '+day+' rows='+estimate+' sampled=true alert='+WARNING_THRESHOLD+' conserve='+OPTIONAL_THRESHOLD);
 let writtenEstimate=null;
 try{writtenEstimate=sumDailyWrittenRows(accountData,day);}
 catch{console.warn('D1_WRITE_ESTIMATE_UNAVAILABLE');}
 console.log('D1_ACCOUNT_DAILY_WRITES_ESTIMATE '+day+' rows='+(writtenEstimate??'unknown')+' sampled=true alert='+WRITE_WARNING_THRESHOLD);
 if(writtenEstimate!==null&&writtenEstimate>=WRITE_WARNING_THRESHOLD)console.warn('D1_WRITE_BUDGET_WARNING '+day+' rows='+writtenEstimate+' sampled=true');
 let status='ok';
 if(estimate>=WARNING_THRESHOLD){status='warning';console.warn('D1_BUDGET_WARNING '+day+' rows='+estimate+' sampled=true');}
 if(shouldConserve(estimate)){
  // Only set one UTC-day marker, never change any financial/ledger tables.
  const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+D1_B_ID+'/query';
  const sql="INSERT INTO kp_settings(key,value) VALUES('d1_optional_conserve_utc_day',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value";
  const result=await request(api,{method:'POST',headers:auth,body:JSON.stringify({sql,params:[day]}),signal:AbortSignal.timeout(18000)});
  if(!result.ok)throw Error('D1 optional mode write HTTP '+result.status);
  const saved=await result.json();
  if(saved.success!==true||!Array.isArray(saved.result)||!saved.result.every(r=>r?.success===true))
   throw Error('D1 optional mode confirmation unavailable');
  console.log('D1_OPTIONAL_MODE_ENABLED UTC_DAY='+day+' scope=feed,trend');
  status='conserve';
 }
 if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,[
  '','## D1 account-wide daily budget (Cloudflare GraphQL)',
  '', '| Metric | Value |','|:--|--:|',
  '| Billing day (UTC) | '+day+' |',
  '| Estimated Rows read across all account D1 databases | '+estimate.toLocaleString('en-US')+' |',
  '| Estimated Rows written across all account D1 databases | '+(writtenEstimate===null?'unknown':writtenEstimate.toLocaleString('en-US'))+' |',
  '| Write warning (estimated; no financial throttling) | '+WRITE_WARNING_THRESHOLD.toLocaleString('en-US')+' |',
  '| Warning (estimated) | '+WARNING_THRESHOLD.toLocaleString('en-US')+' |',
  '| Optional-history soft mode threshold (estimated) | '+OPTIONAL_THRESHOLD.toLocaleString('en-US')+' |',
  '| Result | '+status+' |',
  '',
  'Cloudflare GraphQL is adaptively sampled, can be incomplete and may lag actual quota. This is a best-effort soft mode, NOT a hard usage guarantee. No account-wide hard spending cap is configured. Core KP/ranking/races/stock/settlements are never stopped.',
  ''
 ].join('\n'));
 return {status,day,estimate,writtenEstimate,...D1_CAP_STATUS};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 runGuard().catch(error=>{console.error('D1_BUDGET_GUARD_ERROR '+(error instanceof Error?error.message:'unknown'));process.exitCode=1;});
}
