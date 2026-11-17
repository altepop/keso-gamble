import test from 'node:test';import assert from 'node:assert/strict';import {readOnlyCoachDb} from '../scripts/coach-performance-audit.mjs';
test('coaching audit refuses every write and measures actual D1 rows_read, not estimated counts',async()=>{
 const calls=[],db=readOnlyCoachDb(async(sql,params)=>{calls.push({sql,params});return {rows:[{count:2}],rowsRead:18};});
 for(const sql of ['DELETE FROM kp_wallets','UPDATE coach_member_sources SET done=1','PRAGMA table_info(x)','SELECT 1; DELETE FROM kp_wallets'])assert.throws(()=>db.prepare(sql));
 assert.deepEqual(await db.prepare('SELECT count FROM example WHERE id=?').bind('private').first(),{count:2});assert.equal(db.state.rowsRead,18);assert.equal(db.state.queries,1);assert.equal(calls.length,1);
});
