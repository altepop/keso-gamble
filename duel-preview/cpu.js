// Read-only CPU move selection. Every decision uses only public board state and the CPU's own
// private hand; the opponent's secret digits, dice and cards are never passed here.
// All moves are applied by the same pure game rules as live Discord duels.
import {duelLegalMoves,playDuelMove,duelScore} from './duel-rules.js';
import {connect4LegalMoves,connect4Move,hitBlowAnswer,pokerHandScore,validBluffBid} from './duel-mini-games.js';

const other=s=>s==='B'?'W':'B';
const miniOther=s=>s==='a'?'b':'a';
const sample=(arr,random)=>arr[Math.min(arr.length-1,Math.floor(Math.min(.999999,Math.max(0,random()))*arr.length))];
const parsed=value=>typeof value==='string'?JSON.parse(value):value;

function reversi(board,side,level,random){
 const moves=duelLegalMoves('othello',board,side),opp=other(side);
 if(!moves.length)throw Error('CPUの合法手がありません。');
 if(level==='easy')return {cell:sample(moves,random)};
 const corners=new Set([0,7,56,63]),nearCorner=new Set([1,8,9,6,14,15,48,49,57,54,55,62]);
 const scored=moves.map(cell=>{
  const after=playDuelMove('othello',board,side,cell),count=duelScore(after.board);
  const mobility=after.nextColor===opp?duelLegalMoves('othello',after.board,opp).length:0;
  const edge=[0,7].includes(Math.floor(cell/8))||[0,7].includes(cell%8);
  const score=(count[side]-count[opp])*2+(corners.has(cell)?70:edge?9:0)-
   (nearCorner.has(cell)?14:0)-mobility*(level==='strong'?5:2);
  return {cell,score};
 });
 scored.sort((a,b)=>b.score-a.score||a.cell-b.cell);
 return {cell:scored[0].cell};
}
function fiveLine(board,side,cell){
 const n=15,row=Math.floor(cell/n),col=cell%n;
 let value=0;
 for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
  let chain=1,open=0;
  for(const sign of [-1,1]){
   let r=row+dr*sign,c=col+dc*sign;
   while(r>=0&&c>=0&&r<n&&c<n&&board[r*n+c]===side){chain++;r+=dr*sign;c+=dc*sign;}
   if(r>=0&&c>=0&&r<n&&c<n&&board[r*n+c]==='.')open++;
  }
  if(chain>=5)return 1000000;
  value+=([0,1,3,18,120][Math.min(4,chain)]??0)*(open===2?3:open===1?1:0);
 }
 return value;
}
function gomoku(board,side,level,random){
 const moves=duelLegalMoves('gomoku',board,side);
 if(level==='easy')return {cell:sample(moves,random)};
 const opp=other(side);
 const nearby=moves.filter(cell=>{
  const r=Math.floor(cell/15),c=cell%15;
  for(let y=Math.max(0,r-2);y<=Math.min(14,r+2);y++)
   for(let x=Math.max(0,c-2);x<=Math.min(14,c+2);x++)
    if(board[y*15+x]!=='.')return true;
  return false;
 });
 const choices=nearby.length?nearby:[112];
 const scored=choices.map(cell=>{
  const attack=fiveLine(board,side,cell),defend=fiveLine(board,opp,cell);
  const center=10-(Math.abs(Math.floor(cell/15)-7)+Math.abs(cell%15-7));
  return {cell,score:attack>=1000000?10000000:defend>=1000000?9000000:
   attack*(level==='strong'?1.4:1)+defend*1.2+center*.45+random()*.01};
 });
 scored.sort((a,b)=>b.score-a.score);
 return {cell:scored[0].cell};
}
function connect4(board,side,level,random){
 const legal=connect4LegalMoves(board),opp=miniOther(side);
 if(level==='easy')return {cell:sample(legal,random)};
 for(const cell of legal)if(connect4Move(board,side,cell).winner===side)return {cell};
 for(const cell of legal)if(connect4Move(board,opp,cell).winner===opp)return {cell};
 const scored=legal.map(cell=>{
  const next=connect4Move(board,side,cell).board;
  const immediate=connect4LegalMoves(next).some(c=>connect4Move(next,opp,c).winner===opp);
  const threats=connect4LegalMoves(next).filter(c=>connect4Move(next,side,c).winner===side).length;
  return {cell,score:(immediate?-1000:0)+threats*(level==='strong'?8:3)+
   (3-Math.abs(3-cell))*3+random()};
 });
 scored.sort((a,b)=>b.score-a.score);
 return {cell:scored[0].cell};
}
const ALL_CODES=(()=>{const codes=[];for(let a=0;a<10;a++)for(let b=0;b<10;b++)for(let c=0;c<10;c++)for(let d=0;d<10;d++)
 if(new Set([a,b,c,d]).size===4)codes.push(''+a+b+c+d);return codes;})();
