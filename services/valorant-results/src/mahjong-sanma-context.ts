// Public-at-the-time context only. No future outcome or opponent hand.
import type {ValueMetric} from './mahjong-sanma-value.ts';
export interface Payment {main:number;additional:number}
export interface PlacementFinding {
 seat:number;round:number;turn:number;actual:string;recommended:string;basis:'placement';
 scores:number[];dealer:number;actualValue:ValueMetric;recommendedValue:ValueMetric;
}
const integer=(x:unknown,lo:number,hi:number)=>Number.isSafeInteger(x)&&Number(x)>=lo&&Number(x)<=hi;
export function validPayments(m:ValueMetric):boolean{
 const ps=m?.payments;
 return Array.isArray(ps)&&ps.length>0&&ps.length<=29&&ps.every(p=>p&&integer(p.main,100,64000)&&integer(p.additional,100,32000)&&p.main%100===0&&p.additional%100===0&&p.main>=p.additional)&&
  Math.min(...ps.map(p=>p.main+p.additional))===m.min&&Math.max(...ps.map(p=>p.main+p.additional))===m.max;
}
/** Instantaneous score rank after each conditional tsumo. Ties abstain rather
 * than assuming initial-seat tie order. No claim that the game then ends. */
export function tsumoRanks(scores:number[],seat:number,dealer:number,m:ValueMetric):number[]|null{
 if(scores.length!==3||scores.some(s=>!integer(s,0,100000))||!integer(seat,0,2)||!integer(dealer,0,2)||!validPayments(m))return null;
 if(seat===dealer&&m.payments!.some(p=>p.main!==p.additional))return null;
 const ranks=m.payments!.map(p=>{
  const after=scores.map((s,i)=>i===seat?s+p.main+p.additional:s-(seat===dealer?p.main:i===dealer?p.main:p.additional));
  if(after.some((s,i)=>i!==seat&&s===after[seat]))return 0;
  return 1+after.filter(s=>s>after[seat]).length;
 });
 return ranks.includes(0)?null:ranks;
}
export function placementImproves(f:PlacementFinding):boolean{
 const a=tsumoRanks(f.scores,f.seat,f.dealer,f.actualValue),b=tsumoRanks(f.scores,f.seat,f.dealer,f.recommendedValue);
 return Boolean(a&&b&&Math.min(...a)>Math.max(...b));
}
/** Suji describes only the two-sided-wait relationship to this river. */
export function riverSuji(tile:string,river:string[]):boolean|null{
 const m=/^([1-9])([ps])r?$/.exec(tile);if(!m)return null;
 const n=Number(m[1]),has=(v:number)=>river.some(t=>t.replace(/r$/,'')===v+m[2]);
 return n<=3?has(n+3):n>=7?has(n-3):has(n-3)&&has(n+3);
}
