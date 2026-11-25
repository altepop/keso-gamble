import test from 'node:test';
import assert from 'node:assert/strict';
import {lastExpectedAdminEvidenceSlot,evaluateAdminEvidenceCron,inspectAndNotifyAdminEvidenceCron,
 ADMIN_EVIDENCE_CRON_ISSUE,adminEvidenceCronIssue} from '../../../scripts/duel-admin-evidence-cron-watch.mjs';
const slot=Date.parse('2026-11-23T22:11:00Z');
const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture-key'};
const run=(created=slot+60_000,event='schedule',status='completed',conclusion='success')=>({
 id:42,name:'P12 duel administrator deployment evidence',event,status,conclusion,
 created_at:new Date(created).toISOString()
});
const ok=v=>({ok:true,json:async()=>v});
test('07:11 JST corresponds to 22:11 UTC previous day, 120m grace',()=>{
 assert.equal(lastExpectedAdminEvidenceSlot(Date.parse('2026-11-24T07:11:00+09:00')),slot);
 assert.equal(evaluateAdminEvidenceCron([],slot+119*60_000).state,'grace');
 assert.equal(evaluateAdminEvidenceCron([],slot+120*60_000).state,'missing');
 assert.equal(lastExpectedAdminEvidenceSlot(Date.parse('2026-11-24T07:10:00+09:00')),slot-86_400_000);
});
test('only latest real scheduled run counts; dispatch/push cannot mask missing',()=>{
 const now=slot+130*60_000;
 assert.equal(evaluateAdminEvidenceCron([run()],now).state,'healthy');
 assert.equal(evaluateAdminEvidenceCron([run(slot+60_000,'push')],now).state,'missing');
 assert.equal(evaluateAdminEvidenceCron([run(slot+60_000,'workflow_dispatch')],now).state,'missing');
 assert.equal(evaluateAdminEvidenceCron([run(slot-86_400_000)],now).state,'missing');
 assert.equal(evaluateAdminEvidenceCron([run(slot+60_000,'schedule','completed','failure')],now).state,'failed');
 assert.equal(evaluateAdminEvidenceCron([run(slot+60_000,'schedule','in_progress',null)],now).state,'stalled');
 assert.equal(evaluateAdminEvidenceCron([run(slot+60_000,'schedule','completed','success'),run(slot+120_000,'schedule','completed','failure')],now).state,'failed');
});
test('normal and grace states make no issue API calls, only schedule endpoint',async()=>{
 const urls=[];
 const req=async url=>{urls.push(url);if(!url.includes('?event=schedule'))throw Error('unexpected API');return ok({workflow_runs:[run()]});};
 assert.equal((await inspectAndNotifyAdminEvidenceCron(env,req,slot+130*60_000)).action,'healthy');
 assert.equal((await inspectAndNotifyAdminEvidenceCron(env,req,slot+60*60_000)).action,'healthy');
 assert.equal(urls.length,2);
 assert.ok(urls.every(x=>/duel-admin-evidence\.yml\/runs\?event=schedule&per_page=15/.test(x)));
});
test('missing schedule opens one issue and deduplicates it, without secrets',async()=>{
 const seen=[];
 const request=async(url,opts={})=>{
  seen.push({url,opts});
  if(url.includes('/workflows/'))return ok({workflow_runs:[run(slot+60_000,'push')]});
  if(url.includes('?state=open'))return ok([]);
  if(opts.method==='POST')return ok({number:121});
  throw Error('unexpected');
 };
 const result=await inspectAndNotifyAdminEvidenceCron(env,request,slot+130*60_000);
 assert.deepEqual(result,{state:'missing',action:'created',issue:121});
 assert.equal(seen.length,3);
 const issue=JSON.parse(seen[2].opts.body);
 assert.equal(issue.title,ADMIN_EVIDENCE_CRON_ISSUE);
 assert.doesNotMatch(JSON.stringify(issue),/fixture-key|Bearer [a-zA-Z0-9_-]+/);
 const dedup=await inspectAndNotifyAdminEvidenceCron(env,async url=>{
  if(url.includes('/workflows/'))return ok({workflow_runs:[]});
  return ok([{number:121,title:ADMIN_EVIDENCE_CRON_ISSUE}]);
 },slot+130*60_000);
 assert.equal(dedup.action,'deduplicated');
});
test('API unavailable is unknown, never falsely declares cron failure',async()=>{
 const x=await inspectAndNotifyAdminEvidenceCron(env,async url=>{
  if(url.includes('/workflows/'))return {ok:false,status:403};
  if(url.includes('?state=open'))return ok([]);
  return ok({number:31});
 },slot+130*60_000);
 assert.equal(x.state,'unknown');
 assert.match(adminEvidenceCronIssue({state:'unknown',ok:false,slot,runId:null}).body,/断定せず/);
 assert.equal(adminEvidenceCronIssue({state:'grace',ok:true,slot}),null);
 await assert.rejects(inspectAndNotifyAdminEvidenceCron({...env,GITHUB_TOKEN:''}),/permission/);
});
