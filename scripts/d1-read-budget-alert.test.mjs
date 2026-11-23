import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {D1_READ_ALERT_TITLE,classifyD1ReadBudget,buildD1ReadBudgetAlert,notifyD1ReadBudget}
 from './d1-read-budget-alert.mjs';
const base={threshold:80000,source:'top-50-insights-lower-bound',hardCapConfigured:false,
 oneHourSources:2,insightsWindows:4,insightsErrors:0};
const good={...base,state:'healthy',ok:true,readLowerBound:16457};
const warning={...base,state:'warning',ok:false,readLowerBound:376078};
const unknown={...base,state:'unknown',ok:false,readLowerBound:null};
test('validated warning reflects an existing threshold, no fabricated hard cap',()=>{
 assert.equal(classifyD1ReadBudget(good),'healthy');
 assert.equal(classifyD1ReadBudget(warning),'warning');
 assert.equal(classifyD1ReadBudget(unknown),'unknown');
 const issue=buildD1ReadBudgetAlert(warning);
 assert.equal(issue.title,D1_READ_ALERT_TITLE);
 assert.match(issue.body,/376078/);
 assert.match(issue.body,/80,000/);
 assert.match(issue.body,/hard capは未設定/);
 assert.doesNotMatch(issue.body,/SELECT|WHERE|Bearer|user_id|match_id/);
});
test('malformed/incomplete or contradictory JSON is unknown and cannot silently skip',()=>{
 for(const input of [null,[],{}, {...good,state:'warning'}, {...good,ok:false},
  {...warning,readLowerBound:80000},{...warning,readLowerBound:'376078'},
  {...warning,hardCapConfigured:true},{...good,insightsErrors:1},
  {...good,oneHourSources:1},{...good,source:'actual-account-usage'}]){
  assert.equal(classifyD1ReadBudget(input),'unknown');
  assert.match(buildD1ReadBudgetAlert(input).body,/unknown/);
  assert.doesNotMatch(buildD1ReadBudgetAlert(input).body,/376078/);
 }
 assert.equal(buildD1ReadBudgetAlert(good),null);
});
async function withReport(value,fn){
 const dir=mkdtempSync(join(tmpdir(),'d1-read-alert-')),path=join(dir,'report.json');
 try{
  if(value!==null)writeFileSync(path,JSON.stringify(value));
  return await fn({GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'test',D1_READ_AUDIT_REPORT:path});
 }finally{rmSync(dir,{force:true,recursive:true});}
}
test('healthy report performs no GitHub requests',async()=>{
 await withReport(good,async env=>{
  assert.equal(await notifyD1ReadBudget(env,()=>{throw Error('unexpected request')}),'healthy');
 });
});
test('warned report creates one redacted Issue and deduplicates repeats',async()=>{
 await withReport(warning,async env=>{
  const calls=[];
  const request=async(url,opts)=>{
   calls.push({url,opts});
   return {ok:true,json:async()=>opts.method==='POST'?{number:321}:[]};
  };
  assert.equal(await notifyD1ReadBudget(env,request),'created');
  assert.deepEqual(calls.map(x=>x.opts.method||'GET'),['GET','POST']);
  assert.equal(JSON.parse(calls[1].opts.body).title,D1_READ_ALERT_TITLE);
  assert.ok(calls.every(x=>x.url.startsWith('https://api.github.com/repos/altepop/keso-gamble/')));
  assert.equal(await notifyD1ReadBudget(env,async()=>({ok:true,json:async()=>[{title:D1_READ_ALERT_TITLE}]})),'deduplicated');
 });
});
test('missing report and API errors fail closed; never claim healthy',async()=>{
 await withReport(null,async env=>{
  const calls=[];
  const result=await notifyD1ReadBudget(env,async(url,opts)=>{
   calls.push(opts);
   return {ok:true,json:async()=>opts.method==='POST'?{number:4}:[]};
  });
  assert.equal(result,'created');
  assert.match(JSON.parse(calls[1].body).body,/unknown/);
  await assert.rejects(notifyD1ReadBudget(env,async()=>({ok:false,status:403})),/HTTP 403/);
  await assert.rejects(notifyD1ReadBudget(env,async()=>({ok:true,json:async()=>Array.from({length:100},(_,i)=>({number:i+1,title:'unrelated'}))})),/saturated/);
 });
 await withReport(good,async env=>{
  await assert.rejects(notifyD1ReadBudget({...env,GITHUB_REPOSITORY:'other'},()=>{throw Error('network')}),/Authorized/);
 });
});
