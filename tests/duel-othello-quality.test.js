import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyOthelloTransition} from '../duel-quality/duel-quality.js';
const initial=()=>{const board=Array(64).fill('.');board[27]='W';board[28]='B';board[35]='B';board[36]='W';return board;};
test('one legal Othello stone animates the landing and captured stone',()=>{
 const old=initial(),next=[...old];next[19]='B';next[27]='B';
 assert.deepEqual(classifyOthelloTransition(old,next),{placed:19,flipped:[{index:27,from:'W'}]});
});
test('multiple flips animate only when a unique new stone is known',()=>{
 const old=initial(),next=[...old];next[19]='B';next[27]='B';next[36]='B';
 assert.deepEqual(classifyOthelloTransition(old,next),{placed:19,flipped:[{index:27,from:'W'},{index:36,from:'W'}]});
});
test('stale or ambiguous boards never pretend to animate a single move',()=>{
 const old=initial(),two=[...old];two[19]='B';two[20]='B';two[27]='B';
 assert.equal(classifyOthelloTransition(old,two),null);
 assert.equal(classifyOthelloTransition(old,old),null);
 const removed=[...old];removed[27]='.';assert.equal(classifyOthelloTransition(old,removed),null);
 assert.equal(classifyOthelloTransition(null,old),null);
 assert.equal(classifyOthelloTransition(old,old.slice(1)),null);
});
