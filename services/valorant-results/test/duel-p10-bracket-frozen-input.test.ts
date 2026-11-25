import assert from 'node:assert/strict';
import test from 'node:test';
import {draftSingleEliminationBracket,mayPublishTournament} from '../src/duel-tournament-draft.ts';

test('P10 readiness: a frozen entrant list can produce a draft without mutation',()=>{
 for(const n of [2,3,5,8,17,64,128]){
  const entrants=Object.freeze(Array.from({length:n},(_,i)=>'entrant_'+i));
  const first=draftSingleEliminationBracket(entrants,128);
  const second=draftSingleEliminationBracket(entrants,128);
  assert.deepEqual(first,second);
  assert.deepEqual(first.participants,entrants);
  assert.notStrictEqual(first.participants,entrants);
 }
});
test('P10 readiness: bracket publication needs independent format and operator authorization',()=>{
 for(const format of [false,true])for(const operator of [false,true]){
  assert.equal(mayPublishTournament(format,operator),format&&operator);
 }
});
