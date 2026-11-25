import assert from 'node:assert/strict';
import test from 'node:test';
import {draftSingleEliminationBracket,mayPublishTournament} from '../src/duel-tournament-draft.ts';
test('P10.6 all capacities 2..128 never produce undefined participants or empty matches',()=>{
 for(let n=2;n<=128;n++){
  const players=Array.from({length:n},(_,i)=>'entrant_'+i);
  const draft=draftSingleEliminationBracket(players,128);
  const size=2**Math.ceil(Math.log2(n));
  assert.equal(draft.pairs.length,size/2,'pair count at '+n);
  assert.equal(draft.byes,size-n,'byes at '+n);
  const seen:string[]=[];
  let byeCount=0;
  for(const [slot,pair] of draft.pairs.entries()){
    assert.equal(pair.round,1);assert.equal(pair.slot,slot);
    assert.ok(players.includes(pair.playerA),'valid playerA at '+n);
    seen.push(pair.playerA);
    if(pair.playerB===null)byeCount++;
    else {assert.ok(players.includes(pair.playerB),'valid playerB at '+n);seen.push(pair.playerB);}
  }
  assert.equal(byeCount,size-n,'exact bye count at '+n);
  assert.equal(seen.length,n,'all entrants accounted for at '+n);
  assert.equal(new Set(seen).size,n,'no duplicate entrants at '+n);
  assert.deepEqual(new Set(seen),new Set(players),'no missing entrants at '+n);
 }
});
test('P10.6 bracket is pure and approval cannot be inferred from a valid draft',()=>{
 const list=['one','two','three','four','five'];
 const frozen=Object.freeze([...list]);
 const before=[...frozen];
 assert.deepEqual(draftSingleEliminationBracket(frozen,16),draftSingleEliminationBracket(frozen,16));
 assert.deepEqual(frozen,before);
 assert.equal(mayPublishTournament(false,false),false);
 assert.equal(mayPublishTournament(true,false),false);
 assert.equal(mayPublishTournament(false,true),false);
});
