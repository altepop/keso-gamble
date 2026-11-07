// Paired counterfactual test: identical poker deck, unchanged Normal opponent,
// former Strong policy vs proposed Strong policy. The old policy is materialized
// as duel-preview/cpu-poker-prior.js by the GitHub Actions test job.
import {performance} from 'node:perf_hooks';
import {miniStart,miniMove} from '../js/duel-mini-games.js';
import {cpuPoker as newPoker,standardDraw} from '../duel-preview/cpu-poker.js';
import {cpuPoker as oldPoker} from '../duel-preview/cpu-poker-prior.js';
const n=Number(process.argv[2]??450);
if(!Number.isInteger(n)||n<1||n>8000)throw Error('Invalid scenario count');
function rng(seed){let x=seed>>>0||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
function run(seed,strongSeat,newPolicy){
 const d=rng(seed),start=miniStart('poker',max=>Math.floor(d()*max));
 let board=start.board,secret=start.secret,choice=null,swaps=null;
 const sample=rng(seed^0x41a1b30c);
 for(const side of ['a','b']){
  const hand=JSON.parse(secret)[side==='a'?'privateA':'privateB'];
  const strong=side===strongSeat;
  const action=strong?newPolicy?
   newPoker(hand,'strong',sample,board,side):
   oldPoker(hand,'strong',sample):{cells:standardDraw(hand)};
  if(strong){choice=action.cells;swaps=JSON.parse(board)[side==='b'?'swapsA':'swapsB'];}
  const step=miniMove('poker',board,secret,side,action,max=>Math.floor(d()*max));
  board=step.board;secret=step.secret;
 }
 const end=JSON.parse(board),winner=Number(end.showdown!==null);
 // Derive winner only from the same actual game rule; final hands are public
 // at showdown, but never supplied to either policy during decision-making.
 const {comparePokerHands}=awaitGameRules();
 const cmp=comparePokerHands(JSON.parse(secret).privateA,JSON.parse(secret).privateB);
 return {win:cmp===0?0:((cmp>0?'a':'b')===strongSeat?1:-1),cells:choice,publicOpponentSwaps:swaps};
}
// Static module import kept separate from the match policy's hidden inputs.
import {comparePokerHands} from '../js/duel-mini-games.js';
function awaitGameRules(){return {comparePokerHands};}
const result={seeds:n,matches:0,newWin:0,oldWin:0,drawNew:0,drawOld:0,
 newOnly:0,oldOnly:0,bothWin:0,bothLose:0,newChangedDraw:0,
 differingChoices:0,bySeat:{a:{new:0,old:0,diff:0},b:{new:0,old:0,diff:0}},
 byPublicSwaps:{},seconds:0};
const started=performance.now();
for(let i=0;i<n;i++){
 const seed=(0x9d711a87+Math.imul(i+1,2654435761))>>>0;
 for(const side of ['a','b']){
  const old=run(seed,side,false),current=run(seed,side,true);
  result.matches++;
  if(old.win===1)result.oldWin++;if(current.win===1)result.newWin++;
  if(old.win===0)result.drawOld++;if(current.win===0)result.drawNew++;
  if(old.win===1&&current.win===1)result.bothWin++;
  else if(old.win===-1&&current.win===-1)result.bothLose++;
  else if(old.win===-1&&current.win===1)result.newOnly++;
  else if(old.win===1&&current.win===-1)result.oldOnly++;
  else if(old.win!==current.win)result.newChangedDraw++;
  const entry=result.bySeat[side];entry.old+=(old.win+1)/2;entry.new+=(current.win+1)/2;
  if(old.cells.join(',')!==current.cells.join(',')){result.differingChoices++;entry.diff++;}
  const key=current.publicOpponentSwaps===null?'unknown':String(current.publicOpponentSwaps);
  const group=result.byPublicSwaps[key]??={matches:0,new:0,old:0,diff:0};
  group.matches++;group.new+=(current.win+1)/2;group.old+=(old.win+1)/2;
  if(old.cells.join(',')!==current.cells.join(','))group.diff++;
 }
}
result.seconds=Math.round((performance.now()-started)/1000);
console.log('POKER_AB_RESULT '+JSON.stringify(result));
