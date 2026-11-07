// Five-card draw decisions using only CPU's own hand and an unseen standard deck.
// Strong CPU estimates showdown win-rate against an opponent who also exchanges cards.
import {comparePokerHands,pokerHandScore} from '../js/duel-mini-games.js';
const pick=(arr,random)=>arr[Math.floor(Math.min(.999999,Math.max(0,random()))*arr.length)];
const rank=card=>Math.floor(card/4)+2;
const standardDraw=hand=>{
 const scored=pokerHandScore(hand)[0];if(scored>=5)return [];
 const ranks=hand.map(rank),frequency=ranks.map(r=>ranks.filter(v=>v===r).length);
 if(frequency.some(n=>n>=2))return frequency.flatMap((n,i)=>n===1?[i]:[]).slice(0,3);
 const suits=hand.map(c=>c%4),suit=suits.find(s=>suits.filter(x=>x===s).length===4);
 if(suit!==undefined)return suits.flatMap((s,i)=>s!==suit?[i]:[]);
 // Preserve a four-card open-ended straight draw if it does not sacrifice a pair.
 const unique=[...new Set(ranks)].sort((a,b)=>a-b);
 for(const lo of [1,2,3,4,5,6,7,8,9,10,11]){
  const seq=[lo,lo+1,lo+2,lo+3].map(r=>r===1?14:r);
  if(seq.every(r=>unique.includes(r))){
   const keep=hand.map((card,i)=>seq.includes(rank(card))?i:-1).filter(i=>i>=0);
   return hand.flatMap((_,i)=>keep.includes(i)?[]:[i]);
  }
 }
 const high=hand.flatMap((card,i)=>rank(card)>=13?[i]:[]);
 return hand.flatMap((_,i)=>high.includes(i)?[]:[i]).slice(0,3);
};
const subsets=()=>{
 const x=[[]];
 for(let a=0;a<5;a++)x.push([a]);
 for(let a=0;a<5;a++)for(let b=a+1;b<5;b++)x.push([a,b]);
 for(let a=0;a<5;a++)for(let b=a+1;b<5;b++)for(let c=b+1;c<5;c++)x.push([a,b,c]);
 return x;
};
const masks=subsets();
const prng=seed=>()=>{
 seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 return seed/4294967296;
};
function showdownRate(hand,change,trials,random){
 const known=new Set(hand),unseen=Array.from({length:52},(_,i)=>i).filter(c=>!known.has(c));
 let wins=0;
 const salt=((random()*4294967296)>>>0)^hand.reduce((x,c)=>Math.imul(x+31,c+7)>>>0,17);
 for(let t=0;t<trials;t++){
  const next=unseen.slice();
  const rnd=prng((salt+Math.imul(t+1,2654435761))>>>0);
  // Fresh random unseen cards without replacement, no known opponent cards.
  function draw(){
   const n=next.length,i=Math.floor(rnd()*n);
   const c=next[i];next[i]=next[n-1];next.pop();
   return c;
  }
  const opponent=Array.from({length:5},draw);
  const result=hand.slice();
  // Simulate the opponent exchanging their own cards by ordinary 5-card strategy.
  const oppChange=standardDraw(opponent);
  for(const i of oppChange)opponent[i]=draw();
  for(const i of change)result[i]=draw();
  const cmp=comparePokerHands(result,opponent);
  wins+=cmp>0?1:cmp===0?.5:0;
 }
 return wins/trials;
}
export function cpuPoker(hand,level,random){
 if(!Array.isArray(hand)||hand.length!==5||new Set(hand).size!==5||
  hand.some(c=>!Number.isInteger(c)||c<0||c>51))throw Error('CPUの手札が不正です。');
 if(level==='easy')return {cells:pick([[0,1,2],[1,3],[0,4],[],[2,3,4]],random)};
 if(level==='normal')return {cells:standardDraw(hand)};
 // Compare all 26 legal exchanges, including staying pat. Randomized unseen
 // decks are sampled independently but reproducibly for deterministic tests.
 let best=-Infinity,chosen=[];
 for(const change of masks){
  const score=showdownRate(hand,change,level==='strong'?112:36,random);
  // Small tie-break toward fewer discarded cards when win probabilities tie.
  const utility=score-change.length*.00025;
  if(utility>best){best=utility;chosen=change;}
 }
 return {cells:chosen};
}
