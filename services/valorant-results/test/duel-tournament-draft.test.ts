import assert from 'node:assert/strict';
import test from 'node:test';
import {draftSingleEliminationBracket,mayPublishTournament} from '../src/duel-tournament-draft.ts';
test('bracket deterministic and no user duplication',()=>{
 const bracket=draftSingleEliminationBracket(['a','b','c','d','e'],16);
 assert.equal(bracket.byes,3); assert.equal(bracket.pairs.length,4);
 assert.deepEqual(bracket.pairs[0],{round:1,slot:0,playerA:'a',playerB:null});
 assert.deepEqual(bracket.pairs[3],{round:1,slot:3,playerA:'d',playerB:'e'});
});
test('invalid entrants and unauthorized publication denied',()=>{
 assert.throws(()=>draftSingleEliminationBracket(['a','a'],8),/invalid entrants/);
 assert.throws(()=>draftSingleEliminationBracket(['a'],8),/invalid participant count/);
 assert.throws(()=>draftSingleEliminationBracket(['a','b'],1),/invalid configured capacity/);
 assert.equal(mayPublishTournament(true,false),false);
 assert.equal(mayPublishTournament(false,true),false);
 assert.equal(mayPublishTournament(true,true),true);
});
