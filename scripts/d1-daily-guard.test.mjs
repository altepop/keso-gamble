import test from 'node:test';
import assert from 'node:assert/strict';
import {sumDailyRows,shouldConserve,runGuard,OPTIONAL_THRESHOLD,SETTING_KEY,D1_B_ID} from './d1-daily-guard.mjs';
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
