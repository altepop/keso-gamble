import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseCpuMove,CPU_DIFFICULTY_GUIDE} from '../duel-preview/cpu.js';
import {initialDuelBoard,duelLegalMoves,playDuelMove} from '../js/duel-rules.js';
import {connect4Board,connect4LegalMoves,connect4Move,miniStart,miniMove,hitBlowAnswer,validBluffBid,comparePokerHands} from '../js/duel-mini-games.js';

const deterministic=()=>.3915;
test('Every mode has distinct, truthful level-specific descriptions',()=>{
 for(const game of ['othello','gomoku','connect4','hitblow','bluffdice','poker']){
  const guide=CPU_DIFFICULTY_GUIDE[game];
  for(const level of ['easy','normal','strong'])
   assert.ok(typeof guide[level]==='string'&&guide[level].length>16,game+' '+level);
  assert.notEqual(guide.easy,guide.normal);
  assert.notEqual(guide.normal,guide.strong);
 }
});
test('Strong Othello captures an exposed corner',()=>{
 const board=[...initialDuelBoard('othello')];
 board[0]='.';board[1]='W';board[2]='B';board[8]='W';board[16]='B';
 const b=board.join('');
 assert.ok(duelLegalMoves('othello',b,'B').includes(0));
 const move=chooseCpuMove('othello',b,{side:'B',level:'strong',random:deterministic});
 assert.deepEqual(move,{cell:0});
});
test('Strong Gomoku wins immediately and blocks immediate opponent win',()=>{
 const original=initialDuelBoard('gomoku'),win=[...original],block=[...original];
 for(const i of [112,113,114,115]){win[i]='W';block[i]='B';}
 win[111]='B';block[111]='W';
 assert.equal(chooseCpuMove('gomoku',win.join(''),{side:'W',level:'strong',random:deterministic}).cell,116);
 assert.equal(chooseCpuMove('gomoku',block.join(''),{side:'W',level:'strong',random:deterministic}).cell,116);
});
test('Connect4 strong always takes a win, blocks a loss and moves legally',()=>{
 let board=connect4Board();
 for(let n=0;n<3;n++)board=connect4Move(board,'a',0).board;
 assert.deepEqual(chooseCpuMove('connect4',board,{side:'a',level:'strong',random:deterministic}),{cell:0});
 assert.deepEqual(chooseCpuMove('connect4',board,{side:'b',level:'strong',random:deterministic}),{cell:0});
 for(const level of ['easy','normal','strong']){
  const cell=chooseCpuMove('connect4',board,{side:'b',level,random:deterministic}).cell;
  assert.ok(connect4LegalMoves(board).includes(cell));
 }
});
test('Hit & Blow observes only own public response and consistently narrows guesses',()=>{
 const start=miniStart('hitblow',n=>n-1);
 const state=JSON.parse(start.board);
 const first=chooseCpuMove('hitblow',start.board,{side:'b',level:'strong',random:deterministic}).guess;
 assert.match(first,/^\d{4}$/);
 const answer='9876',feedback=hitBlowAnswer(first,answer);
 state.history.push({by:'b',guess:first,...feedback});
 const second=chooseCpuMove('hitblow',JSON.stringify(state),{side:'b',level:'strong',random:deterministic}).guess;
 assert.notEqual(first,second);
 assert.deepEqual(chooseCpuMove('hitblow',JSON.stringify(state),{side:'b',level:'strong',random:deterministic}),{guess:second});
});
test('Bluff dice never bids illegally and challenges a provably impossible claim',()=>{
 const hand=[1,2,3,4,5],base={round:1,winsA:0,winsB:0,turn:'b',bid:{by:'a',count:10,face:6},history:[]};
 for(const level of ['normal','strong'])
  assert.deepEqual(chooseCpuMove('bluffdice',JSON.stringify(base),{side:'b',hand,level,random:deterministic}),{choice:'challenge'});
 for(const level of ['easy','normal','strong']){
  const current={...base,bid:null};
  const move=chooseCpuMove('bluffdice',JSON.stringify(current),{side:'b',hand,level,random:deterministic});
  assert.equal(move.choice,'bid');assert.ok(validBluffBid(null,move.count,move.face));
 }
});
test('Strong poker preserves a made straight flush and never throws illegal indices',()=>{
 const c=(rank,suit)=>(rank-2)*4+suit,royal=[10,11,12,13,14].map(r=>c(r,0));
 assert.deepEqual(chooseCpuMove('poker','{}',{hand:royal,level:'strong',random:deterministic}),{cells:[]});
 const pair=[c(8,0),c(8,1),c(4,0),c(6,1),c(11,2)];
 for(const level of ['easy','normal','strong']){
  const cells=chooseCpuMove('poker','{}',{hand:pair,level,random:deterministic}).cells;
  assert.ok(Array.isArray(cells)&&cells.length<=3&&new Set(cells).size===cells.length);
  assert.ok(cells.every(i=>Number.isInteger(i)&&i>=0&&i<=4));
 }
});
test('Strong CPU terminates within bounded time in all six opening scenarios',()=>{
 const cards=miniStart('poker',()=>0),dice=miniStart('bluffdice',()=>0);
 const cases=[
  ['othello',initialDuelBoard('othello'),{side:'B'}],
  ['gomoku',initialDuelBoard('gomoku'),{side:'B'}],
  ['connect4',connect4Board(),{side:'b'}],
  ['hitblow',miniStart('hitblow',()=>0).board,{side:'b'}],
  ['bluffdice',dice.board,{side:'a',hand:JSON.parse(dice.secret).privateA}],
  ['poker',cards.board,{side:'a',hand:JSON.parse(cards.secret).privateA}]
 ];
 for(const [game,board,extra] of cases){
  const started=performance.now();
  const move=chooseCpuMove(game,board,{...extra,level:'strong',random:deterministic});
  const elapsed=performance.now()-started;
  assert.ok(move&&typeof move==='object',game);
  assert.ok(elapsed<3000,game+' CPU took '+elapsed.toFixed(0)+'ms');
 }
});

test('Hit & Blow never discards the correct answer merely because the other player guessed it',()=>{
 const target='0123';
 const history=['0124','0135','0216'].map(guess=>({by:'b',guess,...hitBlowAnswer(guess,target)}));
 history.push({by:'a',guess:target,hit:0,blow:1}); // Different player targets a different secret.
 const state={turn:'b',history};
 for(const level of ['easy','normal','strong']){
  const choice=chooseCpuMove('hitblow',JSON.stringify(state),{side:'b',level,random:deterministic});
  assert.deepEqual(choice,{guess:target});
 }
});
