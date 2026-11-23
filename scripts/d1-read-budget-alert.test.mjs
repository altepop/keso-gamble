import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {D1_READ_ALERT_TITLE,classifyD1ReadBudget,buildD1ReadBudgetAlert,buildDailyReadEvidence,notifyD1ReadBudget}
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
  assert.equal(await notifyD1ReadBudget(env,async()=>({ok:true,json:async()=>[{title:D1_READ_ALERT_TITLE,number:321,created_at:'2026-11-23T09:00:00Z'}]}),Date.parse('2026-11-23T18:00:00Z')),'deduplicated');
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

test('daily evidence is a single sanitized UTC-day follow-up for the existing Issue',async()=>{
 const timestamp=Date.parse('2026-11-24T03:00:00Z');
 assert.equal(buildDailyReadEvidence(good,timestamp),null);
 const body=buildDailyReadEvidence(warning,timestamp);
 assert.match(body,/p12-d1-read-budget-day:2026-11-24/);
 assert.match(body,/376078/);
 assert.match(body,/80,000/);
 assert.match(body,/hard capは未設定/);
 assert.doesNotMatch(body,/SELECT|Bearer|guild_id|user_id|match_id/);
 await withReport(warning,async env=>{
  const requests=[];
  const responder=async(url,opts)=>{
   requests.push({url,opts});
   if(url.includes('/comments?'))return {ok:true,json:async()=>[]};
   if(url.endsWith('/comments'))return {ok:true,json:async()=>({id:444})};
   return {ok:true,json:async()=>[{title:D1_READ_ALERT_TITLE,number:818,
    created_at:'2026-11-23T10:18:35Z'}]};
  };
  assert.equal(await notifyD1ReadBudget(env,responder,timestamp),'commented');
  assert.equal(requests.length,3);
  assert.deepEqual(requests.map(x=>x.opts.method||'GET'),['GET','GET','POST']);
  assert.match(requests[2].url,/issues\/818\/comments$/);
  const posted=JSON.parse(requests[2].opts.body).body;
  assert.match(posted,/p12-d1-read-budget-day:2026-11-24/);
  assert.doesNotMatch(posted,/SELECT|user_id|Bearer/);
 });
});
test('same-day follow-up is deduplicated and cannot spam a persistent issue',async()=>{
 const timestamp=Date.parse('2026-11-24T19:00:00Z'),marker='<!-- p12-d1-read-budget-day:2026-11-24 -->';
 await withReport(warning,async env=>{
  let calls=0;
  const existing={title:D1_READ_ALERT_TITLE,number:818,created_at:'2026-11-23T10:18:35Z'};
  const fetcher=async(url)=>{
   calls++;
   return {ok:true,json:async()=>url.includes('/comments?')
    ?[{body:marker+' already recorded'}]:[existing]};
  };
  assert.equal(await notifyD1ReadBudget(env,fetcher,timestamp),'deduplicated');
  assert.equal(calls,2,'never submit another issue or comment');
 });
});
test('invalid or unavailable comment inventory fails closed without creating duplicate',async()=>{
 const timestamp=Date.parse('2026-11-24T19:00:00Z');
 await withReport(warning,async env=>{
  const existing={title:D1_READ_ALERT_TITLE,number:818,created_at:'2026-11-23T10:18:35Z'};
  for(const comments of [null,Array.from({length:100},()=>({body:'prior'}))]){
   const fetcher=async(url,options)=>({
    ok:true,json:async()=>url.includes('/comments?')?comments:[existing]});
   await assert.rejects(notifyD1ReadBudget(env,fetcher,timestamp),/unavailable or saturated/);
  }
  const bad=async()=>({ok:true,json:async()=>[{title:D1_READ_ALERT_TITLE,number:818}]});
  await assert.rejects(notifyD1ReadBudget(env,bad,timestamp),/metadata invalid/);
  const down=async(url)=>url.includes('/comments?')?{ok:false,status:403}:
   {ok:true,json:async()=>[existing]};
  await assert.rejects(notifyD1ReadBudget(env,down,timestamp),/HTTP 403/);
 });
});
