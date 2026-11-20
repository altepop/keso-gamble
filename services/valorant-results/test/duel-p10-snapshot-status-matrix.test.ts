import assert from 'node:assert/strict';
import test from 'node:test';
import {spectatorPublicSnapshot,type SpectatorSource,type SpectatorStatus} from '../src/duel-spectator-public.ts';
const base:SpectatorSource={id:'match-1',guild:'guild-1',game:'othello',status:'pending',user_a:'a',user_b:'b',turn_user:null,winner:null,version:1,updated_at:100,board:'........'};
test('P10 readiness: all four supported statuses preserve only safe projection fields',()=>{
 for(const status of ['pending','active','finished','cancelled'] as SpectatorStatus[]){
  const result=spectatorPublicSnapshot({...base,status});
  assert.equal(result.status,status);
  assert.deepEqual(result.participants,['a','b']);
  assert.deepEqual(result.publicState,{board:'........'});
  assert.equal(Object.hasOwn(result,'guild'),false);
 }
});
test('P10 readiness: unsupported statuses are denied rather than reflected',()=>{
 for(const status of ['', 'paused','unknown','FINISHED',null,42]){
  assert.throws(()=>spectatorPublicSnapshot({...base,status:status as SpectatorStatus}),/spectator snapshot unavailable/);
 }
});
test('P10 readiness: board-only games preserve exact public board without private source metadata',()=>{
 for(const game of ['othello','gomoku','connect4'] as const){
  const result=spectatorPublicSnapshot({...base,game,board:'test-board'});
  assert.deepEqual(result.publicState,{board:'test-board'});
  assert.equal(Object.hasOwn(result,'user_a'),false);
  assert.equal(Object.hasOwn(result,'user_b'),false);
 }
});
