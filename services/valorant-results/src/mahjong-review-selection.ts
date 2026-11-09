// Keep a genuine finding for every represented seat before spending spare
// slots on another turn. Never invent an error from rank, identity or randomness.
interface Finding {seat:number;round:number;turn:number;actual:string;recommended:string}
export function selectReviewFindings<T extends Finding>(findings:T[],players:3|4,limit=4):T[]{
 if(![3,4].includes(players)||!Number.isInteger(limit)||limit<players||limit>4)return [];
 const seen=new Set<string>(),all=findings.filter(f=>{
  if(!f||!Number.isInteger(f.seat)||f.seat<0||f.seat>=players)return false;
  const key=[f.seat,f.round,f.turn].join(':');if(seen.has(key))return false;seen.add(key);return true;
 });
 const different=(f:T)=>f.actual!==f.recommended;
 const chosen:T[]=[];
 for(let seat=0;seat<players;seat++){
  const rows=all.filter(f=>f.seat===seat),first=rows.find(different)??rows[0];if(first)chosen.push(first);
 }
 // Spare slots preserve an honest positive note or alternative when possible.
 while(chosen.length<limit){
  const remaining=all.filter(f=>!chosen.includes(f));if(!remaining.length)break;
  const next=chosen.every(different)?remaining.find(f=>!different(f)):chosen.every(f=>!different(f))?remaining.find(different):undefined;
  chosen.push(next??remaining[0]);
 }
 // At a full four-seat budget, replace one seat's own finding with its other
 // valid kind; no other seat is pushed out of the envelope.
 if(chosen.length===limit&&chosen.length>1){
  const needPraise=chosen.every(different),needAlternative=chosen.every(f=>!different(f));
  if(needPraise||needAlternative){
   const replacement=all.find(f=>needPraise?!different(f):different(f));
   if(replacement){const i=chosen.findIndex(f=>f.seat===replacement.seat);if(i>=0)chosen[i]=replacement;}
  }
 }
 return chosen;
}
