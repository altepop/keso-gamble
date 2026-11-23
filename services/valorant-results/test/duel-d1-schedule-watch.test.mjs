import test from 'node:test';
import assert from 'node:assert/strict';
import {D1_SCHEDULE_ALERT_TITLE,evaluateD1Schedule,inspectD1Schedule,inspectAndNotify,d1ScheduleIssue}
 from '../../../scripts/duel-d1-schedule-watch.mjs';
const now=Date.parse('2026-11-24T03:00:00Z');
const run=(minutes=70,status='completed',conclusion='success',event='schedule')=>({
 id:42,name:'D1 read-only insights report',event,status,conclusion,
 created_at:new Date(now-minutes*60000).toISOString()
});
const env={GITHUB_TOKEN:'fixture',GITHUB_REPOSITORY:'altepop/keso-gamble'};
const reply=obj=>({ok:true,json:async()=>obj});
test('D1 scheduled heartbeat excludes push/dispatch and detects missing/stale',()=>{
 assert.deepEqual(evaluateD1Schedule([run()],now),{ok:true,state:'healthy',runId:42,ageMinutes:70});
 assert.equal(evaluateD1Schedule([],now).state,'missing');
 assert.equal(evaluateD1Schedule([run(151)],now).state,'stale');
 assert.equal(evaluateD1Schedule([run(10,'completed','success','push')],now).state,'missing');
 assert.equal(evaluateD1Schedule([run(10,'completed','success','workflow_dispatch')],now).state,'missing');
 assert.equal(evaluateD1Schedule([run(10),run(70,'completed','failure')],now).state,'healthy');
 assert.equal(evaluateD1Schedule([{...run(),id:0}],now).state,'missing');
 assert.equal(evaluateD1Schedule([{...run(),created_at:new Date(now+1000).toISOString()}],now).state,'missing');
});
test('recent failed and stalled scheduled runs cannot pass',()=>{
 assert.equal(evaluateD1Schedule([run(30,'completed','failure')],now).state,'failed');
 assert.deepEqual(evaluateD1Schedule([run(30,'in_progress',null)],now),
  {ok:true,state:'running',runId:42,ageMinutes:30});
 assert.equal(evaluateD1Schedule([run(50,'queued',null)],now).state,'stalled');
});
test('metadata-only API has strict event schedule filter, does not call D1',async()=>{
 let count=0;
 const result=await inspectD1Schedule(env,async(url,opts)=>{
  count++;
  assert.match(url,/\/actions\/workflows\/d1-insights-report\.yml\/runs\?event=schedule&per_page=10$/);
  assert.equal(opts.method,undefined);
  assert.doesNotMatch(url,/cloudflare|\/d1\/database\/|kp\//);
  return reply({workflow_runs:[run()]});
 },now);
 assert.equal(count,1);assert.equal(result.state,'healthy');
 await assert.rejects(inspectD1Schedule({...env,GITHUB_TOKEN:''}),/Authorized/);
});
test('creates one GitHub issue and deduplicates subsequent alerts',async()=>{
 const calls=[];
 const request=async(url,opts={})=>{
  calls.push({url,opts});
  if(url.includes('/actions/workflows/'))return reply({workflow_runs:[]});
  if(url.includes('?state=open'))return reply([]);
  if(opts.method==='POST')return reply({number:55});
  throw Error('unexpected request');
 };
 const res=await inspectAndNotify(env,request,now);
 assert.deepEqual(res,{state:'missing',action:'created',issue:55});
 assert.equal(calls.length,3);
 assert.equal(calls[2].opts.method,'POST');
 assert.equal(JSON.parse(calls[2].opts.body).title,D1_SCHEDULE_ALERT_TITLE);
 assert.doesNotMatch(JSON.stringify(JSON.parse(calls[2].opts.body)),/fixture|token|cloudflare/i);
 const dedup=await inspectAndNotify(env,async(url)=>{
  if(url.includes('/actions/workflows/'))return reply({workflow_runs:[]});
  return reply([{title:D1_SCHEDULE_ALERT_TITLE,number:55}]);
 },now);
 assert.equal(dedup.action,'deduplicated');
});
test('healthy and running states never post an issue',async()=>{
 const healthy=await inspectAndNotify(env,async(url)=>{
  if(!url.includes('/actions/workflows/'))throw Error('issue lookup forbidden');
  return reply({workflow_runs:[run()]});
 },now);
 assert.equal(healthy.action,'healthy');
});
test('API outage is unknown, no false claim; saturated issue list fails closed',async()=>{
 const result=await inspectAndNotify(env,async(url)=>{
  if(url.includes('/actions/workflows/'))return {ok:false,status:403};
  if(url.includes('?state=open'))return reply([]);
  return reply({number:99});
 },now);
 assert.equal(result.state,'unknown');
 assert.match(d1ScheduleIssue({ok:false,state:'unknown'}).body,/断定しない/);
 assert.equal(d1ScheduleIssue({ok:true,state:'healthy'}),null);
 await assert.rejects(inspectAndNotify(env,async url=>{
  if(url.includes('/actions/workflows/'))return reply({workflow_runs:[]});
  return reply(Array.from({length:100},(_,i)=>({number:i+1,title:'other'})));
 },now),/saturated/);
});
