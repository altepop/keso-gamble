import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared browser quote arithmetic.
import {stockOrderQuote,STOCK_PRICE_SCALE} from '../../../js/stock-order.js';
import {verifiedStockProfit,verifiedBetProfit,verifiedBetStake} from '../src/relic-profit.ts';
import {nativeRelicBonus,nativeRelicAllowance,evaluateRelicBonus,type RelicCollection,type RelicItem} from '../src/relics.ts';

function strong(){
 const relics:RelicCollection={totalSummons:0,items:{},equipped:[]};
 for(const [id,name,skill,percent] of [['normal.pact.coinflip','双面の魔導銀貨','even',220],['normal.pact.chain','暴走する鎖の心臓','spark',260]] as const){
  relics.items[id]={id,name,origin:'normal',rarity:'legendary',power:130,ability:'test',count:1,mode:'universal',skill,percent,cap:0} as RelicItem;
  relics.equipped.push(id);
 }
 return {cash:0,relics};
}
const now=Date.UTC(2026,10,5,3);

test('pushing a price up with your own buys and selling an older lot no longer pays more than the fees it costs',()=>{
 // Hold 100 old shares bought at 1,000. Buy 2,000 to push the price, sell the old lot first (FIFO), then the rest.
 let p=1000*STOCK_PRICE_SCALE;
 const buy=stockOrderQuote({priceUnits:p,initialPrice:1000,side:'buy',quantity:2000});p=buy.afterUnits;
 const sellOld=stockOrderQuote({priceUnits:p,initialPrice:1000,side:'sell',quantity:100});p=sellOld.afterUnits;
 const sellNew=stockOrderQuote({priceUnits:p,initialPrice:1000,side:'sell',quantity:2000});
 const plain=stockOrderQuote({priceUnits:1000*STOCK_PRICE_SCALE,initialPrice:1000,side:'sell',quantity:100});
 const extraCash=(sellOld.total+sellNew.total-buy.total)-plain.total;
 const counted=verifiedStockProfit(sellOld.total,100*1000,100,100);
 assert.ok(counted>150000,'the self-made move is counted as a large "profit"');
 assert.ok(extraCash<-50000,'but the round trip really costs fees');
 const state=strong();
 const bonus=nativeRelicBonus(state,'market',counted,now,sellOld.gross);
 assert.equal(bonus,250);
 assert.ok(bonus+extraCash<0,'the loop loses KP even with the strongest relics');
});

// Buy one block, then sell it in chunks: the first chunks sell above the block's AVERAGE cost (the price is
// still high), so they count as profit; the losses on later chunks are never counted. No older lot is needed.
function washCycle(init:number,m:number,k:number,capped:boolean){
 let p=init*STOCK_PRICE_SCALE,cash=0,bonus=0;const state=strong();
 const b=stockOrderQuote({priceUnits:p,initialPrice:init,side:'buy',quantity:m});p=b.afterUnits;cash-=b.total;
 const unit=b.gross/m;
 for(let left=m;left>0;){
  const n=Math.min(k,left),s=stockOrderQuote({priceUnits:p,initialPrice:init,side:'sell',quantity:n});p=s.afterUnits;cash+=s.total;left-=n;
  const profit=verifiedStockProfit(s.total,n*unit,n,n);
  if(profit>0)bonus+=capped?nativeRelicBonus(state,'market',profit,now,s.gross):evaluateRelicBonus(state.relics,'market',{amount:profit,win:true}).bonus;
 }
 return cash+bonus;
}
test('buy a block and sell it back in chunks: profitable with uncapped relics, never with the cap (双面の魔導銀貨+鎖の心臓)',()=>{
 let uncapped=-Infinity,capped=-Infinity;
 for(const init of [100,500,1000,3000])for(const m of [50,100,200,500,1000,2000,5000])for(const k of [1,5,10,50,100,500]){
  if(k>m)continue;
  uncapped=Math.max(uncapped,washCycle(init,m,k,false));
  capped=Math.max(capped,washCycle(init,m,k,true));
 }
 assert.ok(uncapped>1_000_000,'before the fix this loop made KP');
 assert.ok(capped<0,'with the cap every buy-and-sell cycle loses KP');
});

test('racing and M.League: bonus follows the settlement stakes, covering every outcome pays nothing',()=>{
 const covered=[{amount:1000,payout:0},{amount:1000,payout:0},{amount:1000,payout:2700}];
 assert.equal(verifiedBetProfit(covered),0);
 assert.equal(nativeRelicBonus(strong(),'racing',verifiedBetProfit(covered),now,verifiedBetStake(covered)),0);
 const win=[{amount:2000,payout:9000}];
 const state=strong();
 assert.equal(nativeRelicBonus(state,'racing',verifiedBetProfit(win),now,verifiedBetStake(win)),10);
 assert.equal(nativeRelicBonus(state,'mleague',7000,now,100000),250);
 assert.equal(nativeRelicBonus(state,'mleague',7000,now,100000),250);
 assert.equal(nativeRelicBonus(state,'mleague',7000,now,100000),0,'daily 500 per mode');
 assert.equal(state.relics.dailyNativeRelic?.racing?.amount,10,'racing and M.League keep separate allowances');
 assert.equal(verifiedBetStake([{amount:100},{amount:-1}]),0,'an invalid stake pays nothing');
 assert.equal(nativeRelicAllowance(0,0),0);
 assert.equal(nativeRelicAllowance(Number.NaN,0),0);
});
