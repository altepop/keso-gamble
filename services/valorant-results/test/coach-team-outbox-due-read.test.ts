import test from 'node:test';
import assert from 'node:assert/strict';
import {readDueCoachOutboxCandidates} from '../src/coach-team-outbox-due-read.ts';
const guild='123456789012345678';
const row=()=>({event_key:'coach-roster-v1:task:1',event_type:'task',revision:1,
 state:'pending',attempts:0,next_attempt_at:999_999,claimed_until:0});
const db=(rows:unknown[])=>({prepare(sql:string){
 assert.match(sql,/LIMIT 6/);assert.match(sql,/attempts<5/);
 return {bind(...args:unknown[]){assert.deepEqual(args,[guild,1000000,1000000]);
  return {async all(){return {results:rows};}}}};
}} as unknown as D1Database);
test('E2 dormant due reader filters valid, bounded and deduplicated outbox candidates',async()=>{
 assert.deepEqual(await readDueCoachOutboxCandidates(db([row()]),guild,1000000),
  [{eventKey:'coach-roster-v1:task:1',event:'task',attempts:0}]);
 assert.deepEqual(await readDueCoachOutboxCandidates(db([]),guild,1000000),[]);
 for(const bad of [
  [row(),row()],
  [{...row(),event_key:'coach-roster-v1:status:1'}],
  [{...row(),attempts:5}],
  [{...row(),state:'delivered'}],
  [{...row(),next_attempt_at:1000001}],
  Array.from({length:6},(_,i)=>({...row(),event_key:'coach-roster-v1:task:'+(i+1),revision:i+1}))
 ])assert.equal(await readDueCoachOutboxCandidates(db(bad),guild,1000000),null);
 assert.equal(await readDueCoachOutboxCandidates(db([]),'bad',1000000),null);
});
