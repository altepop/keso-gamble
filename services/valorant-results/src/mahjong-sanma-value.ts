// Conditional hand-value comparisons, not win probabilities or push/fold EV.
// The external calculator receives only the focal concealed hand/public facts.
import type {ReviewDecision} from './mahjong-review-state.ts';
import {tileKind,sanmaKind,kindTile} from './mahjong-review-state.ts';
import {sanmaShanten,sanmaDiscardMetrics} from './mahjong-sanma-efficiency.ts';
export interface ValueMetric {tile:string;live:number;min:number;max:number;hanMin:number;hanMax:number;fuMin:number;fuMax:number}
export interface SanmaValueFinding {seat:number;round:number;turn:number;actual:string;recommended:string;basis:'tsumo-value';riichi:boolean;doubleRiichi:boolean;menzen:boolean;actualValue:ValueMetric;recommendedValue:ValueMetric}
export interface ValueCandidate {tile:string;hand:string[];waits:Array<{tile:string;left:number}>}
export interface SanmaValueCase {candidates:ValueCandidate[];doras:string[];north:number;seatWind:number;roundWind:number;riichi:boolean;doubleRiichi:boolean;melds:Array<{kind:'pon'|'kan'|'ankan';tiles:string[]}>}
export function sanmaValueCase(d:ReviewDecision,game:string):SanmaValueCase|null{
 const finalWind=game==='3-tonpu'?0:1,ownMelds=d.melds[d.seat]??[];
 const menzen=ownMelds.every(m=>m.kind==='ankan');
 if(!/^3-(tonpu|hanchan)$/.test(game)||d.players!==3||d.turn<(d.declaringDoubleReach?1:2)||d.turn>16||d.declaringDoubleReach&&(!d.declaringReach||d.interrupted)||!d.publicRed||d.hand.includes('N')||d.riichi.some(Boolean)||ownMelds.some(m=>m.kind==='chi')||d.declaringReach&&!menzen||d.wind>finalWind||d.wind===finalWind&&d.dealer===2||d.scores.some(s=>s<10000||s>60000)||sanmaShanten(d.hand,ownMelds.length)===-1)return null;
 const metrics=sanmaDiscardMetrics(d),actual=metrics.find(m=>m.tile===d.actual);
 if(!actual||actual.shanten!==0)return null;
 const own=Array<number>(34).fill(0);d.hand.forEach(t=>own[tileKind(t)]++);
 const candidates:ValueCandidate[]=[];
 for(const m of metrics.filter(m=>m.shanten===0)){
  const hand=d.hand.slice();hand.splice(hand.indexOf(m.tile),1);const waits:ValueCandidate['waits']=[];
  for(let k=0;k<34;k++){
   const left=4-own[k]-d.visible[k];
   if(!sanmaKind(k)||left<=0||sanmaShanten([...hand,kindTile(k)],ownMelds.length)!==-1)continue;
   const red=k===13?'5pr':k===22?'5sr':null;
   const redLeft=red&&!d.hand.includes(red)&&!d.publicRed.includes(red)?1:0;
   if(redLeft>left)return null; // inconsistent public inventory
   if(left-redLeft>0)waits.push({tile:kindTile(k),left:left-redLeft});
   if(redLeft)waits.push({tile:red!,left:1});
  }
  if(waits.length)candidates.push({tile:m.tile,hand,waits});
 }
 if(candidates.length<2||!candidates.some(c=>c.tile===d.actual))return null;
 return {candidates,doras:d.doras.slice(),north:d.north[d.seat],seatWind:(d.seat-d.dealer+3)%3,roundWind:d.wind,riichi:Boolean(d.declaringReach),doubleRiichi:Boolean(d.declaringDoubleReach),melds:ownMelds.map(m=>({kind:m.kind as 'pon'|'kan'|'ankan',tiles:m.tiles.slice()}))};
}
/** Pareto-only: no fewer unseen winning tiles AND a strictly better worst
 * conditional tsumo value than the other's best. Does not assume future riichi. */
export function sanmaValueFinding(d:ReviewDecision,metrics:ValueMetric[]):SanmaValueFinding|null{
 const int=(v:unknown,a:number,b:number)=>Number.isSafeInteger(v)&&Number(v)>=a&&Number(v)<=b;
 if(!Array.isArray(metrics)||metrics.length<2||metrics.length>14||new Set(metrics.map(m=>m.tile)).size!==metrics.length||metrics.some(m=>!d.hand.includes(m.tile)||!int(m.live,1,108)||!int(m.min,500,96000)||!int(m.max,m.min,96000)||!int(m.hanMin,1,12)||!int(m.hanMax,m.hanMin,12)||!int(m.fuMin,20,160)||!int(m.fuMax,m.fuMin,160)))return null;
 const actual=metrics.find(m=>m.tile===d.actual);if(!actual)return null;
 const dominates=(a:ValueMetric,b:ValueMetric)=>a.live>=b.live&&a.min>=b.max+1000;
 const best=metrics.filter(m=>dominates(m,actual)).sort((a,b)=>b.min-a.min||b.live-a.live)[0];
 const praise=!best&&!metrics.some(m=>dominates(m,actual))&&metrics.some(m=>dominates(actual,m));
 if(!best&&!praise)return null;
 return {seat:d.seat,round:d.round,turn:d.turn,actual:d.actual,recommended:best?.tile??d.actual,basis:'tsumo-value',riichi:Boolean(d.declaringReach),doubleRiichi:Boolean(d.declaringDoubleReach),menzen:(d.melds[d.seat]??[]).every(m=>m.kind==='ankan'),actualValue:actual,recommendedValue:best??actual};
}
