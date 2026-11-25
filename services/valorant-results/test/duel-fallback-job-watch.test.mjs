import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateFallbackJob,FALLBACK_JOB_ISSUE,inspectFallback,inspectAndNotifyFallback,fallbackIssue}
 from '../../../scripts/duel-fallback-job-watch.mjs';
const now=Date.parse('2026-11-24T04:00:00Z');
const env={GITHUB_TOKEN:'example-secret-key',GITHUB_REPOSITORY:'altepop/keso-gamble'};
const run=(minutes=45,event='schedule',status='completed',conclusion='success')=>({
 id:27,name:'D1 read-only insights report',event,status,conclusion,
 created_at:new Date(now-minutes*60000).toISOString()
});
const job=(status='completed',conclusion='success',name='deployment-watch-fallback')=>({id:31,name,status,conclusion});
const response=data=>({ok:true,json:async()=>data});
test('only exactly one successful fallback job is healthy; missing, skipped, failed or duplicate is not',()=>{
 assert.deepEqual(evaluateFallbackJob([job()],30),{state:'healthy',ok:true});
 assert.equal(evaluateFallbackJob([],30).state,'missing-job');
 assert.equal(evaluateFallbackJob([job('completed','skipped')],30).state,'skipped');
 assert.equal(evaluateFallbackJob([job('completed','failure')],30).state,'failed');
 assert.equal(evaluateFallbackJob([job(),job()],30).state,'unknown');
 assert.equal(evaluateFallbackJob([job('in_progress',null)],30).state,'running');
 assert.equal(evaluateFallbackJob([job('queued',null)],46).state,'stalled');
 assert.equal(evaluateFallbackJob(Array(100).fill(job()),30).state,'unknown');
});
test('only GitHub schedule metadata and jobs are read, never D1 or push',async()=>{
 const urls=[];
 const x=await inspectFallback(env,async(url,opts)=>{
  urls.push(url);assert.equal(opts.method,undefined);
  if(url.includes('/workflows/'))return response({workflow_runs:[run()]});
  if(url.includes('/runs/27/jobs'))return response({jobs:[job()]});
  throw Error('unexpected URL');
 },now);
 assert.equal(x.state,'healthy');
 assert.equal(urls.length,2);
 assert.match(urls[0],/event=schedule/);
 assert.match(urls[1],/\/actions\/runs\/27\/jobs\?per_page=100/);
 assert.ok(urls.every(u=>!u.includes('cloudflare')));
 await assert.rejects(inspectFallback({...env,GITHUB_TOKEN:''}),/Authorized/);
});
test('upstream missing schedule is delegated to #845 without jobs lookup or extra issue',async()=>{
 let count=0;
 const result=await inspectAndNotifyFallback(env,async url=>{
  count++;assert.match(url,/\/workflows\/d1-insights-report/);
  return response({workflow_runs:[]});
 },now);
 assert.deepEqual(result,{state:'upstream-missing',action:'skipped'});
 assert.equal(count,1);
});
test('deduplicates incident and issue creation excludes credentials and raw data',async()=>{
 const calls=[];const fake=async(url,opts={})=>{
  calls.push({url,opts});
  if(url.includes('/workflows/'))return response({workflow_runs:[run()]});
  if(url.includes('/runs/27/jobs'))return response({jobs:[]});
  if(url.includes('?state=open'))return response([]);
  if(opts.method==='POST')return response({number:88});
  throw Error('unexpected');
 };
 const result=await inspectAndNotifyFallback(env,fake,now);
 assert.deepEqual(result,{state:'missing-job',action:'created',number:88});
 assert.equal(calls.length,4);
 const body=JSON.parse(calls[3].opts.body);
 assert.equal(body.title,FALLBACK_JOB_ISSUE);
 assert.doesNotMatch(body.body,/example-secret-key|Bearer [A-Za-z0-9_.-]+/);
 const dedup=await inspectAndNotifyFallback(env,async(url)=>{
  if(url.includes('/workflows/'))return response({workflow_runs:[run()]});
  if(url.includes('/runs/27/jobs'))return response({jobs:[]});
  return response([{title:FALLBACK_JOB_ISSUE,number:88}]);
 },now);
 assert.equal(dedup.action,'deduplicated');
});
test('unknown API failure is not interpreted as a confirmed missing job',async()=>{
 const result=await inspectAndNotifyFallback(env,async url=>{
  if(url.includes('/workflows/'))return {ok:false,status:403};
  if(url.includes('?state=open'))return response([]);
  return response({number:89});
 },now);
 assert.equal(result.state,'unknown');
 assert.match(fallbackIssue('unknown',null).body,/断定できない/);
 assert.equal(fallbackIssue('upstream-missing',null),null);
});
