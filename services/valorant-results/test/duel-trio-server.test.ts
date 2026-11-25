import test from 'node:test';
import assert from 'node:assert/strict';
import {startTrustedTrio,advanceTrustedTrio,advanceTrustedTrioPve} from '../src/duel-trio-server.ts';

test('server owns PvP board, turn, winner and sequence',()=>{
 let s=startTrustedTrio();
 for(const [cell,mark] of [[0,'X'],[3,'O'],[1,'X'],[4,'O'],[2,'X']] as const){
  s=advanceTrustedTrio(s,cell);
  assert.equal(s.board[cell],mark);
 }
 assert.equal(s.winner,'X');
 assert.equal(s.turn,null);
 assert.equal(s.version,5);
 assert.throws(()=>advanceTrustedTrio(s,5));
});
test('illegal cells, client tampering, stale server state and wrong turn are rejected',()=>{
 const start=startTrustedTrio();
 for(const cell of [-1,9,1.5,NaN,'0',null,{}])
  assert.throws(()=>advanceTrustedTrio(start,cell));
 const after=advanceTrustedTrio(start,0);
 assert.throws(()=>advanceTrustedTrio(after,0));
 assert.throws(()=>advanceTrustedTrio({...after,turn:'X'},1));
 assert.throws(()=>advanceTrustedTrio({...after,winner:'X'},1));
 assert.throws(()=>advanceTrustedTrio({...after,version:-1},1));
});
test('CPU response uses server-owned board and cannot be played twice',()=>{
 let s=startTrustedTrio();
 s=advanceTrustedTrioPve(s,0,'strong',()=>0.25);
 assert.equal(s.board[0],'X');
 assert.equal(s.board.includes('O'),true);
 assert.equal(s.version,2);
 assert.equal(s.turn,'X');
 assert.throws(()=>advanceTrustedTrioPve(s,0,'strong',()=>0.25));
 assert.throws(()=>advanceTrustedTrioPve(s,1,'unknown' as 'strong',()=>0.25));
});
test('natural server-controlled PvE terminal result never includes KP fields',()=>{
 let s=startTrustedTrio();
 for(let i=0;i<5&&s.winner===null;i++){
  const cell=[...s.board].findIndex(x=>x==='.');
  s=advanceTrustedTrioPve(s,cell,'easy',()=>0);
 }
 assert.ok(s.winner!==null);
 assert.equal(Object.hasOwn(s,'kp'),false);
 assert.equal(Object.hasOwn(s,'reward'),false);
 assert.equal(Object.hasOwn(s,'receipt'),false);
});
