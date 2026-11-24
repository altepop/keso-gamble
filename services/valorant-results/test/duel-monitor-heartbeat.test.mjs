import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateMonitorHeartbeat,inspectMonitorHeartbeat,MONITOR_WORKFLOW} from '../../../scripts/duel-monitor-heartbeat.mjs';
const now=Date.parse('2026-11-23T09:00:00Z');
const make=(minutes=30,status='completed',conclusion='success')=>({
 id:42,name:MONITOR_WORKFLOW,event:'schedule',status,conclusion,
 created_at:new Date(now-minutes*60000).toISOString()
});
test('recent successful scheduled monitor run is healthy',()=>{
 assert.deepEqual(evaluateMonitorHeartbeat([make()],now),{state:'healthy',ok:true,runId:42,ageMinutes:30});
});
test('no schedule, stale schedule and most recent failure fail closed',()=>{
 assert.equal(evaluateMonitorHeartbeat([],now).state,'missing');
 assert.equal(evaluateMonitorHeartbeat([make(241)],now).state,'stale');
 assert.equal(evaluateMonitorHeartbeat([make(30,'completed','failure'),{...make(20,'completed','success'),id:1,event:'pull_request'}],now).state,'failed');
});
test('running job has bounded grace, stalled job does not pass',()=>{
 assert.equal(evaluateMonitorHeartbeat([make(25,'in_progress',null)],now).state,'running');
 assert.equal(evaluateMonitorHeartbeat([make(46,'in_progress',null)],now).state,'stalled');
});
test('future timestamps, malformed IDs, other workflow and events do not create false successes',()=>{
 assert.equal(evaluateMonitorHeartbeat([{...make(),id:0}],now).ok,false);
 assert.equal(evaluateMonitorHeartbeat([{...make(),created_at:new Date(now+60_000).toISOString()}],now).ok,false);
 assert.equal(evaluateMonitorHeartbeat([{...make(),name:'unrelated'}],now).ok,false);
 assert.equal(evaluateMonitorHeartbeat([{...make(),event:'push'}],now).ok,false);
 assert.throws(()=>evaluateMonitorHeartbeat(null,now));
});
test('GitHub metadata-only GET, no D1 or KP calls',async()=>{
 let seen;
 const out=await inspectMonitorHeartbeat({GITHUB_TOKEN:'fixture-token',GITHUB_REPOSITORY:'altepop/keso-gamble'},
  async(url,options)=>{seen={url,options};return {ok:true,json:async()=>({workflow_runs:[make()]})};},now);
 assert.equal(out.ok,true);
 assert.match(seen.url,/\/actions\/workflows\/duel-deployment-watch\.yml\/runs\?event=schedule&per_page=10$/);
 assert.equal(seen.options.method,undefined);
 assert.ok(!seen.url.includes('cloudflare'));
 await assert.rejects(inspectMonitorHeartbeat({GITHUB_REPOSITORY:'altepop/keso-gamble'}),/read access/);
});

test('heartbeat Scheduled can notify backup watchdog gaps even when previous checks fail',async()=>{
 const {readFileSync}=await import('node:fs');
 const read=name=>readFileSync(new URL('../../../.github/workflows/'+name,import.meta.url),'utf8');
 const yaml=read('duel-monitor-heartbeat.yml');
 const index=yaml.indexOf('name: Independently detect missing backup watchdog Scheduled');
 assert.ok(index>yaml.indexOf('name: Open at most one GitHub Issue for confirmed heartbeat outage'));
 assert.ok(index>yaml.indexOf('name: Independently detect missing :43 deployment health schedule'));
 const step=yaml.slice(index);
 assert.match(step,/if: always\(\) && github\.event_name == 'schedule'/);
 assert.match(step,/run: node scripts\/duel-backup-watchdog-self-schedule\.mjs/);
 assert.doesNotMatch(step,/workflow_dispatch|CLOUDFLARE_API_TOKEN|wrangler|KP_TOKEN/);
 assert.match(yaml,/run: node --test [^\n]*duel-backup-watchdog-self-schedule\.test\.mjs/);
 assert.match(read('duel-deployment-watch.yml'),/run: node scripts\/duel-backup-watchdog-self-schedule\.mjs/);
 assert.match(read('d1-insights-report.yml'),/run: node scripts\/duel-backup-watchdog-self-schedule\.mjs/);
});

test('actual #41 completed deployment check with independent failures is not a generic heartbeat outage',async()=>{
 const stamp=Date.parse('2026-11-24T13:00:00Z');
 const row={...make(0,'completed','failure'),id:45398418054,created_at:'2026-11-24T12:56:43Z',run_attempt:1};
 const steps=['Validate no-write monitor decisions','Check recent production deployment statuses without D1 calls','Create at most one open GitHub Issue for a real deployment anomaly','Independently notify on missing D1 Insights Scheduled executions','Independently detect missing backup watchdog Scheduled','Independently notify on missing scheduled operations audit','Independently notify on missing administrator evidence schedule'].map((name,i)=>({name,status:'completed',conclusion:[3,4,6].includes(i)?'failure':i===2?'skipped':'success'}));
 const env={GITHUB_TOKEN:'fixture',GITHUB_REPOSITORY:'altepop/keso-gamble'};
 const inspect=async(items=steps,count=1)=>inspectMonitorHeartbeat(env,async url=>{
  if(url.includes('/workflows/'))return {ok:true,json:async()=>({workflow_runs:[row]})};
  assert.match(url,/runs\/45398418054\/attempts\/1\/jobs\?per_page=100$/);
  return {ok:true,json:async()=>({total_count:count,jobs:[{name:'monitor',status:'completed',conclusion:'failure',steps:items}]})};
 },stamp);
 const result=await inspect();
 assert.equal(result.state,'secondary-alerts-failed');
 assert.equal(result.ok,false);
 const {buildHeartbeatAlert}=await import('../../../scripts/duel-monitor-heartbeat-alert.mjs');
 assert.equal(buildHeartbeatAlert(result),null);
 assert.equal((await inspect(steps.map((s,i)=>i===1?{...s,conclusion:'failure'}:s))).state,'failed');
 assert.equal((await inspect([...steps,{name:'unrecognized failure',status:'completed',conclusion:'failure'}])).state,'failed');
 await assert.rejects(inspect(steps,2),/Incomplete/);
});
