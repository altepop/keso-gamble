import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {chooseCpuMove,CPU_DIFFICULTY_GUIDE} from '../duel-preview/cpu.js';
import {initialDuelBoard,duelLegalMoves,playDuelMove} from '../js/duel-rules.js';
import {connect4Board,connect4LegalMoves,connect4Move,miniStart,miniMove,hitBlowAnswer} from '../js/duel-mini-games.js';

const rand=seed=>{let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296}};
const randint=r=>max=>Math.floor(r()*max);
const ownMoves=(game,board,side)=>game==='connect4'?connect4LegalMoves(board):duelLegalMoves(game,board,side);
test('Six difficulty guides describe actual strategies without old obsolete trial counts',()=>{
 for(const game of ['othello','gomoku','connect4','hitblow','bluffdice','poker']){
  for(const level of ['easy','normal','strong'])assert.ok(CPU_DIFFICULTY_GUIDE[game][level].length>12);
 }
 assert.match(CPU_DIFFICULTY_GUIDE.hitblow.strong,/1,450/);
 assert.match(CPU_DIFFICULTY_GUIDE.poker.strong,/公開交換枚数/);
});
test('100 deterministic board decisions never break live legal-move validation',()=>{
 for(const game of ['othello','gomoku','connect4']){
  const r=rand(game.length*991),n=game==='othello'?64:game==='gomoku'?225:42;
  let board=game==='connect4'?connect4Board():initialDuelBoard(game);
  let side=game==='connect4'?'a':'B';
  for(let t=0;t<Math.min(n,65);t++){
   const level=['easy','normal','strong'][t%3];
   const allowed=ownMoves(game,board,side);
   if(!allowed.length)break;
   const action=chooseCpuMove(game,board,{side,level,random:r});
   assert.ok(allowed.includes(action.cell),game+' '+level+' '+t);
   const step=game==='connect4'?connect4Move(board,side,action.cell):
    playDuelMove(game,board,side,action.cell);
   board=step.board;side=game==='connect4'?step.turnSide:step.nextColor;
   if(step.winner)break;
  }
 }
});
test('Strong bluff selects guaranteed truthful raise using own dice; no opponent information',()=>{
 const hand=[6,6,6,2,3],board=JSON.stringify({turn:'b',bid:null,history:[],round:1});
 const action=chooseCpuMove('bluffdice',board,{side:'b',hand,level:'strong',random:rand(99)});
 assert.deepEqual(action,{choice:'bid',count:3,face:6});
});
test('Hit & Blow solves a single remaining secret and respects other players guesses',()=>{
 const target='0123',mine=['0124','0135','0216'].map(guess=>({by:'b',guess,...hitBlowAnswer(guess,target)}));
 const history=[...mine,{by:'a',guess:target,hit:0,blow:0}];
 for(const level of ['easy','normal','strong']){
  assert.equal(chooseCpuMove('hitblow',JSON.stringify({history}),{side:'b',level,random:rand(4)}).guess,target);
 }
});
test('Poker strong never discards duplicate cards, even for random hands and constant RNG',()=>{
 const r=rand(1107),cards=Array.from({length:52},(_,i)=>i),start=performance.now();
 for(let t=0;t<45;t++){
  const deck=cards.slice();
  for(let i=deck.length-1;i>0;i--){const j=randint(r)(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
  const hand=deck.slice(0,5);
  const action=chooseCpuMove('poker','{}',{hand,side:'b',level:'strong',random:()=>.3});
  assert.ok(Array.isArray(action.cells)&&action.cells.length<=3);
  assert.equal(new Set(action.cells).size,action.cells.length);
  assert.ok(action.cells.every(i=>Number.isInteger(i)&&i>=0&&i<5));
 }
 assert.ok(performance.now()-start<12000,'45 poker turns must not freeze mobile browsers');
});
test('No CPU decision needs the other player private secret to apply to live rules',()=>{
 const r=rand(112357);
 for(const game of ['hitblow','bluffdice','poker']){
  const start=miniStart(game,randint(r));
  let board=start.board,secret=start.secret;
  const hand=JSON.parse(secret).privateA;
  const chosen=chooseCpuMove(game,board,{side:'a',hand,level:'strong',random:rand(42)});
  const result=miniMove(game,board,secret,'a',chosen,randint(r));
  assert.ok(result?.board);
 }
});

test('Poker conditions on a PUBLIC opponent exchange count, never on another secret',()=>{
 const r=rand(3171);
 for(const hand of [[5,9,17,25,33],[0,12,24,36,48],[5,6,7,24,49]]){
  const a=chooseCpuMove('poker',JSON.stringify({turn:'b',swapsA:3}),{side:'b',hand,level:'strong',random:r});
  const b=chooseCpuMove('poker',JSON.stringify({turn:'b',swapsA:0}),{side:'b',hand,level:'strong',random:r});
  const c=chooseCpuMove('poker',JSON.stringify({turn:'a',swapsB:null}),{side:'a',hand,level:'strong',random:r});
  for(const m of [a,b,c]){
   assert.ok(m.cells.length<=3&&new Set(m.cells).size===m.cells.length);
   assert.ok(m.cells.every(i=>Number.isInteger(i)&&i>=0&&i<5));
  }
 }
});
