import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedCasinoProfit,verifiedCasinoStake} from '../src/relic-profit.ts';
import {
 nativeRelicBonus,evaluateRelicBonus,casinoRelicDay,casinoRelicAllowance,
 CASINO_RELIC_RATE,CASINO_RELIC_ROUND_CAP,CASINO_RELIC_DAILY_CAP,
 type RelicCollection,type RelicItem,
} from '../src/relics.ts';

function relicFixture(){
 const relics:RelicCollection={totalSummons:0,items:{},equipped:[]};
 // Purposefully use the overpowered ORIGINAL relics: no relic-specific nerfs.
 const definitions=[
  {id:'normal.pact.coinflip',name:'双面の魔導銀貨',mode:'universal',skill:'even',percent:220},
  {id:'normal.pact.chain',name:'暴走する鎖の心臓',mode:'universal',skill:'spark',percent:260},
  {id:'normal.universal.common',name:'どこでも効く銅貨',mode:'universal',skill:'even',percent:2},
 ] as const;
 for(const item of definitions){
  relics.items[item.id]={id:item.id,name:item.name,origin:'normal',rarity:'legendary',power:130,
   ability:'test',count:1,mode:item.mode,skill:item.skill,percent:item.percent,cap:0} as RelicItem;
  relics.equipped.push(item.id);
 }
 return {cash:1000000,relics};
}
test('casino only: original overpower relics stay strong everywhere BUT casino grants at most 0.5% of stake',()=>{
 const state=relicFixture(),now=Date.UTC(2026,10,5,1);
 const raw=evaluateRelicBonus(state.relics,'casino',{amount:100,win:true}).bonus;
 assert.ok(raw>500,'the dangerous combo should remain powerful before the payout guard');
 const lowRisk=nativeRelicBonus(state,'casino',100,now,3500);
 assert.equal(lowRisk,18); // 35 of 37 numbers, 100KP each
 assert.equal(state.cash,1000018);
 assert.deepEqual(state.relics.dailyCasinoRelic,{day:'2026-11-05',amount:18});
 assert.equal(state.relics.lastNativeEffect?.bonus,18);
 assert.equal(state.relics.nativeEffects?.[0]?.bonus,18);
 // The same 100 KP profit with wager=1800 is restricted to 9 KP.
 const second=nativeRelicBonus(state,'casino',100,now,1800);
 assert.equal(second,9);
 // Stocks have their own allowance (0.5% of 20,000 KP proceeds) and do not consume the casino allowance.
 const nonCasino=nativeRelicBonus(state,'market',100,now,20000);
 assert.equal(nonCasino,100);
 assert.equal(state.relics.dailyCasinoRelic.amount,27);
});
test('every casino settlement source supplies only real wager and never gross payouts',()=>{
 const receipts=[
  [{amount:3500,payout:3600},3500,'roulette multi number without net property'],
  [{amount:500,payout:1000},500,'roulette single/color without net property'],
  [{amount:1000,net:500,units:1},1000,'chinchiro'],
  [{done:{bet:800,doubled:true,payout:3200,net:1600}},1600,'blackjack double'],
  [{done:{bet:1000,doubled:false,payout:2000,net:1000}},1000,'blackjack'],
  [{done:{game:'slot',bet:1000,payout:2000,net:1000}},1000,'slot'],
  [{done:{game:'mines',bet:1000,payout:1100,net:100}},1000,'mines'],
  [{done:{game:'video-poker',bet:1000,payout:2000,net:1000}},1000,'poker'],
  [{done:{game:'baccarat',bet:1000,payout:2000,net:1000}},1000,'baccarat'],
 ] as const;
 for(const [r,w,label] of receipts){
  assert.equal(verifiedCasinoStake(r),w,label);
  assert.ok(verifiedCasinoProfit(r)>0,label);
 }
 for(const x of [
  {done:{net:0,bet:1000}},{done:{net:-1000,bet:1000}},
  {done:{net:500,bet:'1000'}},{done:{net:500,bet:100001}},
  {done:{net:500,bet:0}},{done:{net:500,bet:1000,doubled:'true'}},
  {net:500,amount:999999},{net:'100',amount:1000},
 ]){
  assert.equal(verifiedCasinoStake(x),0,JSON.stringify(x));
 }
 assert.equal(verifiedCasinoStake({done:null}),0);
 assert.equal(verifiedCasinoStake(null),0);
});

test('roulette cover-all and small hedge do not create casino relic rewards in excess of stake based budget',()=>{
 assert.equal(CASINO_RELIC_RATE,.005);
 assert.equal(CASINO_RELIC_ROUND_CAP,250);
 assert.equal(CASINO_RELIC_DAILY_CAP,500);
 assert.equal(verifiedCasinoProfit({amount:3700,payout:3600,net:-100}),0);
 assert.equal(verifiedCasinoStake({amount:3700,payout:3600}),0);
 assert.equal(casinoRelicAllowance(3500,0),18);
 assert.equal(casinoRelicAllowance(1800,0),9);
 assert.equal(casinoRelicAllowance(100,0),1);
 assert.equal(casinoRelicAllowance(100000,0),250);
 assert.equal(casinoRelicAllowance(200000,0),250);
 assert.equal(casinoRelicAllowance(100000,490),10);
 assert.equal(casinoRelicAllowance(100000,500),0);
 for(const bad of [-1,0,10,99,200001,NaN,1.1])assert.equal(casinoRelicAllowance(bad,0),0);
});

test('daily limit is atomic with state and resets at JST 09:00, without any D1 queries',()=>{
 const state=relicFixture();
 const start=Date.parse('2026-11-05T08:59:59+09:00');
 const next=Date.parse('2026-11-05T09:00:00+09:00');
 assert.equal(casinoRelicDay(start),'2026-11-04');
 assert.equal(casinoRelicDay(next),'2026-11-05');
 const p1=nativeRelicBonus(state,'casino',100000,start,100000);
 const p2=nativeRelicBonus(state,'casino',100000,start,100000);
 const p3=nativeRelicBonus(state,'casino',100000,start,100000);
 assert.equal(p1,250);assert.equal(p2,250);assert.equal(p3,0);
 assert.equal(state.relics.dailyCasinoRelic?.amount,500);
 assert.equal(state.relics.nativeEffects?.length,2,'no ledger entry for 0 bonus');
 const reset=nativeRelicBonus(state,'casino',100000,next,100000);
 assert.equal(reset,250);
 assert.deepEqual(state.relics.dailyCasinoRelic,{day:'2026-11-05',amount:250});
 assert.equal(nativeRelicBonus(state,'casino',100000,next),0,'casino without verified wager fails closed');
});
