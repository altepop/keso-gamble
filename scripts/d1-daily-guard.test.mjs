import test from 'node:test';
import assert from 'node:assert/strict';
import {sumDailyRows,shouldConserve,runGuard,dailyAnalyticsCoverage,ANALYTICS_PAGE_LIMIT,OPTIONAL_THRESHOLD,SETTING_KEY,D1_B_ID,D1_CAP_STATUS} from './d1-daily-guard.mjs';
const day='2026-11-01';
const result=(n)=>({data:{viewer:{accounts:[{d1AnalyticsAdaptiveGroups:[
 {dimensions:{date:day,databaseId:'a'},sum:{rowsRead:n,rowsWritten:0}},
 {dimensions:{date:day,databaseId:'b'},sum:{rowsRead:50,rowsWritten:0}},
 {dimensions:{date:'2026-10-31',databaseId:'a'},sum:{rowsRead:5_000_000}},
]}]}}});
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'test-token'};
test('UTC-day account estimate sums ALL D1s but excludes yesterday and rejects malformed data',()=>{
 assert.equal(sumDailyRows(result(100).data.viewer.accounts[0],day),150);
 assert.throws(()=>sumDailyRows({},day),/Missing/);
 assert.throws(()=>sumDailyRows({d1AnalyticsAdaptiveGroups:[{dimensions:{date:day},sum:{rowsRead:-5}}]},day),/Invalid/);
 assert.equal(shouldConserve(OPTIONAL_THRESHOLD-1),false);
 assert.equal(shouldConserve(OPTIONAL_THRESHOLD),true);
});
test('normal and warning modes never write to production D1',async()=>{
 for(const read of [100,3_500_000]){
  const calls=[];
  const fetch=async(url,req)=>{calls.push({url,req});return {ok:true,json:async()=>result(read)};};
  const r=await runGuard(env,fetch,new Date('2026-11-01T15:00:00Z'));
  assert.equal(r.status,read<3_500_000?'ok':'warning');
  assert.equal(calls.length,1,'only account read-only GraphQL called');
  const payload=JSON.parse(calls[0].req.body);
  assert.equal(payload.variables.day,'2026-11-01');
  assert.equal(payload.variables.accountTag,env.CLOUDFLARE_ACCOUNT_ID);
 }
});
test('4M sampled account estimate switches ONLY current UTC-day optional feed/trend mode',async()=>{
 const calls=[];
 const fetch=async(url,req)=>{
  calls.push({url,body:JSON.parse(req.body)});
  if(url.includes('/graphql'))return {ok:true,json:async()=>result(4_000_000)};
  return {ok:true,json:async()=>({success:true,result:[{success:true}]})};
 };
 const result_=await runGuard(env,fetch,new Date('2026-11-01T17:00:00Z'));
 assert.equal(result_.status,'conserve');
 assert.equal(calls.length,2);
 assert.ok(calls[1].url.includes('/d1/database/'+D1_B_ID+'/query'));
 assert.equal(calls[1].body.params[0],day);
 assert.match(calls[1].body.sql,/^INSERT INTO kp_settings\(key,value\)/);
 assert.ok(calls[1].body.sql.includes(SETTING_KEY));
 assert.doesNotMatch(calls[1].body.sql,/DELETE|UPDATE kp_wallets|kp_ledger|kp_operations/);
});
test('missing or unusable GraphQL metrics never activate optional throttling',async()=>{
 const calls=[];
 const empty=await runGuard({},async()=>{calls.push(1);throw Error('must not call');},new Date('2026-11-01T13:00:00Z'));
 assert.equal(empty.status,'unavailable');assert.equal(calls.length,0);
 await assert.rejects(runGuard(env,async()=>({ok:true,json:async()=>({data:{viewer:{accounts:[]}}})}),new Date('2026-11-01T13:00:00Z')),/unavailable/);
});

