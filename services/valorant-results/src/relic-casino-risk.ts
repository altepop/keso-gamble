/** Server-owned risk for the two extreme transcendent relics.
 * No casino odds or RNG are modified. Open games freeze the risk at wager time. */
import type {RelicCollection} from './relics.ts';
export type CasinoRisk={multiplier:number;names:string[];bet?:number};
export const NEUTRAL_CASINO_RISK:CasinoRisk={multiplier:1,names:[]};
const RISK_PACTS=[
 {id:'normal.pact.eclipse',name:'日蝕の至高王',multiplier:1.5},
 {id:'normal.pact.frenzy',name:'賽の崩壊核',multiplier:2},
] as const;
export function casinoRiskProfile(collection?:RelicCollection):CasinoRisk{
 if(!collection?.equipped||!collection.items)return {...NEUTRAL_CASINO_RISK};
 let multiplier=1;const names:string[]=[];
 for(const pact of RISK_PACTS){
  const item=collection.items[pact.id];
  if(!collection.equipped.slice(0,4).includes(pact.id)||!item||item.origin!=='normal'||item.rarity!=='transcendent')continue;
  multiplier*=pact.multiplier;names.push(pact.name);
 }
 return {multiplier,names};
}
export function casinoNet(result:unknown):number|null{
 if(!result||typeof result!=='object')return null;
 const r=result as {done?:{net?:unknown}|null;net?:unknown;payout?:unknown;amount?:unknown};
 if(r.done===null)return null;
 const net=r.done&&Object.hasOwn(r.done,'net')?r.done.net:
  Object.hasOwn(r,'net')?r.net:
  Number.isSafeInteger(r.payout)&&Number.isSafeInteger(r.amount)?Number(r.payout)-Number(r.amount):null;
 return Number.isSafeInteger(net)?Number(net):null;
}
export function applyCasinoLossRisk(state:{cash:number},result:unknown,risk:CasinoRisk){
 const net=casinoNet(result);
 if(net===null||net>=0||risk.multiplier<=1)return null;
 const baseLoss=-net,requestedExtra=Math.floor(baseLoss*(risk.multiplier-1));
 // An old open round or another source's concurrent credit/debit may reduce available funds.
 // Never turn the verified wallet negative or fabricate debt on settlement.
 const extraLoss=Math.min(Math.max(0,state.cash),requestedExtra);
 if(!extraLoss)return null;
 state.cash-=extraLoss;
 const r=result as {done?:Record<string,unknown>|null;[key:string]:unknown};
 const record=r.done??r;
 const riskInfo={multiplier:risk.multiplier,baseLoss,extraLoss,totalLoss:baseLoss+extraLoss,names:risk.names};
 record.baseNet=net;record.net=net-extraLoss;record.relicRisk=riskInfo;
 r.relicPenalty=riskInfo;
 return riskInfo;
}
export function outstandingCasinoReserve(rounds:Record<string,CasinoRisk>):number{
 return Object.values(rounds).reduce((sum,r)=>{
  if(!r||typeof r.bet!=='number'||!Number.isSafeInteger(r.bet)||r.bet<0||![1,1.5,2,3].includes(r.multiplier))return sum;
  return sum+Math.ceil(r.bet*(r.multiplier-1));
 },0);
}
