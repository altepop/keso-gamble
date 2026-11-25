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

import {duelScreen} from '../js/duel-view.js';
import {initialDuelBoard,playDuelMove} from '../js/duel-rules.js';
const first='u1',second='u2';
const view=(board,turn=first)=>duelScreen({
 info:{games:{othello:{name:'オセロ'}},members:[{id:first,name:'本人'},{id:second,name:'対戦相手'}],matches:[{
  id:'safe-othello',game:'othello',user_a:first,user_b:second,
  black_user:first,turn_user:turn,status:'active',stake:1000,
  board,winner:null,version:2,deadline_at:Date.now()+600000,updated_at:Date.now()
 }]},
 user:first,live:true,cash:9000,selectedId:'safe-othello'
});
test('Othello UI shows the pure-rule capture count only on legal moves and never changes the board',()=>{
 const board=initialDuelBoard('othello'),html=view(board);
 assert.equal((html.match(/class="duel-capture-count"/g)||[]).length,4);
 for(const index of [19,26,37,44]){
  assert.match(html,new RegExp('data-duel-cell="'+index+'"[^>]*aria-label="[^"]*1枚返せる'));
 }
 assert.match(html,/置ける場所 4か所/);
 assert.match(html,/aria-label="黒 2枚、白 2枚、空き 60マス"/);
 assert.match(html,/duel-score-black" style="width:3.125%"/);
 assert.equal(board,initialDuelBoard('othello'),'the view cannot commit a move');
});
test('Othello preview hides when it is the opponent turn, while scores remain public',()=>{
 const board=playDuelMove('othello',initialDuelBoard('othello'),'B',19).board;
 const html=view(board,second);
 assert.equal((html.match(/class="duel-capture-count"/g)||[]).length,0);
 assert.match(html,/aria-label="黒 4枚、白 1枚、空き 59マス"/);
 assert.match(html,/相手の着手を待とう/);
});
