import test from 'node:test';import assert from 'node:assert/strict';import {readOnlyCoachDb,coachProductionSmoke} from '../scripts/coach-performance-audit.mjs';
test('coaching audit refuses every write and measures actual D1 rows_read, not estimated counts',async()=>{
 const calls=[],db=readOnlyCoachDb(async(sql,params)=>{calls.push({sql,params});return {rows:[{count:2}],rowsRead:18};});
 for(const sql of ['DELETE FROM kp_wallets','UPDATE coach_member_sources SET done=1','PRAGMA table_info(x)','SELECT 1; DELETE FROM kp_wallets'])assert.throws(()=>db.prepare(sql));
 assert.deepEqual(await db.prepare('SELECT count FROM example WHERE id=?').bind('private').first(),{count:2});assert.equal(db.state.rowsRead,18);assert.equal(db.state.queries,1);assert.equal(calls.length,1);
});

test('production coach smoke verifies actual published page and authenticated Worker contract using GET only',async()=>{
 const seen=[];const request=async(url,init)=>{seen.push({url,init});return url.includes('coach.html')?new Response('<button id="compare-members">'):Response.json({person:'神戸',accounts:['fixture-one','fixture-two'],performance:{quality:{metricCoverage:{}},windows:[5,10,20,50]},roundContribution:{quality:{}}});};
 assert.deepEqual(await coachProductionSmoke('a'.repeat(48),request),{page:'verified',authenticatedApi:'verified',metricQuality:'verified',mutations:0});
 assert.equal(seen.length,2);assert.ok(seen.every(x=>!x.init.method));assert.equal(seen[1].init.headers.Authorization,'Bearer '+'a'.repeat(48));
 await assert.rejects(()=>coachProductionSmoke('',request));
 await assert.rejects(()=>coachProductionSmoke('a'.repeat(48),async()=>new Response('stale')));
});
