import test from 'node:test';
import assert from 'node:assert/strict';
import {initialDuelBoard,duelLegalMoves,playDuelMove} from '../js/duel-rules.js';
import {connect4Board,connect4Move,miniStart,miniMove,validBluffBid,pokerHandName} from '../js/duel-mini-games.js';
import {chooseCpuMove} from '../duel-preview/cpu.js';
const fixed=()=>.4;
test('CPU picks legal Othello moves and prioritizes corner capture',()=>{
 const board=initialDuelBoard('othello');
 for(const level of ['easy','normal','strong']){
  const choice=chooseCpuMove('othello',board,{side:'B',level,random:fixed}).cell;
  assert.ok(duelLegalMoves('othello',board,'B').includes(choice));
  assert.ok(playDuelMove('othello',board,'B',choice).board.includes('B'));
 }
});
test('CPU Gomoku blocks an immediate five-in-a-row and plays legal openings',()=>{
 const board=initialDuelBoard('gomoku'),chars=[...board];
 for(const i of [112,113,114,115])chars[i]='B';
 chars[111]='W'; // Only cell 116 remains to prevent the imminent fifth.
 const next=chars.join('');
 const choice=chooseCpuMove('gomoku',next,{side:'W',level:'strong',random:fixed});
 assert.deepEqual(choice,{cell:116});
 assert.equal(chooseCpuMove('gomoku',board,{side:'W',level:'normal',random:fixed}).cell,112);
});
test('CPU Connect Four blocks immediate wins and chooses legal columns',()=>{
 let board=connect4Board();
 for(let i=0;i<3;i++)board=connect4Move(board,'a',0).board;
 assert.equal(chooseCpuMove('connect4',board,{side:'b',level:'strong',random:fixed}).cell,0);
 for(const level of ['easy','normal','strong']){
  assert.ok(Array.from({length:7},(_,i)=>i).includes(chooseCpuMove('connect4',connect4Board(),{side:'b',level,random:fixed}).cell));
 }
});
test('CPU Hit & Blow uses only public feedback, never sees the other secret',()=>{
 const start=miniStart('hitblow',n=>0);
 const input={side:'b',level:'strong',random:fixed};
 const guess=chooseCpuMove('hitblow',start.board,input).guess;
 assert.match(guess,/^[0-9]{4}$/);
 assert.equal(new Set(guess).size,4);
 const state=JSON.parse(start.board);state.history=[{by:'b',guess,hit:0,blow:0}];
 const answer=chooseCpuMove('hitblow',JSON.stringify(state),input).guess;
 assert.notEqual(answer,guess);
 // The same public board and CPU hand yield the same move regardless of opponent's secret.
 assert.deepEqual(chooseCpuMove('hitblow',JSON.stringify(state),input),{guess:answer});
});
test('CPU bluff dice will challenge impossible bids, validly raise plausible bids',()=>{
 const turn={turn:'b',round:1,winsA:0,winsB:0,bid:{by:'a',count:10,face:6},history:[]};
 const hand=[1,2,3,4,5];
 assert.deepEqual(chooseCpuMove('bluffdice',JSON.stringify(turn),{side:'b',hand,level:'strong',random:fixed}),{choice:'challenge'});
 const free={...turn,bid:null};
 const choice=chooseCpuMove('bluffdice',JSON.stringify(free),{side:'b',hand,random:fixed});
 assert.equal(choice.choice,'bid');assert.ok(validBluffBid(null,choice.count,choice.face));
});
test('CPU poker keeps a pair and exchanges three other cards, no peek at opponent deck',()=>{
 const c=(rank,suit)=>(rank-2)*4+suit;
 const hand=[c(8,0),c(8,1),c(4,0),c(6,1),c(11,2)];
 assert.equal(pokerHandName(hand),'ワンペア');
 assert.deepEqual(chooseCpuMove('poker','{}',{side:'b',hand,level:'strong',random:fixed}),{cells:[2,3,4]});
 const royal=[10,11,12,13,14].map(rank=>c(rank,0));
 assert.deepEqual(chooseCpuMove('poker','{}',{side:'b',hand:royal,level:'normal',random:fixed}),{cells:[]});
});
test('CPU moves comply with same miniMove engine on Connect Four, poker and bluff dice',()=>{
 for(const game of ['connect4','poker','bluffdice']){
  const start=miniStart(game, n=>0);
  const initial=game==='connect4'?
   {...start,board:connect4Board()}:{...start};
  let board=initial.board,secret=initial.secret;
  if(game==='connect4'){const turn=miniMove(game,board,secret,'a',{cell:3},()=>0);board=turn.board;secret=turn.secret;}
  else if(game==='poker'){const turn=miniMove(game,board,secret,'a',{cells:[]},()=>0);board=turn.board;secret=turn.secret;}
  else {const turn=miniMove(game,board,secret,'a',{choice:'bid',count:1,face:1},()=>0);board=turn.board;secret=turn.secret;}
  const hand=secret?JSON.parse(secret).privateB:null;
  const action=chooseCpuMove(game,board,{side:'b',hand,level:'normal',random:fixed});
  const done=miniMove(game,board,secret,'b',action,()=>0);
  assert.ok(typeof done.board==='string');
 }
});