test('daily write estimate includes every database in UTC today, and a write warning never throttles wallets',async()=>{
 const {sumDailyWrittenRows,WRITE_WARNING_THRESHOLD}=await import('./d1-daily-guard.mjs');
 const payload=result(100);const account=payload.data.viewer.accounts[0];
 account.d1AnalyticsAdaptiveGroups[0].sum.rowsWritten=WRITE_WARNING_THRESHOLD;
 account.d1AnalyticsAdaptiveGroups[1].sum.rowsWritten=123;
 assert.equal(sumDailyWrittenRows(account,day),WRITE_WARNING_THRESHOLD+123);
 assert.throws(()=>sumDailyWrittenRows({d1AnalyticsAdaptiveGroups:[{dimensions:{date:day},sum:{rowsRead:1}}]},day),/Invalid/);
 let calls=0;const r=await runGuard(env,async()=>{calls++;return {ok:true,json:async()=>payload};},new Date(day+'T15:00:00Z'));
 assert.equal(calls,1);assert.equal(r.status,'ok');assert.equal(r.writtenEstimate,WRITE_WARNING_THRESHOLD+123);
});

test('account-wide daily analytics reports missing, empty and saturated coverage as unknown',async()=>{
 const now=new Date(day+'T12:00:00Z');
 const cases=[
  {reason:'empty',groups:[]},
  {reason:'current-day-missing',groups:[{dimensions:{date:'2026-10-31'},sum:{rowsRead:500}}]},
  {reason:'saturated',groups:Array.from({length:ANALYTICS_PAGE_LIMIT},(_,i)=>({
   dimensions:{date:day,databaseId:String(i)},
   sum:{rowsRead:50000,rowsWritten:0}
  }))}
 ];
 for(const item of cases){
  const account={d1AnalyticsAdaptiveGroups:item.groups};
  assert.deepEqual(dailyAnalyticsCoverage(account,day),{complete:false,reason:item.reason});
  const calls=[];
  const fetcher=async(url,options)=>{
   calls.push({url,options});
   assert.match(url,/\/graphql$/);
   return {ok:true,json:async()=>({data:{viewer:{accounts:[account]}}})};
  };
  const outcome=await runGuard(env,fetcher,now);
  assert.deepEqual(outcome,{status:'unavailable',day,reason:item.reason,...D1_CAP_STATUS});
  assert.equal(calls.length,1,'no settings write or D1 mutation with incomplete estimates');
 }
});
test('below page limit with current UTC-day observations remains a soft estimate only',()=>{
 const groups=Array.from({length:ANALYTICS_PAGE_LIMIT-1},(_,i)=>({
  dimensions:{date:day,databaseId:String(i)},sum:{rowsRead:0,rowsWritten:0}
 }));
 assert.deepEqual(dailyAnalyticsCoverage({d1AnalyticsAdaptiveGroups:groups},day),{complete:true,reason:null});
 assert.equal(shouldConserve(0),false);
});

test('every D1 guard outcome must explicitly state no configured or verified hard cap',async()=>{
 const statuses=[];
 statuses.push(await runGuard({},async()=>{throw Error('network not allowed');},new Date(day+'T12:00:00Z')));
 for(const estimate of [100,3_500_000,4_000_000]){
  const mock=async(url)=>url.endsWith('/graphql')?
   {ok:true,json:async()=>result(estimate)}:
   {ok:true,json:async()=>({success:true,result:[{success:true}]})};
  statuses.push(await runGuard(env,mock,new Date(day+'T12:00:00Z')));
 }
 assert.equal(D1_CAP_STATUS.hardCapConfigured,false);
 assert.equal(D1_CAP_STATUS.hardCapVerified,false);
 assert.equal(D1_CAP_STATUS.hardCapEnforcement,'not-configured');
 assert.equal(D1_CAP_STATUS.softConserveScope,'optional-feed-and-trend-only');
 for(const value of statuses){
  assert.equal(value.hardCapConfigured,false);
  assert.equal(value.hardCapVerified,false);
  assert.equal(value.hardCapEnforcement,'not-configured');
  assert.equal(value.softConserveScope,'optional-feed-and-trend-only');
 }
});
