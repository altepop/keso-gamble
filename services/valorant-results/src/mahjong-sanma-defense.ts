// Factual, narrow defensive alternative. No guessed danger percentages or
// claims that an unseen tile will deal in. Genbutsu is specific to one reacher.
import {tileKind} from './mahjong-review-state.ts';
import type {ReviewDecision} from './mahjong-review-state.ts';
import type {Efficiency} from './mahjong-sanma-efficiency.ts';
import {sanmaShanten,sanmaDiscardMetrics} from './mahjong-sanma-efficiency.ts';
export interface SanmaDefenseFinding {river?:{tiles:string[];held:string[];dealer:boolean};seat:number;round:number;turn:number;actual:string;recommended:string;basis:'genbutsu';against:number;againstRiichi:true;recommendedOnRiver:true;actualOnRiver:boolean;shanten:number}
export interface SanmaPushFoldFinding extends Omit<SanmaDefenseFinding,'basis'> {basis:'push-fold-choice';actualMetric:Efficiency;recommendedMetric:Efficiency}
function defenseCandidate(d:ReviewDecision,game:string,near:boolean):SanmaDefenseFinding|SanmaPushFoldFinding|null{
 const finalWind=game==='3-tonpu'?0:1,open=d.melds[d.seat]?.length??0;
 if(d.declaringReach||d.players!==3||d.hand.length!==14-3*open||!d.hand.includes(d.actual)||d.hand.includes('N')||d.riichi[d.seat]||d.turn<6||d.turn>24||d.wind>finalWind||d.wind===finalWind&&d.dealer===2||d.scores.some(s=>s<10000||s>60000))return null;
 const opponents=d.riichi.flatMap((r,s)=>r&&s!==d.seat?[s]:[]);if(opponents.length!==1)return null;
 const against=opponents[0],river=new Set(d.rivers[against].map(tileKind));
 if(!d.hand.some(t=>river.has(tileKind(t))))return null;
 const shanten=sanmaShanten(d.hand,open);if(shanten===null||(near?shanten<1||shanten>2:shanten<3))return null;
 const metrics=sanmaDiscardMetrics(d),safe=metrics.filter(m=>river.has(tileKind(m.tile)));
 if(!safe.length)return null;
 // A routine genbutsu discard does not need a congratulatory review.
 const actualOnRiver=river.has(tileKind(d.actual));if(actualOnRiver)return null;
 const recommended=safe[0].tile;
 const base:SanmaDefenseFinding={seat:d.seat,round:d.round,turn:d.turn,actual:d.actual,recommended,basis:'genbutsu',river:{tiles:d.rivers[against].slice(),held:[...new Set(safe.map(m=>m.tile))],dealer:d.dealer===against},against,againstRiichi:true,recommendedOnRiver:true,actualOnRiver,shanten};
 if(!near)return base;
 const actualMetric=metrics.find(m=>m.tile===d.actual),recommendedMetric=metrics.find(m=>m.tile===recommended);
 return actualMetric&&recommendedMetric?{...base,basis:'push-fold-choice',actualMetric,recommendedMetric}:null;
}
export function sanmaDefenseFinding(d:ReviewDecision,game:string):SanmaDefenseFinding|null{const f=defenseCandidate(d,game,false);return f?.basis==='genbutsu'?f:null;}
export function sanmaPushFoldFinding(d:ReviewDecision,game:string):SanmaPushFoldFinding|null{const f=defenseCandidate(d,game,true);return f?.basis==='push-fold-choice'?f:null;}
