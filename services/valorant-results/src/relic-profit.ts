/** Only verified positive net winnings may unlock uncapped KESO relic effects.
 * This is pure and never reads wallet or accepts user-submitted outcomes. */
export function verifiedCasinoProfit(result:unknown):number{
 if(!result||typeof result!=='object')return 0;
 const r=result as {net?:unknown;done?:{net?:unknown};payout?:unknown;amount?:unknown};
 const net=Number.isSafeInteger(r.done?.net)?Number(r.done!.net):
  Number.isSafeInteger(r.net)?Number(r.net):
  Number.isSafeInteger(r.payout)&&Number.isSafeInteger(r.amount)?Number(r.payout)-Number(r.amount):0;
 return Number.isSafeInteger(net)?Math.max(0,net):0;
}
export function verifiedBetProfit(settled:readonly {payout:number;amount:number}[]):number{
 if(!Array.isArray(settled))return 0;
 let net=0;
 for(const b of settled){
  if(!Number.isSafeInteger(b.payout)||!Number.isSafeInteger(b.amount)||b.amount<0||b.payout<0)return 0;
  net+=b.payout-b.amount;
  if(!Number.isSafeInteger(net))return 0;
 }
 return Math.max(0,net);
}
/** In an optimistic stock sale, source lots are inspected BEFORE the sell trigger.
 * A missing/unmatched lot or a no-profit round trip must never give free KP. */
export function verifiedStockProfit(sale:number,cost:number,filled:number,quantity:number):number{
 if(![sale,cost,filled,quantity].every(Number.isFinite)||!Number.isSafeInteger(quantity)||quantity<=0||filled!==quantity||
  sale<=0||cost<=0)return 0;
 const profit=Math.floor(sale-Math.ceil(cost*1.01));
 return Number.isSafeInteger(profit)?Math.max(0,profit):0;
}
