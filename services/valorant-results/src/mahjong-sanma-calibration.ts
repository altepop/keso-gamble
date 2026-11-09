// OFFLINE calibration over completed games only. Never imported by a decision
// evaluator: future wins/hands/ura must not enter historical recommendations.
import type {PaipuAction,PaipuHead} from './mahjong-summary.ts';
import {sanmaPoints} from './mahjong-sanma-points.ts';
import {supportsReviewRules} from './mahjong-review-rules.ts';
export function calibrateSanmaPayments(head:PaipuHead,actions:PaipuAction[]){
 const rules=head.config?.mode?.detail_rule??{};
 const keys=['changbang_value','liqibang_value','have_zimosun','have_qieshangmanguan','dora_count','shiduan'];
 const ruleSettings=Object.fromEntries(keys.filter(k=>typeof rules[k]==='number'||typeof rules[k]==='boolean').map(k=>[k,rules[k]]));
 const out={ruleSettings,supported:supportsReviewRules(head),singleWins:0,multipleWinRounds:0,compared:0,skipped:0,basePaymentsMatched:0,unexplainedPayments:0,honbaSamples:0,consistentRonHonba:[200,300,1000],tsumoLossSamples:0,tsumoLossMatched:0};
 if(head.result?.players?.length!==3||!out.supported)return out;
 let dealer=-1,honba=-1;
 for(const {name,data:d} of actions){
  if(name==='RecordNewRound'){dealer=d?.ju;honba=d?.ben;continue;}
  if(name!=='RecordHule')continue;
  if(d?.hules?.length!==1){if(d?.hules?.length>1)out.multipleWinRounds++;continue;}
  out.singleWins++;const h=d.hules[0],han=(h.fans??[]).reduce((n:number,f:{val?:number})=>n+(f.val??0),0);
  // Multiple winners and responsibility payments need a separate treatment.
  if(h.yiman||h.baopai_seats?.length||!Number.isInteger(dealer)||dealer<0||dealer>2||!Number.isInteger(h.seat)||h.seat<0||h.seat>2||typeof h.zimo!=='boolean'||!Number.isInteger(honba)||honba<0||honba>100||!Array.isArray(d.delta_scores)||d.delta_scores.length!==3||d.delta_scores.some((x:unknown)=>!Number.isSafeInteger(x))){out.skipped++;continue;}
  const base={han,fu:h.fu,yakuman:0,dealer:h.seat===dealer,tsumo:Boolean(h.zimo),honba:0,sticks:0,kiriage:rules.have_qieshangmanguan===true,ronPerHonba:0,tsumoPerHonba:0};
  const p=sanmaPoints(base);if(!p){out.skipped++;continue;}out.compared++;
  const paid=d.delta_scores.reduce((n:number,x:number)=>n+Math.max(0,-x),0);
  if(h.zimo){
   out.tsumoLossSamples++;const total=p.paid+honba*200;
   if(paid===total)out.tsumoLossMatched++;else out.unexplainedPayments++;
   if((base.dealer?h.point_zimo_xian===p.main:h.point_zimo_qin===p.main&&h.point_zimo_xian===p.additional))out.basePaymentsMatched++;
  }else{
   if(h.point_rong===p.main)out.basePaymentsMatched++;
   const candidates=[200,300,1000].filter(rate=>paid===p.paid+honba*rate);
   if(!candidates.length)out.unexplainedPayments++;
   if(honba>0){out.honbaSamples++;out.consistentRonHonba=out.consistentRonHonba.filter(n=>candidates.includes(n));}
  }
 }
 return out;
}
