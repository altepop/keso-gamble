// Independent deterministic SANMA calculation. Not a learned AI and not an EV,
// yaku, danger or placement solver. Comments explicitly limit claims to shape.
import {tileKind,sanmaKind,kindTile} from './mahjong-review-state.ts';
import type {ReviewDecision} from './mahjong-review-state.ts';
const ORPHANS=[0,8,9,17,18,26,27,28,29,30,31,32,33];
export function sanmaShanten(hand:string[],openMelds=0):number|null{
 if(!Array.isArray(hand)||!Number.isInteger(openMelds)||openMelds<0||openMelds>4||![13-3*openMelds,14-3*openMelds].includes(hand.length))return null;
 const counts=Array<number>(34).fill(0);
 for(const t of hand){const k=tileKind(t);if(!sanmaKind(k)||++counts[k]>4)return null;}
 let best=8;
 const memo=new Set<string>();
 const dfs=(m:number,t:number,p:number)=>{
  const i=counts.findIndex(c=>c>0);
  if(i<0){best=Math.min(best,8-2*(m+openMelds)-Math.min(t,4-m-openMelds)-p);return;}
  const key=counts.join('')+':'+m+':'+t+':'+p;if(memo.has(key))return;memo.add(key);
  const take=(is:number[],fn:()=>void)=>{is.forEach(k=>counts[k]--);fn();is.forEach(k=>counts[k]++);};
  if(m+openMelds<4){
   if(counts[i]>=3)take([i,i,i],()=>dfs(m+1,t,p));
   if(i>=9&&i<27&&i%9<=6&&counts[i+1]&&counts[i+2])take([i,i+1,i+2],()=>dfs(m+1,t,p));
  }
  if(counts[i]>=2){if(!p)take([i,i],()=>dfs(m,t,1));if(t<4)take([i,i],()=>dfs(m,t+1,p));}
  if(t<4&&i>=9&&i<27){
   if(i%9<8&&counts[i+1])take([i,i+1],()=>dfs(m,t+1,p));
   if(i%9<7&&counts[i+2])take([i,i+2],()=>dfs(m,t+1,p));
  }
  take([i],()=>dfs(m,t,p));
 };
 dfs(0,0,0);
 if(!openMelds){
  const pairs=counts.filter(c=>c>=2).length,unique=counts.filter(c=>c>0).length;
  best=Math.min(best,6-pairs+Math.max(0,7-unique),13-ORPHANS.filter(i=>counts[i]>0).length-(ORPHANS.some(i=>counts[i]>=2)?1:0));
 }
 return best;
}
export interface Efficiency {tile:string;shanten:number;ukeire:number;improving:string[];bonus:number}
export interface SanmaFinding {seat:number;round:number;turn:number;actual:string;recommended:string;basis:'shape';actualMetric:Efficiency;recommendedMetric:Efficiency}
export const SANMA_ENGINE='sanma-shape-v1';
export interface SanmaReport {version:1;source:'sanma-shape';model:typeof SANMA_ENGINE;uuid:string;findings:SanmaFinding[]}
const doraKind=(indicator:string)=>{const k=tileKind(indicator);return k===0?8:k===8?0:k>=27&&k<31?27+(k-27+1)%4:k>=31?31+(k-31+1)%3:Math.floor(k/9)*9+(k%9+1)%9;};
export function sanmaDiscardMetrics(d:ReviewDecision):Efficiency[]{
 if(d.players!==3||d.hand.length!==14||d.visible.length!==34||d.visible.some(n=>!Number.isSafeInteger(n)||n<0||n>4)||!d.hand.includes(d.actual)||sanmaShanten(d.hand)===null)return [];
 const own=Array<number>(34).fill(0);d.hand.forEach(t=>own[tileKind(t)]++);
 if(own.some((n,i)=>n+d.visible[i]>4))return [];
 const bonuses=d.doras.map(doraKind);
 return [...new Set(d.hand)].map(discard=>{
  const hand=d.hand.slice();hand.splice(hand.indexOf(discard),1);
  const shanten=sanmaShanten(hand)!;let ukeire=0;const improving:string[]=[];
  for(let k=0;k<34;k++){
   if(!sanmaKind(k)||own[k]>=4)continue;
   const left=4-own[k]-d.visible[k];if(left<=0)continue;
   const t=kindTile(k),next=sanmaShanten([...hand,t]);
   if(next!==null&&next<shanten){ukeire+=left;improving.push(t);}
  }
  const bonus=hand.reduce((sum,t)=>sum+(t.endsWith('r')?1:0)+bonuses.filter(k=>k===tileKind(t)).length,0);
  return {tile:discard,shanten,ukeire,improving,bonus};
 }).sort((a,b)=>a.shanten-b.shanten||b.ukeire-a.ukeire||b.bonus-a.bonus||a.tile.localeCompare(b.tile));
}
/** Early closed shape comparisons only: no threat, kita choice, tenpai,
 * final-round placement or value sacrifice. Replay supports more than this evaluator. */
export function sanmaShapeEligible(d:ReviewDecision,game:string):boolean{
 const finalWind=game==='3-tonpu'?0:1;
 if(d.players!==3||d.wind>finalWind||(d.wind===finalWind&&d.dealer===2)||d.turn>10||d.riichi.some(Boolean)||d.melds.some(m=>m.length>0)||d.hand.includes('N')||d.scores.some(s=>s<10000)||d.scores.some(s=>s>60000))return false;
 return true;
}
export function sanmaShapeFinding(d:ReviewDecision,game:string):SanmaFinding|null{
 if(!sanmaShapeEligible(d,game))return null;
 const metrics=sanmaDiscardMetrics(d),actual=metrics.find(m=>m.tile===d.actual),best=metrics[0];
 if(!actual||!best||best.shanten<1||best.bonus<actual.bonus)return null;
 const alternative=best.shanten<actual.shanten||best.shanten===actual.shanten&&best.ukeire>=actual.ukeire+8;
 const praise=best.tile===actual.tile&&metrics.filter(m=>m.shanten===best.shanten&&m.ukeire===best.ukeire&&m.bonus===best.bonus).length===1&&metrics.some(m=>m.shanten>best.shanten||m.ukeire+8<=best.ukeire);
 if(!alternative&&!praise)return null;
 return {seat:d.seat,round:d.round,turn:d.turn,actual:d.actual,recommended:best.tile,basis:'shape',actualMetric:actual,recommendedMetric:best};
}