function hitblow(board,side,level,random){
 const state=parsed(board),seen=new Set(state.history.map(h=>h.guess));
 const known=state.history.filter(h=>h.by===side);
 const possible=ALL_CODES.filter(code=>known.every(h=>{
  const result=hitBlowAnswer(h.guess,code);return result.hit===h.hit&&result.blow===h.blow;
 }));
 const remaining=possible.filter(code=>!seen.has(code));
 if(!remaining.length)throw Error('CPUの推理候補がありません。');
 if(level!=='strong'||remaining.length<3)return {guess:sample(remaining,random)};
 // Prioritize guesses that separate the remaining consistent answers.
 const sampleAnswers=remaining.length>250?Array.from({length:250},()=>sample(remaining,random)):remaining;
 const candidates=remaining.length>24?Array.from({length:24},()=>sample(remaining,random)):remaining;
 let best=candidates[0],lowest=Infinity;
 for(const guess of candidates){
  const partition=new Map();
  for(const answer of sampleAnswers){
   const r=hitBlowAnswer(guess,answer),key=r.hit*5+r.blow;
   partition.set(key,(partition.get(key)??0)+1);
  }
  const cost=[...partition.values()].reduce((n,count)=>n+count*count,0);
  if(cost<lowest){lowest=cost;best=guess;}
 }
 return {guess:best};
}
function tailBinomial(needed){
 if(needed<=0)return 1;if(needed>5)return 0;
 const comb=[1,5,10,10,5,1];let value=0;
 for(let k=needed;k<=5;k++)value+=comb[k]*(1/6)**k*(5/6)**(5-k);
 return value;
}
function diceBid(board,hand,side,level,random){
 const state=parsed(board),bid=state.bid,own=Array.isArray(hand)?hand:[];
 if(!Array.isArray(hand)||own.length!==5)throw Error('CPUのダイスを確認できません。');
 const probability=(count,face)=>tailBinomial(count-own.filter(d=>d===face).length);
 if(bid){
  const p=probability(bid.count,bid.face);
  if(level==='easy'&&random()<.5)return {choice:'challenge'};
  if(p<(level==='strong'?.32:.2)||!validBluffBid(bid,10,6))return {choice:'challenge'};
 }
 const options=[];
 for(let count=1;count<=10;count++)for(let face=1;face<=6;face++)if(validBluffBid(bid,count,face)){
  const p=probability(count,face);
  if(p>= (level==='strong'?.60:.42))options.push({choice:'bid',count,face,p});
 }
 if(options.length){
  options.sort((a,b)=>a.count-b.count||a.face-b.face);
  // Never jump straight to an implausibly high bid when a modest one suffices.
  const preferred=options.filter(o=>o.count<=Math.max(2,bid?.count??2)+1);
  return sample((preferred.length?preferred:options).slice(0,level==='strong'?4:6),random);
 }
 return bid?{choice:'challenge'}:{choice:'bid',count:1,face:own[0]};
}
function poker(hand,level,random){
 if(!Array.isArray(hand)||hand.length!==5)throw Error('CPUの手札を確認できません。');
 if(level==='easy')return {cells:sample([[0,1,2],[1,3],[0,4],[]],random)};
 const score=pokerHandScore(hand),rank=score[0];
 if(rank>=5)return {cells:[]};
 const ranks=hand.map(c=>Math.floor(c/4)+2),count=ranks.map(r=>ranks.filter(v=>v===r).length);
 if(count.some(n=>n>=2)){
  const discard=hand.flatMap((_,i)=>count[i]===1?[i]:[]);
  return {cells:discard.slice(0,3)};
 }
 const suits=hand.map(c=>c%4),flushSuit=suits.find(s=>suits.filter(x=>x===s).length===4);
 if(flushSuit!==undefined)return {cells:suits.flatMap((s,i)=>s!==flushSuit?[i]:[])};
 const keep=ranks.flatMap((r,i)=>r>=13?[i]:[]);
 const replace=hand.flatMap((_,i)=>keep.includes(i)?[]:[i]);
 return {cells:replace.slice(0,3)};
}
export function chooseCpuMove(game,board,{side,hand=null,level='normal',random=Math.random}={}){
 if(!['easy','normal','strong'].includes(level))throw Error('CPUの強さが不正です。');
 if(typeof random!=='function')throw Error('乱数が不正です。');
 switch(game){
  case 'othello':return reversi(board,side,level,random);
  case 'gomoku':return gomoku(board,side,level,random);
  case 'connect4':return connect4(board,side,level,random);
  case 'hitblow':return hitblow(board,side,level,random);
  case 'bluffdice':return diceBid(board,hand,side,level,random);
  case 'poker':return poker(hand,level,random);
  default:throw Error('CPU非対応のゲームです。');
 }
}
