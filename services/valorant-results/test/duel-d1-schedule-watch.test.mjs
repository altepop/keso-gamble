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
 assert.doesNotMatch(JSON.stringify(JSON.parse(calls[2].opts.body)),/fixture|Bearer\\s+[A-Za-z0-9_.-]+/i);
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

 // Sanitized job/step metadata from real Scheduled D1 #207, run 45450717843.
 const actual207=[{"name":"deployment-watch-fallback","status":"completed","conclusion":"failure","steps":[{"name":"Set up job","status":"completed","conclusion":"success"},{"name":"Run actions/checkout@v7","status":"completed","conclusion":"success"},{"name":"Run actions/setup-node@v7","status":"completed","conclusion":"success"},{"name":"Verify P12 monitor decisions without D1 or KP","status":"completed","conclusion":"success"},{"name":"Fallback check of production Pages and Worker via GitHub metadata","status":"completed","conclusion":"success"},{"name":"Open or deduplicate incident if deployment or fallback check fails","status":"completed","conclusion":"skipped"},{"name":"Independently detect missing hourly deployment health schedule","status":"completed","conclusion":"failure"},{"name":"Independently detect missing backup watchdog Scheduled","status":"completed","conclusion":"failure"},{"name":"Post Run actions/setup-node@v7","status":"completed","conclusion":"skipped"},{"name":"Post Run actions/checkout@v7","status":"completed","conclusion":"success"},{"name":"Complete job","status":"completed","conclusion":"success"}]},{"name":"inspect","status":"completed","conclusion":"success","steps":[{"name":"Set up job","status":"completed","conclusion":"success"},{"name":"Run actions/checkout@v7","status":"completed","conclusion":"success"},{"name":"Run actions/setup-node@v7","status":"completed","conclusion":"success"},{"name":"Install existing Wrangler dependency","status":"completed","conclusion":"success"},{"name":"Summarize top D1 reads (sanitized SQL, no query values or secrets)","status":"completed","conclusion":"success"},{"name":"Inspect 24h vs 1h top-fifty SQL read patterns","status":"completed","conclusion":"success"},{"name":"Protect optional Activity histories when account D1 estimate exceeds 4M in UTC day","status":"completed","conclusion":"success"},{"name":"Create or deduplicate D1 read-budget alert for warning or unknown audit","status":"completed","conclusion":"success"},{"name":"Post Run actions/setup-node@v7","status":"completed","conclusion":"success"},{"name":"Post Run actions/checkout@v7","status":"completed","conclusion":"success"},{"name":"Complete job","status":"completed","conclusion":"success"}]},{"name":"budget-tests","status":"completed","conclusion":"skipped"}];
 const recent207={...run(30,'completed','failure'),id:45450717843,run_attempt:1};
 function scenario(jobs=actual207,scheduled=recent207,{incomplete=false,unavailable=false,dedup=false}={}){
  const calls=[];
  const request=async(url,opts={})=>{
   calls.push({url,method:opts.method??'GET'});
   if(url.includes('/actions/workflows/'))return reply({workflow_runs:[scheduled]});
   if(url.includes('/attempts/1/jobs?per_page=100')){
    assert.match(url,/\/actions\/runs\/45450717843\/attempts\/1\/jobs\?per_page=100$/);
    return unavailable?{ok:false,status:503}:reply({total_count:jobs.length+(incomplete?1:0),jobs});
   }
   if(url.includes('?state=open'))return reply(dedup?[{title:D1_SCHEDULE_ALERT_TITLE,number:870}]:[]);
   if(opts.method==='POST')return reply({number:99});
   throw Error('Unexpected request');
  };
  return {calls,request};
 }
 test('actual #207: new classification retains failure but does not duplicate independent alarms',async()=>{
  assert.equal(evaluateD1Schedule([recent207],now).state,'failed');
  const s=scenario();
  assert.deepEqual(await inspectD1Schedule(env,s.request,now),{ok:false,state:'secondary-alerts-failed',runId:45450717843,ageMinutes:30});
  assert.deepEqual(s.calls.map(c=>c.method),['GET','GET']);
  const n=scenario();
  assert.deepEqual(await inspectAndNotify(env,n.request,now),{state:'secondary-alerts-failed',action:'independent-alerts-retained'});
  assert.deepEqual(n.calls.map(c=>c.method),['GET','GET']);
  assert.equal(d1ScheduleIssue({ok:false,state:'secondary-alerts-failed'}),null);
 });
 test('actual inspect failure, unknown fallback failure and duplicate job retain D1 alert',async()=>{
  const cases=[
   actual207.map(j=>j.name==='inspect'?{...j,conclusion:'failure'}:j),
   actual207.map(j=>j.name==='deployment-watch-fallback'?{...j,steps:j.steps.map(s=>s.name==='Fallback check of production Pages and Worker via GitHub metadata'?{...s,conclusion:'failure'}:s)}:j),
   [...actual207,actual207.find(j=>j.name==='inspect')],
  ];
  for(const jobs of cases){
   const s=scenario(jobs);
   assert.deepEqual(await inspectAndNotify(env,s.request,now),{state:'failed',action:'created',issue:99});
   assert.deepEqual(s.calls.map(c=>c.method),['GET','GET','GET','POST']);
  }
  const s=scenario(cases[0],recent207,{dedup:true});
  assert.deepEqual(await inspectAndNotify(env,s.request,now),{state:'failed',action:'deduplicated'});
  assert.deepEqual(s.calls.map(c=>c.method),['GET','GET','GET']);
 });
 test('incomplete or unavailable attempt metadata not treated as healthy',async()=>{
  for(const options of [{incomplete:true},{unavailable:true}]){
   const s=scenario(actual207,recent207,options);
   assert.deepEqual(await inspectAndNotify(env,s.request,now),{state:'unknown',action:'created',issue:99});
   assert.deepEqual(s.calls.map(c=>c.method),['GET','GET','GET','POST']);
  }
 });
 test('stale/missing/stalled/running/healthy never fetch attempt metadata',async()=>{
  for(const [record,state] of [
   [{...recent207,created_at:new Date(now-151*60000).toISOString()},'stale'],
   [{...recent207,event:'push'},'missing'],
   [{...recent207,event:'workflow_dispatch'},'missing'],
   [{...recent207,status:'in_progress',created_at:new Date(now-46*60000).toISOString()},'stalled'],
   [{...recent207,status:'in_progress'},'running'],
   [{...recent207,conclusion:'success'},'healthy'],
  ]){
   const s=scenario(actual207,record);
   assert.equal((await inspectD1Schedule(env,s.request,now)).state,state);
   assert.equal(s.calls.length,1);
  }
 });
