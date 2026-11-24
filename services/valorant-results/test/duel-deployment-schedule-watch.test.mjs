import test from 'node:test';
import assert from 'node:assert/strict';
import {lastMaturedDeploymentSlot,evaluateDeploymentSchedule,inspectAndNotifyDeploymentSchedule,
 DEPLOYMENT_SCHEDULE_ISSUE,deploymentScheduleIssue} from '../../../scripts/duel-deployment-schedule-watch.mjs';

const slot=Date.parse('2026-11-24T00:43:00Z'),m=60_000;
const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'test-token'};
const run=(when=slot+53*m,event='schedule',status='completed',conclusion='success')=>({
 id:123,name:'P12 duel deployment health (read-only)',created_at:new Date(when).toISOString(),
 event,status,conclusion
});
const ok=value=>({ok:true,json:async()=>value});
test('actual cron is UTC minute 43, JST minute 43 and uses 120m matured slot',()=>{
 assert.equal(lastMaturedDeploymentSlot(slot+119*m),slot-60*m);
 assert.equal(lastMaturedDeploymentSlot(slot+120*m),slot);
 assert.equal(lastMaturedDeploymentSlot(slot+179*m),slot);
 assert.equal(lastMaturedDeploymentSlot(slot+180*m),slot+60*m);
});
test('late scheduled start is counted only in its matured 120-minute window',()=>{
 const now=slot+121*m;
 assert.equal(evaluateDeploymentSchedule([run()],now).state,'healthy');
 assert.equal(evaluateDeploymentSchedule([run(slot+113*m)],now).state,'healthy');
 assert.equal(evaluateDeploymentSchedule([run(slot+121*m)],now).state,'missing');
 assert.equal(evaluateDeploymentSchedule([run(slot-61*m)],now).state,'missing');
 assert.equal(evaluateDeploymentSchedule([run(slot+53*m,'push')],now).state,'missing');
 assert.equal(evaluateDeploymentSchedule([run(slot+53*m,'workflow_dispatch')],now).state,'missing');
});
test('failed and still-running states are separate; newest scheduled run wins',()=>{
 const now=slot+121*m;
 assert.equal(evaluateDeploymentSchedule([run(slot+15*m,'schedule','in_progress',null)],now).state,'stalled');
 assert.equal(evaluateDeploymentSchedule([run(slot+15*m,'schedule','completed','failure')],now).state,'failed');
 assert.equal(evaluateDeploymentSchedule([run(slot+15*m),{...run(slot+50*m,'schedule','completed','failure'),id:124}],now).state,'failed');
});
test('healthy schedule and no eligible slot make no Issue API requests',async()=>{
 const seen=[];
 const request=async url=>{seen.push(url);return ok({workflow_runs:[run()]});};
 assert.deepEqual(await inspectAndNotifyDeploymentSchedule(env,request,slot+121*m),{state:'healthy',action:'healthy'});
 assert.equal(seen.length,1);
 assert.match(seen[0],/duel-deployment-watch\.yml\/runs\?event=schedule&per_page=40/);
 assert.equal(evaluateDeploymentSchedule([],60_000).state,'grace');
});
test('missing scheduled run creates deduplicated Issue, never auto-closes',async()=>{
 const events=[];
 const request=async(url,opt={})=>{
  events.push({url,opt});
  if(url.includes('/workflows/'))return ok({workflow_runs:[run(slot+53*m,'push')]});
  if(url.includes('?state=open'))return ok([]);
  if(opt.method==='POST')return ok({number:901});
  throw Error('Unexpected URL');
 };
 assert.deepEqual(await inspectAndNotifyDeploymentSchedule(env,request,slot+121*m),
  {state:'missing',action:'created',issue:901});
 assert.equal(events.length,3);
 const issue=JSON.parse(events[2].opt.body);
 assert.equal(issue.title,DEPLOYMENT_SCHEDULE_ISSUE);
 assert.doesNotMatch(JSON.stringify(issue),/test-token/);
 assert.match(issue.body,/120分/);
 const once=await inspectAndNotifyDeploymentSchedule(env,async url=>{
  if(url.includes('/workflows/'))return ok({workflow_runs:[]});
  return ok([{number:901,title:DEPLOYMENT_SCHEDULE_ISSUE}]);
 },slot+121*m);
 assert.equal(once.action,'deduplicated');
});
test('GitHub API failure is unknown, not fabricated missing',async()=>{
 const result=await inspectAndNotifyDeploymentSchedule(env,async url=>{
  if(url.includes('/workflows/'))return {ok:false,status:403};
  if(url.includes('?state=open'))return ok([]);
  return ok({number:902});
 },slot+121*m);
 assert.equal(result.state,'unknown');
 assert.match(deploymentScheduleIssue({state:'unknown',ok:false,slot,runId:null}).body,/断定せず/);
 assert.equal(deploymentScheduleIssue({state:'healthy',ok:true,slot,runId:123}),null);
 await assert.rejects(()=>inspectAndNotifyDeploymentSchedule({...env,GITHUB_TOKEN:''}),/permission/);
});
