// Deduction and public-history strategy for hidden-information duel modes.
// No access to the opponent's secret code, hand, deck or dice.
import {hitBlowAnswer,validBluffBid} from '../js/duel-mini-games.js';
const pick=(arr,random)=>arr[Math.floor(Math.min(0.999999,Math.max(0,random()))*arr.length)];
const codes=(()=>{
 const all=[];
 for(let a=0;a<10;a++)for(let b=0;b<10;b++)for(let c=0;c<10;c++)for(let d=0;d<10;d++){
  if(a!==b&&a!==c&&a!==d&&b!==c&&b!==d&&c!==d)all.push(''+a+b+c+d);
 }
 return all;
})();
const numericFeedback=(guess,answer)=>{
 let h=0,b=0;
 for(let i=0;i<4;i++){
  if(guess[i]===answer[i])h++;
  else if(answer.includes(guess[i]))b++;
 }
 return h*5+b;
};
// Stratified sampling avoids duplicate draws with deterministic RNG, and limits CPU time.
const spaced=(arr,limit)=>{
 if(arr.length<=limit)return arr;
 const result=[];
 for(let i=0;i<limit;i++)result.push(arr[Math.floor((i+.5)*arr.length/limit)]);
 return result;
};
export function cpuHitBlow(board,side,level,random){
 const history=JSON.parse(board).history??[];
 const mine=history.filter(h=>h.by===side);
 // Players guess DIFFERENT secret codes; an opponent's guess is never used by this CPU.
 const used=new Set(mine.map(h=>h.guess));
 const possible=codes.filter(code=>mine.every(h=>numericFeedback(h.guess,code)===h.hit*5+h.blow));
 const remaining=possible.filter(code=>!used.has(code));
 if(!remaining.length)throw Error('数字の候補がありません。');
 if(level==='easy')return {guess:pick(remaining,random)};
 const sampleAnswers=spaced(remaining,level==='strong'?480:100);
 const candidates=spaced(remaining,level==='strong'?64:15);
 let choice=candidates[0],best=Infinity;
 for(const guess of candidates){
  const partitions=new Uint16Array(25);
  for(const answer of sampleAnswers)partitions[numericFeedback(guess,answer)]++;
  // Minimize expected remaining candidates; ties prefer a candidate that can win now.
  let expected=0;
  for(const size of partitions)expected+=size*size;
  if(expected<best){best=expected;choice=guess;}
 }
 return {guess:choice};
}
const combinations=[1,5,10,10,5,1];
const tail=needed=>{
 if(needed<=0)return 1;
 if(needed>5)return 0;
 let p=0;
 for(let n=needed;n<=5;n++)p+=combinations[n]*(1/6)**n*(5/6)**(5-n);
 return p;
};
export function cpuBluffDice(board,hand,side,level,random){
 if(!Array.isArray(hand)||hand.length!==5||hand.some(x=>!Number.isInteger(x)||x<1||x>6))
  throw Error('CPUのダイスが不正です。');
 const state=JSON.parse(board),bid=state.bid;
 const prob=(count,face)=>tail(count-hand.filter(x=>x===face).length);
 if(level==='easy'){
  if(bid&&random()<.54)return {choice:'challenge'};
  const legal=[];
  for(let count=1;count<=10;count++)for(let face=1;face<=6;face++)
   if(validBluffBid(bid,count,face))legal.push({choice:'bid',count,face});
  return legal.length?pick(legal,random):{choice:'challenge'};
 }
 const history=(state.history??[]).filter(round=>round.bid?.by!==side&&round.bid&&Number.isFinite(round.actual));
 const lies=history.filter(round=>round.actual<round.bid.count).length;
 // Condition on past publicly revealed challenges. Bayesian shrinkage protects
 // against tiny samples, and never exposes current hidden dice.
 const bluffRate=(lies+2)/(history.length+5);
 if(bid){
  const p=prob(bid.count,bid.face);
  const threshold=level==='strong'?.40+Math.min(.12,Math.max(-.08,(bluffRate-.4)*.25)):.24;
  if(p<threshold)return {choice:'challenge'};
 }
 const options=[];
 for(let count=1;count<=10;count++)for(let face=1;face<=6;face++){
  if(!validBluffBid(bid,count,face))continue;
  const p=prob(count,face);
  options.push({choice:'bid',count,face,p});
 }
 if(!options.length)return {choice:'challenge'};
 // Strong prioritizes credible declarations while mixing a few bluff moves
 // against opponents who challenge rarely; normal favors a larger random pool.
 const minimum=level==='strong'?.60:.36;
 const safe=options.filter(x=>x.p>=minimum);
 if(!safe.length)return bid?{choice:'challenge'}:options[0];
 safe.sort((a,b)=>a.count-b.count||a.face-b.face);
 if(level==='normal')return pick(safe.slice(0,Math.min(8,safe.length)),random);
 const narrow=safe.slice(0,Math.min(4,safe.length));
 if(bid&&bluffRate<.25&&random()<.12){
  const bluff=options.filter(x=>x.count<=bid.count+1&&x.p>=.3).slice(0,4);
  if(bluff.length)return pick(bluff,random);
 }
 return pick(narrow,random);
}
