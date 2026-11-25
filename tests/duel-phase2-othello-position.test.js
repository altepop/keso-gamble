import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeOthelloPosition,classifyOthelloTransition} from '../duel-quality/duel-quality.js';
import {initialDuelBoard,playDuelMove} from '../js/duel-rules.js';

test('initial board has a factual draw in stones, not a predicted winner',()=>{
 const status=summarizeOthelloPosition([...initialDuelBoard('othello')]);
 assert.deepEqual(status,{black:2,white:2,empty:60,lead:'石数は同数'});
});
test('after one server-defined move, show score lead and real remaining spaces',()=>{
 const start=initialDuelBoard('othello');
 const result=playDuelMove('othello',start,'B',19);
 assert.deepEqual(summarizeOthelloPosition([...result.board]),{black:4,white:1,empty:59,lead:'黒が3枚多い'});
 assert.deepEqual(classifyOthelloTransition([...start],[...result.board]),{placed:19,flipped:[{index:27,from:'W'}]});
});
test('other color lead and full board remain factual, not a winner call',()=>{
 const state=Array(64).fill('W');state[0]='B';
 assert.deepEqual(summarizeOthelloPosition(state),{black:1,white:63,empty:0,lead:'白が62枚多い'});
});
test('reject corrupt, partial or missing board instead of showing a fabricated score',()=>{
 assert.equal(summarizeOthelloPosition(null),null);
 assert.equal(summarizeOthelloPosition([]),null);
 assert.equal(summarizeOthelloPosition(Array(63).fill('.')),null);
 assert.equal(summarizeOthelloPosition([...Array(63).fill('.'),'hidden']),null);
});
