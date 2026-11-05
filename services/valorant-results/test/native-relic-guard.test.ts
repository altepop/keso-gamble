import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared browser quote arithmetic.
import {stockOrderQuote,STOCK_PRICE_SCALE} from '../../../js/stock-order.js';
import {verifiedStockProfit,verifiedBetProfit,verifiedBetStake,verifiedBetLoss,verifiedStockLoss,verifiedCasinoNet,verifiedCasinoLossStake} from '../src/relic-profit.ts';
import {relicGamble,RELIC_RECEIPT_CAP,nativeRelicBonus,nativeRelicLoss,snapshotLoadout,rememberLoadout,RELIC_LOSS_MEMORY_MS,nativeRelicAllowance,evaluateRelicBonus,creditVerifiedRelicBonus,type RelicCollection,type RelicItem} from '../src/relics.ts';

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

test('losses: the relic multiplier is taken away under the same caps, never below zero (owner decision)',()=>{
 const state=strong();state.cash=10000;
 // Roulette: 35 numbers x 100 KP lost.
 const lost={amount:3500,payout:0};
 assert.equal(verifiedCasinoNet(lost),-3500);
 assert.equal(verifiedCasinoLossStake(lost),3500);
 assert.equal(nativeRelicLoss(state,'casino',3500,now,verifiedCasinoLossStake(lost)),18);
 assert.equal(state.cash,9982);
 assert.equal(verifiedCasinoLossStake({amount:100,payout:200}),0,'a win is not a loss');
 // Stocks, racing, M.League: 250 per settlement, 500 per day per mode, separate from the bonus allowance.
 assert.equal(verifiedStockLoss(90000,100000,10,10),11000);
 assert.equal(verifiedStockLoss(200000,100000,10,10),0);
 assert.equal(nativeRelicLoss(state,'market',11000,now,90000),250);
 assert.equal(nativeRelicLoss(state,'market',11000,now,90000),250);
 assert.equal(nativeRelicLoss(state,'market',11000,now,90000),0);
 assert.equal(verifiedBetLoss([{amount:1000,payout:0},{amount:500,payout:900}]),600);
 assert.equal(verifiedBetLoss([{amount:1000,payout:3000}]),0);
 assert.equal(nativeRelicLoss(state,'racing',600,now,1500),8);
 // The bonus allowance for the day is untouched by losses.
 assert.equal(nativeRelicBonus(state,'market',5000,now,100000),250);
 // Never below zero.
 const poor=strong();poor.cash=5;
 assert.equal(nativeRelicLoss(poor,'mleague',100000,now,100000),5);
 assert.equal(poor.cash,0);
 // No relics equipped: nothing happens.
 const plain={cash:1000,relics:{totalSummons:0,items:{},equipped:[]} as RelicCollection};
 assert.equal(nativeRelicLoss(plain,'casino',3500,now,3500),0);
});

test('Spike Rush: relics apply to the base (40/20) only, not to the growth correction (owner decision)',async()=>{
 const relics=strong().relics;
 const ledger:unknown[][]=[];
 const prepare=(text:string)=>({bind:(...values:unknown[])=>({
  first:async()=>text.includes('FROM kp_state')?{data:JSON.stringify({relics})}:text.includes('spike_rewards')?{gamesBefore:30,base:40}:
   text.startsWith('SELECT delta FROM kp_ledger')?{delta:ledger[0]?.[3]}:null,
  run:async()=>{if(text.startsWith('INSERT OR IGNORE INTO kp_ledger'))ledger.push(values);return {meta:{changes:1}};},
 })});
 const env={DB:{prepare}} as never;
 const credited=await creditVerifiedRelicBonus(env,'g','u','match:g:m1:p','spikerush',720,true,now);
 const onBase=evaluateRelicBonus(relics,'spikerush',{amount:40,win:true,spikeGamesBefore:30}).bonus;
 const onAll=evaluateRelicBonus(relics,'spikerush',{amount:720,win:true,spikeGamesBefore:30}).bonus;
 assert.ok(onAll>onBase*5,'the growth correction no longer multiplies the relic bonus');
 // The strong build resolves on the 40 KP base: full bonus by chance, nothing, or a 20 KP recoil.
 assert.ok([onBase,0,-20].includes(credited),String(credited));
 assert.equal(ledger[0]?.[3],credited);
});

test('taking relics off right before a losing sale does not dodge the penalty for 24 hours',()=>{
 const state=strong();state.cash=100000;
 // The player removes every relic just before selling at a loss.
 const before=snapshotLoadout(state.relics);
 state.relics.equipped=[];
 rememberLoadout(state.relics,before,now);
 assert.equal(state.relics.recentLoadouts?.length,1);
 assert.equal(nativeRelicLoss(state,'market',11000,now+60000,90000),250,'the removed loadout still counts');
 // The bonus side uses only what is equipped now.
 assert.equal(nativeRelicBonus(state,'market',11000,now+60000,90000),0);
 // A day later the removed loadout no longer counts and is pruned on the next change check.
 const later=now+RELIC_LOSS_MEMORY_MS+1;
 assert.equal(nativeRelicLoss(state,'market',11000,later,90000),0);
 rememberLoadout(state.relics,[],later);
 assert.equal(state.relics.recentLoadouts?.length,0);
 // Swapping in a weaker set: the stronger removed set is used for losses.
 const swap=strong();swap.cash=100000;
 const strongSet=snapshotLoadout(swap.relics);
 swap.relics.equipped=[swap.relics.equipped[0]!];
 rememberLoadout(swap.relics,strongSet,now);
 const weakOnly=evaluateRelicBonus(swap.relics,'casino',{amount:3500,win:true}).bonus;
 const strongAll=evaluateRelicBonus({...swap.relics,equipped:strongSet.map(x=>x.id)},'casino',{amount:3500,win:true}).bonus;
 assert.ok(strongAll>=weakOnly);
 assert.equal(nativeRelicLoss(swap,'casino',3500,now,3500),Math.min(18,strongAll));
 // No change, nothing remembered.
 const same=strong();rememberLoadout(same.relics,snapshotLoadout(same.relics),now);
 assert.equal(same.relics.recentLoadouts,undefined);
});

