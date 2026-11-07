// Reproducible six-mode normal-vs-strong CPU benchmark using production rules.
// Never connects to Discord, D1 or real KP. Run: node scripts/duel-cpu-benchmark.mjs <game> [pairs].
import {performance} from 'node:perf_hooks';
import {chooseCpuMove} from '../duel-preview/cpu.js';
import {initialDuelBoard,playDuelMove,duelLegalMoves} from '../js/duel-rules.js';
import {connect4Board,connect4Move,connect4LegalMoves,miniStart,miniMove} from '../js/duel-mini-games.js';
const GAMES=['othello','gomoku','connect4','hitblow','bluffdice','poker'];
const game=process.argv[2],counts={othello:10,gomoku:14,connect4:14,hitblow:140,bluffdice:400,poker:350};
if(!GAMES.includes(game))throw Error('Specify game: '+GAMES.join(','));
const pairs=Number(process.argv[3]??counts[game]);
if(!Number.isInteger(pairs)||pairs<1||pairs>2000)throw Error('Invalid pair count');
const makeRng=seed=>{let n=(seed>>>0)||0x9e3779b9;return ()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;}};
const randInt=rng=>max=>Math.floor(rng()*max);
const select=(arr,rng)=>arr[Math.floor(rng()*arr.length)];
const opposite=s=>s==='B'?'W':s==='W'?'B':s==='a'?'b':'a';
const summary={game,pairs,seedBase:0x9d711a87,matched:0,win:0,loss:0,draw:0,
 strongAsFirst:{win:0,loss:0,draw:0},strongAsSecond:{win:0,loss:0,draw:0},
 moves:0,strongMoves:0,normalMoves:0,maxCpuMs:0,slowMoves:0,totalCpuMs:0,
 totalStrongMs:0,totalNormalMs:0,totalMatchMs:0,maxMatchMoves:0,invalid:[],
 finishReasons:{},sampleMatches:[]};
function recordError(seed,asFirst,turn,message){
 const text='seed '+seed+' strongFirst '+asFirst+' turn '+turn+': '+message;
 summary.invalid.push(text);if(summary.invalid.length<=3)console.error(text);
}
function boardPrefix(seed,game){
 const rng=makeRng(seed^0x531ac3e1);
 let board=game==='connect4'?connect4Board():initialDuelBoard(game);
 let next=game==='connect4'?'a':'B',winner=null;
 const count=game==='othello'?2:game==='connect4'?2:2;
 for(let k=0;k<count;k++){
  const legal=game==='connect4'?connect4LegalMoves(board):duelLegalMoves(game,board,next);
  if(!legal.length)break;
  // Play symmetrically seeded opening perturbations to prevent deterministic repetitions.
  const cell=select(legal,rng);
  const result=game==='connect4'?connect4Move(board,next,cell):playDuelMove(game,board,next,cell);
  board=result.board;winner=result.winner;
  next=game==='connect4'?result.turnSide:result.nextColor;
  if(winner)break;
 }
 return {board,turn:next,winner};
}
function contest(seed,asFirst){
 const rand=makeRng(seed^0x8a3b925f);
 const aRng=makeRng(seed^0xa13eab71),bRng=makeRng(seed^0x331dbaa8);
 const levels=asFirst?{a:'strong',b:'normal',B:'strong',W:'normal'}:
  {a:'normal',b:'strong',B:'normal',W:'strong'};
 let board,secret=null,turn,winner=null,round=0;
 if(['othello','gomoku','connect4'].includes(game)){
  const begin=boardPrefix(seed,game);
  board=begin.board;turn=begin.turn;winner=begin.winner;
 }else{
  const init=miniStart(game,randInt(rand));
  board=init.board;secret=init.secret;turn='a';
 }
 const started=performance.now();let error=null;
 for(;round<400&&!winner;round++){
  if(!turn){error='Missing turn without winner';break;}
  const level=levels[turn],seat=turn==='B'||turn==='a'?'a':'b';
  const playerRng=seat==='a'?aRng:bRng;
  const hidden=secret?JSON.parse(secret):null;
  const hand=hidden?(seat==='a'?hidden.privateA:hidden.privateB):null;
  const moveStart=performance.now();
  let chosen;
  try{chosen=chooseCpuMove(game,board,{side:turn,hand,level,random:playerRng});}
  catch(e){error='CPU exception: '+(e?.message??String(e));break;}
  const duration=performance.now()-moveStart;
  summary.maxCpuMs=Math.max(summary.maxCpuMs,duration);
  summary.totalCpuMs+=duration;
  if(level==='strong'){summary.strongMoves++;summary.totalStrongMs+=duration;}
  else {summary.normalMoves++;summary.totalNormalMs+=duration;}
  if(duration>1500)summary.slowMoves++;
  try{
   const result=game==='connect4'?connect4Move(board,turn,chosen.cell):
    (game==='othello'||game==='gomoku')?playDuelMove(game,board,turn,chosen.cell):
    miniMove(game,board,secret,turn,chosen,randInt(rand));
   board=result.board;winner=result.winner;turn=game==='connect4'?result.turnSide:
    game==='othello'||game==='gomoku'?result.nextColor:result.turnSide;
   if(game!=='connect4'&&game!=='gomoku'&&game!=='othello')secret=result.secret;
  }catch(e){error='Illegal move '+JSON.stringify(chosen)+': '+(e?.message??String(e));break;}
 }
 const elapsed=performance.now()-started;
 summary.totalMatchMs+=elapsed;
 summary.moves+=round+Number(Boolean(winner));
 summary.maxMatchMoves=Math.max(summary.maxMatchMoves,round+Number(Boolean(winner)));
 if(error||!winner){recordError(seed,asFirst,round,error??'Exceeded 400 turns');return;}
 const strongSide=asFirst?(game==='othello'||game==='gomoku'?'B':'a'):
  (game==='othello'||game==='gomoku'?'W':'b');
 const result=winner==='draw'?'draw':winner===strongSide?'win':'loss';
 summary[result]++;summary[asFirst?'strongAsFirst':'strongAsSecond'][result]++;
 summary.matched++;
 summary.finishReasons[winner]=(summary.finishReasons[winner]??0)+1;
 if(summary.sampleMatches.length<10)summary.sampleMatches.push({seed,asFirst,turns:round+1,winner,result,elapsedMs:Math.round(elapsed)});
}
for(let seed=0;seed<pairs;seed++){
 const value=(0x9d711a87+Math.imul(seed+1,0x9e3779b9))>>>0;
 contest(value,true);contest(value,false);
 if(summary.invalid.length>=5)break;
}
summary.strongWinPercent=summary.matched?Math.round(1000*(summary.win+.5*summary.draw)/summary.matched)/10:null;
summary.strongRawWinPercent=summary.matched?Math.round(1000*summary.win/summary.matched)/10:null;
summary.strongAvgDecisionMs=Math.round(10*summary.totalStrongMs/Math.max(1,summary.strongMoves))/10;
summary.normalAvgDecisionMs=Math.round(10*summary.totalNormalMs/Math.max(1,summary.normalMoves))/10;
summary.maxCpuMs=Math.round(summary.maxCpuMs);
summary.elapsedSec=Math.round(summary.totalMatchMs/1000);
console.log('BENCH_RESULT '+JSON.stringify(summary));
if(summary.invalid.length)process.exitCode=1;
