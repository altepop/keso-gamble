import assert from 'node:assert/strict';
import test from 'node:test';
import {draftSingleEliminationBracket} from '../src/duel-tournament-draft.ts';

test('P10 readiness: participant sequence and deterministic BYE assignment at non-powers of two',()=>{
 for(const n of [3,5,6,7,9,10,15,17,31,33,63,65,127]){
  const players=Array.from({length:n},(_,i)=>'entrant_'+i);
  const result=draftSingleEliminationBracket(players,128);
  const size=2**Math.ceil(Math.log2(n));
  const byes=size-n;
  assert.equal(result.byes,byes);
  assert.deepEqual(result.pairs.slice(0,byes).map(pair=>pair.playerA),players.slice(0,byes));
  assert.ok(result.pairs.slice(0,byes).every(pair=>pair.playerB===null));
  const remaining=result.pairs.slice(byes).flatMap(pair=>[pair.playerA,pair.playerB]);
  assert.deepEqual(remaining,players.slice(byes));
 }
});
test('P10 readiness: reordering entrants changes draft ordering but never identity membership',()=>{
 const original=['alpha','beta','gamma','delta','epsilon'];
 const reversed=[...original].reverse();
 const first=draftSingleEliminationBracket(original,8);
 const second=draftSingleEliminationBracket(reversed,8);
 assert.notDeepEqual(first.pairs,second.pairs);
 assert.deepEqual(new Set(first.participants),new Set(second.participants));
 assert.deepEqual(original,['alpha','beta','gamma','delta','epsilon']);
});