test('verified receipts: strong builds keep their full bonus by chance, with recoil, averaging +50% of the base',()=>{
 // A modest build (<= +50%) is unchanged and certain.
 assert.deepEqual(relicGamble(150,400,0.99,0.99),{payout:150,kind:'steady',chance:1,full:150});
 // Spike Rush example: base 400, a stacked build worth +4,000.
 const hit=relicGamble(4000,400,0,0.99);
 assert.equal(hit.kind,'hit');assert.equal(hit.payout,4000);
 assert.ok(Math.abs(hit.chance-240/4040)<1e-9);
 assert.deepEqual(relicGamble(4000,400,0.99,0.1),{payout:-200,kind:'recoil',chance:hit.chance,full:4000});
 assert.equal(relicGamble(4000,400,0.99,0.5).kind,'miss');
 // The exact average is +50% of the base for any strength.
 for(const [bonus,base] of [[4000,400],[900,400],[50000,300000],[2646,40],[100000,900]] as const){
  const g=relicGamble(bonus,base,0,0.99),full=g.full,recoil=Math.floor(base*.5);
  const ev=g.chance*full-(1-g.chance)*0.2*recoil;
  assert.ok(full<=Math.floor(base*.5)?g.payout===full:Math.abs(ev-Math.floor(base*.5))<1e-6,`${bonus}/${base}`);
 }
 // One receipt never pays more than 10,000 KP of relic bonus (LOOP chapter 2: 300,000 base).
 assert.equal(relicGamble(900000,300000,0,0).payout,RELIC_RECEIPT_CAP);
 // Monte Carlo: average stays near +50%.
 let sum=0;const n=200000;for(let i=0;i<n;i++)sum+=relicGamble(4000,400,Math.random(),Math.random()).payout;
 assert.ok(Math.abs(sum/n-200)<15,String(sum/n));
});

test('竜騎士（ドラグーン）: four pieces in the summon pool; the full set removes recoil, raises the cap, halves betting recoil',async()=>{
 const {DRAGOON_RELICS,DRAGOON_SET_IDS,dragoonSetComplete}=await import('../src/relic-dragoon.ts');
 const {NORMAL_RELIC_BY_RARITY,NORMAL_RELIC_BY_ID}=await import('../src/relic-catalog.ts');
 assert.equal(DRAGOON_RELICS.length,4);
 for(const r of DRAGOON_RELICS){assert.ok(NORMAL_RELIC_BY_ID.get(r.id));assert.ok(NORMAL_RELIC_BY_RARITY.get('mythic')!.some(x=>x.id===r.id));}
 const set=():{cash:number;relics:RelicCollection}=>{
  const relics:RelicCollection={totalSummons:0,items:{},equipped:[]};
  for(const d of DRAGOON_RELICS){relics.items[d.id]={...d,origin:'normal',count:1} as RelicItem;relics.equipped.push(d.id);}
  return {cash:100000,relics};
 };
 const s=set();
 assert.ok(dragoonSetComplete(s.relics));
 assert.ok(!dragoonSetComplete({...s.relics,equipped:DRAGOON_SET_IDS.slice(0,3)}));
 // Each piece is strong on its own: the full set on a 400 KP win is far above +50%.
 const strongBonus=evaluateRelicBonus(s.relics,'competitive',{amount:400,win:true}).bonus;
 assert.ok(strongBonus>400,String(strongBonus));
 assert.ok(evaluateRelicBonus(s.relics,'competitive',{amount:400,win:true}).sets.some(x=>x.name.includes('竜騎士')));
 // No recoil with the set; the average stays +50% (p·B = E).
 const g=relicGamble(4000,400,0.99,0,{dragoon:true});
 assert.equal(g.kind,'miss');assert.equal(g.payout,0);
 assert.ok(Math.abs(g.chance-200/4000)<1e-9);
 // Cap 30,000 instead of 10,000.
 assert.equal(relicGamble(900000,300000,0,0,{dragoon:true}).payout,30000);
 assert.equal(relicGamble(900000,300000,0,0).payout,10000);
 // Betting losses: the recoil is halved.
 const plain=strong();plain.cash=100000;
 const withSet=set();
 const full=nativeRelicLoss(plain,'market',100000,now,1_000_000);
 const half=nativeRelicLoss(withSet,'market',100000,now,1_000_000);
 assert.equal(full,250);
 assert.equal(half,Math.min(250,Math.floor(evaluateRelicBonus(withSet.relics,'market',{amount:100000,win:true}).bonus/2)));
});
