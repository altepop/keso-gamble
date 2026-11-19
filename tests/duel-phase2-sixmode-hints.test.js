import test from 'node:test';
import assert from 'node:assert/strict';
import {describeDuelActionHint} from '../duel-quality/duel-quality.js';

test('waiting opponent or ended games never offer a local action',()=>{
 for(const game of ['othello','gomoku','connect4','hitblow','bluffdice','poker']){
  assert.equal(describeDuelActionHint({game}),null);
 }
});
test('all six modes show distinct, actionable but non-predictive instructions',()=>{
 const cases=[
  ['othello',{available:4},/4か所/],
  ['gomoku',{selected:false},/位置を選び/],
  ['connect4',{available:7},/7列/],
  ['hitblow',{guessValid:false},/4桁/],
  ['bluffdice',{canChallenge:true},/相手の宣言を疑う/],
  ['poker',{count:2},/交換予定2枚/]
 ];
 for(const [game,options,pattern] of cases){
  const state=describeDuelActionHint({game,canAct:true,...options});
  assert.match(state.detail,pattern);
  assert.doesNotMatch(state.title+state.detail,/対戦結果を予測|相手の番号|相手の手札/);
 }
});
test('selection and input validation change only local instruction text',()=>{
 assert.match(describeDuelActionHint({game:'gomoku',canAct:true,selected:true}).detail,/ここに置く/);
 assert.match(describeDuelActionHint({game:'hitblow',canAct:true,guessValid:true}).detail,/予想を確定/);
 assert.match(describeDuelActionHint({game:'bluffdice',canAct:true}).detail,/個数・出目/);
 assert.equal(describeDuelActionHint({game:'other',canAct:true}),null);
});
