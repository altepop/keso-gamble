import test from 'node:test';
import assert from 'node:assert/strict';
import {rankReadHotspots} from './d1-read-hotspots.mjs';
test('rank top SQL shapes using existing Insights rows without raw SQL, literals or identifiers',()=>{
 const rows=[
  {query:"SELECT * FROM coach_member_queue WHERE guild='private-token' AND user_id=123",totalRowsRead:90,numberOfTimesRun:3},
  {query:'WITH x AS (SELECT * FROM notifications WHERE token=\'secret\') SELECT * FROM kp_events',totalRowsRead:210,numberOfTimesRun:7},
  {query:'SELECT * FROM kp_wallets',totalRowsRead:30,numberOfTimesRun:2}
 ];
 const ranked=rankReadHotspots(rows,2);
 assert.deepEqual(ranked.map(x=>x.read),[210,90]);
 assert.deepEqual(ranked.map(x=>x.sharePercent),[63.6,27.3]);
 assert.equal(ranked[0].operation,'WITH');
 assert.match(ranked[0].tables,/notifications/);
 assert.equal(ranked[1].avg,30);
 const rendered=JSON.stringify(ranked);
 assert.doesNotMatch(rendered,/private-token|secret|123|WHERE|user_id/);
});
test('empty or malformed metrics cannot produce invented usage or more than 20 items',()=>{
 assert.deepEqual(rankReadHotspots([]),[]);
 assert.deepEqual(rankReadHotspots([{query:'SELECT 1',totalRowsRead:'bad',numberOfTimesRun:null}]),[
  {operation:'SELECT',tables:'-',calls:0,read:0,avg:0,sharePercent:0}
 ]);
 assert.throws(()=>rankReadHotspots(null));
 assert.throws(()=>rankReadHotspots([],21));
});

test('D1 read-only audit is triggered for future duel-history main pushes without changing its scheduled fallback',async()=>{
 const {readFileSync}=await import('node:fs');
 const workflow=readFileSync(new URL('../.github/workflows/d1-insights-report.yml',import.meta.url),'utf8');
 const push=workflow.split('  push:')[1]?.split('  workflow_dispatch:')[0];
 const pull=workflow.split('  pull_request:')[1]?.split('  push:')[0];
 const inspect=workflow.split('  inspect:')[1];
 assert.ok(push,'push trigger must exist');
 assert.match(push,/branches: \[main\]/);
 assert.match(push,/services\/valorant-results\/src\/duel-history\.ts/);
 assert.doesNotMatch(pull??'',/services\/valorant-results\/src\/duel-history\.ts/,
  'normal PR CI, not D1 inspection, validates new code');
 assert.match(workflow,/cron: '17 \* \* \* \*'/);
 assert.match(inspect??'',/github\.event_name == 'push'/);
 assert.match(inspect??'',/github\.event_name == 'schedule'/);
 assert.match(workflow,/node scripts\/d1-read-audit\.mjs/);
 assert.match(workflow,/node scripts\/d1-daily-guard\.mjs/);
 assert.match(workflow,/node scripts\/d1-read-budget-alert\.mjs/);
 assert.doesNotMatch(push,/services\/valorant-results\/src\/coach/,
  'do not broaden the production D1 audit to unrelated coach changes');
});
