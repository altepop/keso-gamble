import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {evaluateBackupSchedule,inspectBackupSchedule,WATCHED_WORKFLOW}
 from '../../../scripts/duel-retained-backup-watchdog.mjs';
import {buildBackupWatchdogAlert,notifyBackupWatchdog,WATCHDOG_ALERT_TITLE}
 from '../../../scripts/duel-retained-backup-watchdog-alert.mjs';
const now=Date.parse('2026-11-25T03:30:00Z');
const run=(age=180,status='completed',conclusion='success')=>({
 id:91,name:WATCHED_WORKFLOW,event:'schedule',created_at:new Date(now-age*60000).toISOString(),
 status,conclusion
});
test('recent schedule success and assessment failure both prove workflow liveness',()=>{
 assert.deepEqual(evaluateBackupSchedule([run()],now),{state:'healthy',ok:true,runId:91,ageMinutes:180});
 assert.equal(evaluateBackupSchedule([run(180,'completed','failure')],now).state,'assessment-failed');
 assert.equal(evaluateBackupSchedule([run(180,'completed','failure')],now).ok,true);
});
test('missing, stale, interrupted, stalled, running are distinct',()=>{
 assert.equal(evaluateBackupSchedule([],now).state,'missing');
 assert.equal(evaluateBackupSchedule([run(1681)],now).state,'stale');
 assert.equal(evaluateBackupSchedule([run(100,'in_progress',null)],now).state,'stalled');
 assert.equal(evaluateBackupSchedule([run(70,'in_progress',null)],now).state,'running');
 assert.equal(evaluateBackupSchedule([run(20,'completed','cancelled')],now).state,'interrupted');
 assert.equal(evaluateBackupSchedule([run(20,'queued',null)],now).ok,true);
});
test('PR/push, future dates, bogus IDs or other workflow do not satisfy schedule',()=>{
 assert.equal(evaluateBackupSchedule([{...run(),event:'push'}],now).state,'missing');
 assert.equal(evaluateBackupSchedule([{...run(),event:'pull_request'}],now).state,'missing');
 assert.equal(evaluateBackupSchedule([{...run(),id:0}],now).state,'missing');
 assert.equal(evaluateBackupSchedule([{...run(),name:'other'}],now).state,'missing');
 assert.equal(evaluateBackupSchedule([{...run(),created_at:new Date(now+1000).toISOString()}],now).state,'missing');
 assert.equal(evaluateBackupSchedule([run(180),{...run(12,'completed','failure'),id:100}],now).state,'assessment-failed');
 assert.throws(()=>evaluateBackupSchedule(null,now));
});
test('metadata fetch is GET-only, scoped to schedule and known workflow',async()=>{
 let requestUrl,method;
 const out=await inspectBackupSchedule({GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture'},
  async(url,opts)=>{requestUrl=url;method=opts.method;return {ok:true,json:async()=>({workflow_runs:[run()]})};},now);
 assert.equal(out.ok,true);assert.equal(method,undefined);
 assert.match(requestUrl,/duel-retained-backup-health\.yml\/runs\?event=schedule&per_page=10$/);
 assert.ok(!requestUrl.includes('cloudflare'));
 await assert.rejects(inspectBackupSchedule({GITHUB_REPOSITORY:'wrong'}),/Authorized/);
});
test('watchdog alert only for liveness failures; no backup-content claims',()=>{
 for(const state of ['missing','stale','stalled','interrupted','unknown']){
  const alert=buildBackupWatchdogAlert({state,ok:false,runId:91,ageMinutes:100});
  assert.equal(alert.title,WATCHDOG_ALERT_TITLE);
  assert.match(alert.body,/欠落や破損は確定しない/);
 }
 assert.equal(buildBackupWatchdogAlert({state:'healthy',ok:true}),null);
 assert.equal(buildBackupWatchdogAlert({state:'assessment-failed',ok:true}),null);
 assert.equal(buildBackupWatchdogAlert({state:'missing',ok:true}),null);
});
async function fixture(report,fn){
 const dir=mkdtempSync(join(tmpdir(),'duel-backup-watchdog-'));
 const path=join(dir,'state.json');writeFileSync(path,JSON.stringify(report));
 try{return await fn({GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'test',DUEL_BACKUP_WATCHDOG_REPORT:path});}
 finally{rmSync(dir,{recursive:true,force:true});}
}
test('healthy performs no network activity',async()=>{
 await fixture({state:'healthy',ok:true},async env=>{
  assert.equal(await notifyBackupWatchdog(env,()=>{throw Error('network');}),'healthy');
 });
});
test('create exactly one issue, deduplicate open issue and fail closed on saturation',async()=>{
 await fixture({state:'missing',ok:false},async env=>{
  const calls=[];
  const req=async(url,opts)=>{calls.push(opts.method??'GET');return {ok:true,json:async()=>opts.method==='POST'?{number:22}:[]};};
  assert.equal(await notifyBackupWatchdog(env,req),'created');
  assert.deepEqual(calls,['GET','POST']);
  calls.length=0;
  assert.equal(await notifyBackupWatchdog(env,async()=>({ok:true,json:async()=>[{title:WATCHDOG_ALERT_TITLE}]})),'deduplicated');
  await assert.rejects(notifyBackupWatchdog(env,async()=>({ok:true,json:async()=>Array.from({length:100},(_,i)=>({number:i+1,title:'other'}))})),/pagination/);
  await assert.rejects(notifyBackupWatchdog(env,async()=>({ok:false,status:403})),/403/);
 });
});
