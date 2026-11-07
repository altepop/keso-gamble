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
// Bulls & Cows: expected remaining candidate count + expected finishing turns.
// Distinct 4-digit codes include leading zeros; a player's past guesses only reveal
// feedback about that player's opponent's secret, never about their own secret.
const feedbackCode=(a,b)=>numericFeedback(a,b);
function candidatePool(possible,random,max){
 if(possible.length<=max)return possible;
 const candidates=new Set(spaced(possible,Math.floor(max*.65)));
 // Mix evenly spaced positions with a seeded stride; fully deterministic.
 const offset=Math.floor(random()*possible.length);
 for(let k=0;k<possible.length&&candidates.size<max;k++)
  candidates.add(possible[(offset+k*37)%possible.length]);
 // For lengths sharing a factor with 37, finish with sequential fallback.
 for(let k=0;k<possible.length&&candidates.size<max;k++)
  candidates.add(possible[(offset+k)%possible.length]);
 return [...candidates];
}
export function cpuHitBlow(board,side,level,random){
 const history=JSON.parse(board).history??[];
 const mine=history.filter(h=>h.by===side);
 const used=new Set(mine.map(h=>h.guess));
 const possible=codes.filter(code=>mine.every(h=>feedbackCode(h.guess,code)===h.hit*5+h.blow));
 const remaining=possible.filter(code=>!used.has(code));
 if(!remaining.length)throw Error('数字の候補がありません。');
 if(remaining.length===1)return {guess:remaining[0]};
 if(level==='easy')return {guess:pick(remaining,random)};
 if(level==='normal'){
  // Intermediate strategy: sample candidate answers but never use non-answer probes.
  const candidates=candidatePool(remaining,random,6);
  const answers=spaced(remaining,Math.min(55,remaining.length));
  let best=candidates[0],score=Infinity;
  for(const guess of candidates){
   const counts=new Uint16Array(25);
   for(const answer of answers)counts[feedbackCode(guess,answer)]++;
   const cost=counts.reduce((acc,n)=>acc+n*n,0);
   if(cost<score){score=cost;best=guess;}
  }
  return {guess:best};
 }
 // With few candidates left, solve the finite information game exactly.
 // Unlike entropy alone, this minimizes the number of future guesses until
 // the actual answer is found, accounting for the value of solving right now.
 if(remaining.length<=10){
  const memo=new Map();
  function solve(set){
   if(set.length===1)return {value:1,guess:set[0]};
   const key=set.join(',');
   if(memo.has(key))return memo.get(key);
   let best=Infinity,chosen=set[0];
   for(const guess of set){
    const groups=new Map();
    for(const answer of set){
     const feedback=feedbackCode(guess,answer);
     if(feedback===20)continue;
     const group=groups.get(feedback)??[];group.push(answer);groups.set(feedback,group);
    }
    let expected=1;
    for(const group of groups.values())expected+=group.length/set.length*solve(group).value;
    if(expected<best-1e-8){best=expected;chosen=guess;}
   }
   const out={value:best,guess:chosen};memo.set(key,out);return out;
  }
  return {guess:solve(remaining).guess};
 }
 // First move is an information-rich and predictable anchor. It makes the
 // benchmark and mobile UI deterministic without disclosing any secret.
 if(mine.length===0&&!used.has('0123'))return {guess:'0123'};
 const answers=spaced(remaining,Math.min(1450,remaining.length));
 const candidates=candidatePool(remaining,random,Math.min(remaining.length<=320?remaining.length:110,remaining.length));
 // Experiments showed that speculative non-answer probes increased total
 // solving turns. The CPU now prioritizes guesses that can win this turn.
 let best=candidates[0],score=Infinity;
 for(const guess of candidates){
  const partitions=new Uint16Array(25);
  for(const answer of answers)partitions[feedbackCode(guess,answer)]++;
  // Expected candidates after next response (lower is better).
  // Questions that can win immediately are preferable to probes at equal
  // expected information gain, especially near the end of a game.
  // Minimize approximate expected remaining TURNS, not expected candidate
  // COUNT. Past tests showed count-only entropy often preferred a bad fork.
  // Skip the 4-hit bucket: the game ends on that answer immediately.
  let cost=0;
  const scaled=remaining.length/answers.length;
  for(let n=0;n<25;n++)if(n!==20&&partitions[n]){
   const bucket=partitions[n]*scaled;
   const futureTurns=bucket<=1?1:1+Math.log(bucket)/Math.log(6.2);
   cost+=partitions[n]*futureTurns;
  }
  cost/=answers.length;
  if(cost<score){score=cost;best=guess;}
 }
 return {guess:best};
}
const combinations=[1,5,10,10,5,1];
const tail=needed=>{
 if(needed<=0)return 1;
 if(needed>5)return 0;
 let p=0;
 for(let n=needed;n<=5;n++)p+=combinations[n]*(1/6)**n*(5/6)**(5-n);
 return p;
};
const justBid=({count,face})=>({choice:'bid',count,face});
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
 // Challenge records are public, not the current opponent's private dice.
 const bluffRate=(lies+2)/(history.length+5);
 if(bid){
  const p=prob(bid.count,bid.face);
  // Calling succeeds when the declared quantity is not actually present.
  // A 50% threshold maximizes immediate round win probability under an
  // uninformative prior, then updates gently from revealed historical bluffs.
  const threshold=level==='strong'?
   .50+Math.max(-.06,Math.min(.08,(bluffRate-.4)*.2)):.24;
  if(p<threshold)return {choice:'challenge'};
 }
 const options=[];
 for(let count=1;count<=10;count++)for(let face=1;face<=6;face++){
  if(!validBluffBid(bid,count,face))continue;
  const ownCount=hand.filter(x=>x===face).length;
  options.push({choice:'bid',count,face,p:prob(count,face),guaranteed:ownCount>=count,ownCount});
 }
 if(!options.length)return {choice:'challenge'};
 if(level==='normal'){
  const safe=options.filter(x=>x.p>=.36).sort((a,b)=>a.count-b.count||a.face-b.face);
  return safe.length?justBid(pick(safe.slice(0,Math.min(8,safe.length)),random)):bid?
    {choice:'challenge'}:justBid(options[0]);
 }
 // A bid already fully covered by the CPU's own dice cannot be wrong.
 // Opponents who see none of that face may challenge, gifting a round win.
 // Prefer meaningful, truthful pressure over repeated minimum one-die bids.
 const guaranteed=options.filter(x=>x.guaranteed);
 if(guaranteed.length){
  guaranteed.sort((a,b)=>b.count-a.count||b.ownCount-a.ownCount||b.face-a.face);
  return justBid(guaranteed[0]);
 }
 // When none of our bids is certain, do not chase enormous raises:
 // require a high posterior success probability or call the last bid.
 const safe=options.filter(x=>x.p>=.68);
 if(!safe.length)return bid?{choice:'challenge'}:justBid(options[0]);
 safe.sort((a,b)=>b.count-a.count||b.p-a.p||b.face-a.face);
 return justBid(safe[0]);
}
