// Deterministic editorial sampling, not a recommendation or skill score.
// Keep the expensive shape/defense/value budgets per seat unchanged.
export function sampleSanmaDecisions<T extends {seat:number;round:number;turn:number}>(rows:T[],perSeat:number):T[]{
 if(!Number.isInteger(perSeat)||perSeat<1||perSeat>6)return [];
 const spread=(n:number,k:number)=>Array.from({length:k},(_,i)=>k===1?Math.floor((n-1)/2):Math.floor(i*(n-1)/(k-1)));
 const result:T[]=[];
 for(const seat of [0,1,2]){
  const own=rows.filter(d=>d.seat===seat),groups=[...new Set(own.map(d=>d.round))].map(r=>own.filter(d=>d.round===r));
  if(own.length<=perSeat){result.push(...own);continue;}
  const selected=groups.length<=perSeat?groups:spread(groups.length,perSeat).map(i=>groups[i]);
  const counts=selected.map(()=>1);let left=perSeat-counts.length;
  while(left){let progress=false;for(let i=0;i<selected.length&&left;i++)if(counts[i]<selected[i].length){counts[i]++;left--;progress=true;}if(!progress)break;}
  selected.forEach((g,i)=>result.push(...spread(g.length,counts[i]).map(j=>g[j])));
 }
 return result.sort((a,b)=>a.round-b.round||a.turn-b.turn||a.seat-b.seat);
}
