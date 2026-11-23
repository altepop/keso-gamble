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
