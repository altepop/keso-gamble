import assert from 'node:assert/strict';
import test from 'node:test';
import {draftSingleEliminationBracket} from '../src/duel-tournament-draft.ts';

test('P10 readiness: proposed bracket generation is deterministic and never mutates entrants',()=>{
 for(const count of [2,3,5,6,9,17,33,65,127,128]){
  const entrants=Array.from({length:count},(_,i)=>'p'+i);
  const before=[...entrants];
  const first=draftSingleEliminationBracket(entrants,128);
  const second=draftSingleEliminationBracket(entrants,128);
  assert.deepEqual(first,second);
  assert.deepEqual(entrants,before);
  assert.deepEqual(first.participants,before);
  const listed=first.pairs.flatMap(p=>p.playerB===null?[p.playerA]:[p.playerA,p.playerB]);
  assert.deepEqual(new Set(listed),new Set(entrants));
 }
});
test('P10 readiness: exactly one bye per seeded bye slot; no empty match',()=>{
 for(let n=2;n<=128;n++){
  const entrants=Array.from({length:n},(_,i)=>'p'+i);
  const bracket=draftSingleEliminationBracket(entrants,128);
  const byes=bracket.pairs.filter(p=>p.playerB===null);
  assert.equal(byes.length,bracket.byes);
  assert.ok(bracket.pairs.every(p=>p.playerA.length>0));
  assert.ok(bracket.pairs.every(p=>p.playerB===null||p.playerB.length>0));
 }
});
