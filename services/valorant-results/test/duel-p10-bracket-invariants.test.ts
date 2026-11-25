import assert from 'node:assert/strict';
import test from 'node:test';
import {draftSingleEliminationBracket,mayPublishTournament} from '../src/duel-tournament-draft.ts';

test('P10 readiness: brackets from 2 through 128 entrants preserve all IDs and never create empty matches',()=>{
 for(let count=2;count<=128;count++){
  const players=Array.from({length:count},(_,i)=>'player-'+i);
  const draft=draftSingleEliminationBracket(players,128);
  const size=2**Math.ceil(Math.log2(count));
  assert.equal(draft.pairs.length,size/2,'pairs count '+count);
  assert.equal(draft.byes,size-count,'bye count '+count);
  assert.deepEqual(draft.participants,players);
  const flattened=draft.pairs.flatMap(pair=>pair.playerB===null?[pair.playerA]:[pair.playerA,pair.playerB]);
  assert.equal(flattened.length,count,'entrant count '+count);
  assert.deepEqual(new Set(flattened),new Set(players));
  assert.deepEqual(draft.pairs.map(pair=>pair.slot),Array.from({length:size/2},(_,i)=>i));
  assert.ok(draft.pairs.every(pair=>pair.round===1));
  assert.equal(draft.pairs.filter(pair=>pair.playerB===null).length,size-count);
 }
});
test('P10 readiness: malformed capacities, duplicates and IDs fail closed',()=>{
 const players=['a','b'];
 for(const capacity of [-1,0,1,1.5,129,NaN,Infinity]){
  assert.throws(()=>draftSingleEliminationBracket(players,capacity),/invalid configured capacity/);
 }
 for(const entrants of [[],['a'],['a','a'],['a','b/b'],['a',''],['a','x'.repeat(129)]]){
  assert.throws(()=>draftSingleEliminationBracket(entrants,128),/invalid participant count|invalid entrants/);
 }
 assert.throws(()=>draftSingleEliminationBracket(['a','b','c'],2),/invalid participant count/);
});
test('P10 readiness: bracket preparation never independently authorizes publication',()=>{
 for(const formatApproved of [false,true])for(const operatorApproved of [false,true]){
  assert.equal(mayPublishTournament(formatApproved,operatorApproved),formatApproved&&operatorApproved);
 }
 assert.equal(mayPublishTournament(false,false),false);
});
