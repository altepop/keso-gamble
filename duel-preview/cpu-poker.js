// CPU draws from its own five cards only. The opponent's hidden hand/deck is NEVER
// passed to the decision function. Monte Carlo scenarios use common random numbers
// across all 26 legal exchanges, avoiding lucky independent-sample winners.
import {pokerHandScore} from '../js/duel-mini-games.js';
const pick=(arr,random)=>arr[Math.floor(Math.min(.999999,Math.max(0,random()))*arr.length)];
const rank=c=>Math.floor(c/4)+2;
export const standardDraw=hand=>{
 const tier=pokerHandScore(hand)[0];if(tier>=5)return [];
 const ranks=hand.map(rank),frequency=ranks.map(r=>ranks.filter(v=>v===r).length);
 if(frequency.some(n=>n>=2))return frequency.flatMap((n,i)=>n===1?[i]:[]).slice(0,3);
 const suits=hand.map(c=>c%4),suit=suits.find(s=>suits.filter(x=>x===s).length===4);
 if(suit!==undefined)return suits.flatMap((s,i)=>s!==suit?[i]:[]);
 const uniq=[...new Set(ranks)].sort((a,b)=>a-b);
 for(let lo=1;lo<=11;lo++){
  const seq=[lo,lo+1,lo+2,lo+3].map(r=>r===1?14:r);
  if(seq.every(r=>uniq.includes(r))){
   const keep=hand.map((c,i)=>seq.includes(rank(c))?i:-1).filter(i=>i>=0);
   return hand.flatMap((_,i)=>keep.includes(i)?[]:[i]);
  }
 }
 const keep=hand.flatMap((c,i)=>rank(c)>=13?[i]:[]);
 return hand.flatMap((_,i)=>keep.includes(i)?[]:[i]).slice(0,3);
};
const masks=[[]];for(let a=0;a<5;a++)masks.push([a]);
for(let a=0;a<5;a++)for(let b=a+1;b<5;b++)masks.push([a,b]);
for(let a=0;a<5;a++)for(let b=a+1;b<5;b++)for(let c=b+1;c<5;c++)masks.push([a,b,c]);
const cmp=(left,right)=>{
 for(let i=0;i<Math.max(left.length,right.length);i++){
  if((left[i]??0)>(right[i]??0))return 1;
  if((left[i]??0)<(right[i]??0))return -1;
 }
 return 0;
};
const generator=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function publicOpponentSwaps(board,side){
 if(typeof board!=='string')return null;
 let state;
 try{state=JSON.parse(board);}catch{return null;}
 // Only a completed, public opponent action can be observed. Own swap count
 // must never be used as evidence about their hidden five cards.
 const value=side==='a'?state?.swapsB:side==='b'?state?.swapsA:null;
 return Number.isInteger(value)&&value>=0&&value<=3?value:null;
}
function scenarios(hand,trials,random,opponentSwaps=null){
 const existing=new Set(hand),unseen=Array.from({length:52},(_,i)=>i).filter(c=>!existing.has(c));
 const salt=(Math.floor(random()*4294967296)>>>0)^hand.reduce((x,c)=>Math.imul(x+31,c+7)>>>0,17);
 const sets=[];
 // Opponent's PUBLIC exchange count changes the distribution of the hands
 // they are likely to have. Use rejection sampling with a hard time bound.
 // A zero-card exchange is rare; 120 examples suffice under a conservative
 // decision threshold, without freezing mobile Safari.
 const goal=opponentSwaps===0?120:trials;
 const maxAttempts=opponentSwaps===null?goal:opponentSwaps===0?22000:goal*18;
 for(let t=0;t<maxAttempts&&sets.length<goal;t++){
  const r=generator((salt+Math.imul(t+1,2654435761))>>>0);
  const next=unseen.slice();
  const draw=()=>{
   const i=Math.floor(r()*next.length),out=next[i];next[i]=next[next.length-1];next.pop();return out;
  };
  const opponent=Array.from({length:5},draw);
  const opponentDiscard=standardDraw(opponent);
  if(opponentSwaps!==null&&opponentDiscard.length!==opponentSwaps)continue;
  const oppExtra=Array.from({length:3},draw);
  for(let i=0;i<opponentDiscard.length;i++)opponent[opponentDiscard[i]]=oppExtra[i];
  const ours=Array.from({length:3},draw);
  sets.push({opponent:pokerHandScore(opponent),ours});
 }
 return sets;
}
export function cpuPoker(hand,level,random,board='{}',side='b'){
 if(!Array.isArray(hand)||hand.length!==5||new Set(hand).size!==5||
  hand.some(c=>!Number.isInteger(c)||c<0||c>51))throw Error('CPUの手札が不正です。');
 if(level==='easy')return {cells:pick([[0,1,2],[1,3],[0,4],[],[2,3,4]],random)};
 const baseline=standardDraw(hand);
 if(level==='normal')return {cells:baseline};
 const baselineKey=baseline.join(',');
 const trials=440;
 const observed=publicOpponentSwaps(board,side);
 const draws=scenarios(hand,trials,random,observed);
 if(draws.length<50)return {cells:baseline}; // insufficient conditional evidence
 const rate=new Map();
 for(const cells of masks){
  let wins=0;
  for(const scenario of draws){
   const completed=hand.slice();
   for(let i=0;i<cells.length;i++)completed[cells[i]]=scenario.ours[i];
   const side=pokerHandScore(completed),diff=cmp(side,scenario.opponent);
   wins+=diff>0?1:diff===0?.5:0;
  }
  rate.set(cells.join(','),wins/draws.length);
 }
 const base=rate.get(baselineKey)??0;
 // Require evidence of material improvement rather than picking the maximum
 // of 26 noisy estimates. This shields good one-pair / two-pair holdings.
 let selected=baseline,best=base+(observed===null?.025:observed===0?.07:.035);
 for(const cells of masks){
  const utility=(rate.get(cells.join(','))??0)-cells.length*.0003;
  if(utility>best){best=utility;selected=cells;}
 }
 return {cells:selected};
}
