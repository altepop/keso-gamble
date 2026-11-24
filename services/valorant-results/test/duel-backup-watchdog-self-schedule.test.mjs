import test from 'node:test';
import assert from 'node:assert/strict';
import {
 FIRST_SLOT,GRACE_MS,SELF_WATCH_ISSUE,latestMaturedSelfWatchSlot,
 evaluateSelfWatchSchedule,selfWatchIssue,inspectAndNotifySelfWatchSchedule
} from '../../../scripts/duel-backup-watchdog-self-schedule.mjs';
const ready=FIRST_SLOT+GRACE_MS;
const fixture=(time,opts={})=>({
 id:33,name:'P12 duel retained backup schedule watchdog',event:'schedule',
 created_at:new Date(time).toISOString(),status:'completed',conclusion:'success',...opts
});
const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture'};
const reply=body=>({ok:true,json:async()=>body});
test('first 12:47 JST slot is grace through 120 minutes and only then missing',()=>{
 assert.equal(latestMaturedSelfWatchSlot(ready-1),null);
 assert.equal(evaluateSelfWatchSchedule([],ready-1).state,'grace');
 assert.equal(evaluateSelfWatchSchedule([],ready).state,'missing');
 assert.equal(latestMaturedSelfWatchSlot(ready+24*60*60_000),FIRST_SLOT+24*60*60_000);
 assert.equal(evaluateSelfWatchSchedule([fixture(FIRST_SLOT)],ready).state,'healthy');
});
test('late scheduled starts are accepted; push/PR/dispatch never satisfy a slot',()=>{
 for(const delay of [0,59,120]){
  const r=evaluateSelfWatchSchedule([fixture(FIRST_SLOT+delay*60_000)],ready);
  assert.equal(r.state,'healthy');
 }
 for(const event of ['push','pull_request','workflow_dispatch'])
  assert.equal(evaluateSelfWatchSchedule([fixture(FIRST_SLOT,{event})],ready).state,'missing');
 assert.equal(evaluateSelfWatchSchedule([fixture(FIRST_SLOT-6*60_000)],ready).state,'missing');
 assert.equal(evaluateSelfWatchSchedule([fixture(FIRST_SLOT,{id:0})],ready).state,'missing');
});
test('distinguishes missing/stalled/failed/unknown from healthy without claiming backup validity',()=>{
 assert.equal(evaluateSelfWatchSchedule([fixture(FIRST_SLOT,{status:'in_progress'})],ready).state,'stalled');
 assert.equal(evaluateSelfWatchSchedule([fixture(FIRST_SLOT,{conclusion:'failure'})],ready).state,'failed');
 assert.equal(evaluateSelfWatchSchedule([fixture(FIRST_SLOT,{conclusion:'cancelled'})],ready).state,'failed');
 assert.equal(selfWatchIssue({ok:false,state:'unknown',slot:FIRST_SLOT}).title,SELF_WATCH_ISSUE);
 assert.match(selfWatchIssue({ok:false,state:'unknown',slot:FIRST_SLOT}).body,/断定しない/);
 assert.match(selfWatchIssue({ok:false,state:'missing',slot:FIRST_SLOT}).body,/復元成功を意味しない/);
 assert.equal(selfWatchIssue({ok:true,state:'grace',slot:null}),null);
});
test('GitHub event=schedule only, no D1/KP and deduplicate existing issue',async()=>{
 const calls=[];
 const request=async(url,opts={})=>{
  calls.push({url,opts});
  if(url.includes('/actions/workflows/'))return reply({workflow_runs:[]});
  if(url.includes('/issues?'))return reply([]);
  if(opts.method==='POST')return reply({number:77});
  throw Error('unexpected network request');
 };
 assert.deepEqual(await inspectAndNotifySelfWatchSchedule(env,request,ready),
  {state:'missing',action:'created',issue:77});
 assert.match(calls[0].url,/duel-retained-backup-watchdog\.yml\/runs\?event=schedule&per_page=10$/);
 assert.deepEqual(calls.map(x=>x.opts.method??'GET'),['GET','GET','POST']);
 assert.ok(calls.every(x=>!/cloudflare|\/d1\/|kp\/|wrangler/.test(x.url)));
 assert.equal(JSON.parse(calls[2].opts.body).title,SELF_WATCH_ISSUE);
 const dedup=await inspectAndNotifySelfWatchSchedule(env,async(url)=>{
  if(url.includes('/actions/workflows/'))return reply({workflow_runs:[]});
  return reply([{title:SELF_WATCH_ISSUE,number:77}]);
 },ready);
 assert.equal(dedup.action,'deduplicated');
});
test('unknown metadata and saturated Issue lists are fail-closed',async()=>{
 const x=await inspectAndNotifySelfWatchSchedule(env,async(url,opts={})=>{
  if(url.includes('/actions/workflows/'))return {ok:false,status:403};
  if(url.includes('/issues?'))return reply([]);
  if(opts.method==='POST')return reply({number:7});
  throw Error('unknown');
 },ready);
 assert.equal(x.state,'unknown');
 await assert.rejects(inspectAndNotifySelfWatchSchedule(env,async url=>{
  if(url.includes('/actions/workflows/'))return reply({workflow_runs:[]});
  return reply(Array.from({length:100},(_,i)=>({number:i+1,title:'other'})));
 },ready),/saturated/);
 await assert.rejects(inspectAndNotifySelfWatchSchedule({...env,GITHUB_TOKEN:''}),/Authorized/);
});
test('no network or issue before first matured daily slot',async()=>{
 let count=0;
 const res=await inspectAndNotifySelfWatchSchedule(env,async url=>{
  count++;
  if(url.includes('/actions/workflows/'))return reply({workflow_runs:[]});
  throw Error('unexpected Issue access');
 },ready-1);
 assert.deepEqual(res,{state:'grace',action:'healthy'});
 assert.equal(count,1);
});
test('workflow schedule wiring executes only on schedule after deployment alert',async()=>{
 const {readFileSync}=await import('node:fs');
 const y=readFileSync(new URL('../../../.github/workflows/duel-deployment-watch.yml',import.meta.url),'utf8');
 const d=y.indexOf('name: Create at most one open GitHub Issue for a real deployment anomaly');
 const s=y.indexOf('name: Independently detect missing backup watchdog Scheduled');
 assert.ok(d>0&&s>d);
 const tail=y.slice(s);
 assert.match(tail,/if: always\(\) && github\.event_name == 'schedule'/);
 assert.match(tail,/run: node scripts\/duel-backup-watchdog-self-schedule\.mjs/);
 assert.doesNotMatch(tail,/workflow_dispatch|CLOUDFLARE_API_TOKEN|wrangler d1|KP_TOKEN/);
 assert.match(y,/duel-backup-watchdog-self-schedule\.test\.mjs/);
});
