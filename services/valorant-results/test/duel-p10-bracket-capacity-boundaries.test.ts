import assert from 'node:assert/strict';
import test from 'node:test';
import {draftSingleEliminationBracket,mayPublishTournament} from '../src/duel-tournament-draft.ts';

test('P10 readiness: exact-capacity drafts and just-over-capacity entrants are distinguished',()=>{
 for(const capacity of [2,3,4,7,8,16,32,64,128]){
  const players=Array.from({length:capacity},(_,i)=>'p_'+i);
  const draft=draftSingleEliminationBracket(players,capacity);
  assert.equal(draft.participants.length,capacity);
  assert.equal(draft.pairs.length,2**Math.ceil(Math.log2(capacity))/2);
  assert.equal(draft.byes,2**Math.ceil(Math.log2(capacity))-capacity);
  if(capacity<128)assert.throws(()=>draftSingleEliminationBracket([...players,'extra'],capacity),/invalid participant count/);
 }
});
test('P10 readiness: rejects duplicate entrant and malformed ID edge cases',()=>{
 for(const players of [['a','a'],['a','b b'],['a','b/b'],['a','日本語'],['a','x'.repeat(129)]]){
  assert.throws(()=>draftSingleEliminationBracket(players,128),/invalid entrants/);
 }
 assert.deepEqual(draftSingleEliminationBracket(['a','b'],2).pairs,[{round:1,slot:0,playerA:'a',playerB:'b'}]);
});
test('P10 readiness: bracket calculation cannot bypass publication authorization',()=>{
 for(const format of [false,true])for(const operator of [false,true]){
  assert.equal(mayPublishTournament(format,operator),format&&operator);
 }
});
