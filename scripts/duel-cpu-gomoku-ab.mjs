// Paired counterfactual Gomoku tournament. Fixed opening and unchanged Normal
// opponent, both old/current Strong CPU decisions applied by production rules.
import {initialDuelBoard,playDuelMove,duelLegalMoves} from '../js/duel-rules.js';
import {chooseGomoku as previous} from '../duel-preview/cpu-board-search-prior.js';
import {chooseGomoku as current} from '../duel-preview/cpu-board-search.js';
import {performance} from 'node:perf_hooks';
const pairs=Number(process.argv[2]??100);
if(!Number.isInteger(pairs)||pairs<1||pairs>900)throw Error('Invalid scenario count');
function random(seed){let s=seed>>>0||11;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function start(seed){
 const r=random(seed^0x531ac3e1),other=s=>s==='B'?'W':'B';
 let board=initialDuelBoard('gomoku'),turn='B';
 for(let k=0;k<2;k++){
  const legal=duelLegalMoves('gomoku',board,turn);
  const cell=legal[Math.floor(r()*legal.length)];
  const next=playDuelMove('gomoku',board,turn,cell);board=next.board;turn=other(turn);
 }
 return {board,turn};
}
function duel(seed,hardFirst,useNew){
 const initial=start(seed),r=random(seed^0xa13eab71);
 let board=initial.board,turn=initial.turn,steps=0,maxMs=0;
 const strongSide=hardFirst?'B':'W',opposite=s=>s==='B'?'W':'B';
 for(;steps<225;steps++){
  const hard=turn===strongSide;
  const a=performance.now(),cell=hard?
   (useNew?current:previous)(board,turn,'strong',r).cell:
   previous(board,turn,'normal',r).cell;
  maxMs=Math.max(maxMs,performance.now()-a);
  const next=playDuelMove('gomoku',board,turn,cell);
  board=next.board;
  if(next.winner)return {outcome:next.winner==='draw'?0:next.winner===strongSide?1:-1,maxMs,steps:steps+1};
  turn=opposite(turn);
 }
 throw Error('No winner or draw after full board');
}
const result={pairs,matched:0,oldScore:0,newScore:0,
 old:{win:0,loss:0,draw:0},current:{win:0,loss:0,draw:0},
 improved:0,worsened:0,unchanged:0,maxMs:0,bySide:{}};
for(let i=0;i<pairs;i++){
 const seed=(0x9d711a87+Math.imul(i+1,2654435761))>>>0;
 for(const first of [true,false]){
  const before=duel(seed,first,false),after=duel(seed,first,true);
  result.matched++;
  result.oldScore+=(before.outcome+1)/2;
  result.newScore+=(after.outcome+1)/2;
  result.old[before.outcome===1?'win':before.outcome===-1?'loss':'draw']++;
  result.current[after.outcome===1?'win':after.outcome===-1?'loss':'draw']++;
  if(after.outcome>before.outcome)result.improved++;
  else if(after.outcome<before.outcome)result.worsened++;
  else result.unchanged++;
  result.maxMs=Math.max(result.maxMs,before.maxMs,after.maxMs);
 }
}
result.oldPercent=Math.round(1000*result.oldScore/result.matched)/10;
result.newPercent=Math.round(1000*result.newScore/result.matched)/10;
console.log('GOMOKU_AB_RESULT '+JSON.stringify(result));
