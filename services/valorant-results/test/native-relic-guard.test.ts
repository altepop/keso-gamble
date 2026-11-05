import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared browser quote arithmetic.
import {stockOrderQuote,STOCK_PRICE_SCALE} from '../../../js/stock-order.js';
import {verifiedStockProfit,verifiedBetProfit,verifiedBetStake,verifiedBetLoss,verifiedStockLoss,verifiedCasinoNet,verifiedCasinoLossStake} from '../src/relic-profit.ts';
import {creditVerifiedRelicLoss,nativeRelicBonus,nativeRelicLoss,snapshotLoadout,rememberLoadout,RELIC_LOSS_MEMORY_MS,nativeRelicAllowance,evaluateRelicBonus,creditVerifiedRelicBonus,type RelicCollection,type RelicItem} from '../src/relics.ts';

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


// A minimal D1 over node:sqlite with the tables the verified relic paths use.
async function db(relics:RelicCollection,balance=1000){
 const {DatabaseSync}=await import('node:sqlite');
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE kp_state(guild TEXT,user TEXT,data TEXT,PRIMARY KEY(guild,user));
  CREATE TABLE kp_wallets(guild TEXT,user TEXT,balance INTEGER NOT NULL CHECK(balance>=0),PRIMARY KEY(guild,user));
  CREATE TABLE kp_ledger(id TEXT PRIMARY KEY,guild TEXT,user TEXT,delta INTEGER,kind TEXT,at INTEGER);
  CREATE TRIGGER apply AFTER INSERT ON kp_ledger BEGIN UPDATE kp_wallets SET balance=balance+NEW.delta WHERE guild=NEW.guild AND user=NEW.user; END;
  CREATE TABLE kp_debt_events(id TEXT PRIMARY KEY,guild TEXT,user TEXT,amount INTEGER,kind TEXT,at INTEGER);
  CREATE TABLE kp_steam_events(id TEXT PRIMARY KEY);
  CREATE TABLE spike_rewards(id TEXT,guild TEXT,user TEXT,detail TEXT);CREATE TABLE spike_overdrive_rewards(id TEXT,guild TEXT,user TEXT,detail TEXT);`);
 sql.prepare('INSERT INTO kp_state VALUES(?,?,?)').run('g','u',JSON.stringify({relics}));
 sql.prepare('INSERT INTO kp_wallets VALUES(?,?,?)').run('g','u',balance);
 class Q{t:string;v:unknown[];constructor(t:string,v:unknown[]=[]){this.t=t;this.v=v;}bind(...v:unknown[]){return new Q(this.t,v);}
  async first(){return sql.prepare(this.t).get(...this.v as never[])??null;}async run(){const r=sql.prepare(this.t).run(...this.v as never[]);return {meta:{changes:Number(r.changes)}};}
  async all(){return {results:sql.prepare(this.t).all(...this.v as never[])};}}
 return {sql,env:{DB:{prepare:(t:string)=>new Q(t)}} as never,balance:()=>Number((sql.prepare("SELECT balance FROM kp_wallets").get() as {balance:number}).balance),
  debt:()=>Number((sql.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM kp_debt_events").get() as {n:number}).n)};
}

test('thrill modes: wins get the full relic bonus with no cap, normal losses keep the plain reward',async()=>{
 const s=strong(),f=await db(s.relics);
 const full=evaluateRelicBonus(s.relics,'competitive',{amount:900,win:true}).bonus;
 assert.ok(full>900,'数倍');
 assert.equal(await creditVerifiedRelicBonus(f.env,'g','u','match:1','competitive',900,true,now),full);
 assert.equal(await creditVerifiedRelicBonus(f.env,'g','u','match:2','competitive',200,false,now),0,'a normal loss: +200 only');
 assert.equal(f.balance(),1000+full);
});

test('thrill negative results grow by the relic strength, beyond the balance as 借KP; the アンレ lottery is computed apart',async()=>{
 const s=strong(),f=await db(s.relics,300);
 const extra=evaluateRelicBonus(s.relics,'competitive',{amount:400,win:true}).bonus;
 assert.equal(await creditVerifiedRelicLoss(f.env,'g','u','match:3','competitive',400,now),extra);
 assert.equal(f.balance(),0);
 assert.equal(f.debt(),extra-300,'the rest is 借KP');
 assert.equal(await creditVerifiedRelicLoss(f.env,'g','u','match:3','competitive',400,now),0,'once per receipt');
 // Safe modes never take an extra loss.
 assert.equal(await creditVerifiedRelicLoss(f.env,'g','u','match:4','teamdeathmatch',400,now),0);
 // アンレ: 370 win + 100,000 lottery → relics act on 370 only.
 const g=await db(strong().relics);
 const onWin=evaluateRelicBonus(strong().relics,'unrated',{amount:370,win:true}).bonus;
 assert.equal(await creditVerifiedRelicBonus(g.env,'g','u','match:5','unrated',100370,true,now,100000),onWin);
});

test('safe modes: the bonus is at most the base; one-off rewards: LOOP 20,000 per receipt, Steam 20,000 and 30,000 a day',async()=>{
 const s=strong(),f=await db(s.relics);
 assert.equal(await creditVerifiedRelicBonus(f.env,'g','u','voice:1','voice',30,true,now),30);
 assert.equal(await creditVerifiedRelicBonus(f.env,'g','u','loop:1','loop',300000,true,now),20000);
 for(const id of ['steam:a','steam:b','steam:c'])f.sql.prepare('INSERT INTO kp_steam_events VALUES(?)').run(id);
 assert.equal(await creditVerifiedRelicBonus(f.env,'g','u','steam:a','steam',5000,true,now),Math.min(20000,evaluateRelicBonus(s.relics,'steam',{amount:5000,win:true}).bonus));
 const first=Number((f.sql.prepare("SELECT delta FROM kp_ledger WHERE id='relic:steam:a'").get() as {delta:number}).delta);
 await creditVerifiedRelicBonus(f.env,'g','u','steam:b','steam',5000,true,now);
 const third=await creditVerifiedRelicBonus(f.env,'g','u','steam:c','steam',5000,true,now);
 const total=Number((f.sql.prepare("SELECT SUM(delta) AS n FROM kp_ledger WHERE id LIKE 'relic:steam:%'").get() as {n:number}).n);
 assert.ok(total<=30000,String(total));assert.ok(first>0);assert.ok(third>=0);
});

test('relics put on just before a win do not count; taken off before a loss still count',async()=>{
 const s=strong();
 // The player equips the strong set 10 minutes before the win settles (nothing was equipped before).
 s.relics.recentLoadouts=[{items:[],until:now+RELIC_LOSS_MEMORY_MS}];s.relics.loadoutChangedAt=now-10*60_000;
 const f=await db(s.relics);
 assert.equal(await creditVerifiedRelicBonus(f.env,'g','u','match:6','competitive',900,true,now),0);
 // Two hours after the change it counts.
 assert.ok(await creditVerifiedRelicBonus(f.env,'g','u','match:7','competitive',900,true,now+2*3600_000)>900);
 // Taking everything off before a loss: the removed set still counts for 24 hours.
 const t=strong(),items=snapshotLoadout(t.relics);t.relics.equipped=[];rememberLoadout(t.relics,items,now);
 const h=await db(t.relics,100000);
 assert.ok(await creditVerifiedRelicLoss(h.env,'g','u','match:8','competitive',400,now+60_000)>400);
});

test('special effects: 竜騎士 win x1.25 / loss x0.5, 色違い thrill win x1.5, 深淵 contract x1.3/x1.75, crown x1.5/x2',async()=>{
 const {DRAGOON_RELICS}=await import('../src/relic-dragoon.ts');
 const {ABYSS_RELICS}=await import('../src/relic-abyss.ts');
 const {relicWinFactor,relicLossFactor,relicFlags,FOIL_ODDS}=await import('../src/relics.ts');
 assert.equal(FOIL_ODDS,5000);
 const set:RelicCollection={totalSummons:0,items:{},equipped:[]};
 for(const d of DRAGOON_RELICS){set.items[d.id]={...d,origin:'normal',count:1} as RelicItem;set.equipped.push(d.id);}
 const flags=relicFlags(set);
 assert.equal(flags.dragoon,true);
 assert.equal(relicWinFactor(flags,true),1.25);assert.equal(relicLossFactor(flags),0.5);
 assert.equal(relicWinFactor({dragoon:false,foil:true,contract:false,crown:false},true),1.5);
 assert.equal(relicWinFactor({dragoon:false,foil:true,contract:false,crown:false},false),1,'色違い boosts thrill wins only');
 assert.equal(relicWinFactor({dragoon:false,foil:false,contract:true,crown:false},true),1.3);
 assert.equal(relicLossFactor({dragoon:false,foil:false,contract:true,crown:false}),1.75);
 assert.equal(relicWinFactor({dragoon:false,foil:false,contract:true,crown:true},true),1.5);
 assert.equal(relicLossFactor({dragoon:false,foil:false,contract:true,crown:true}),2);
 // End to end: the Dragoon set on a competitive win pays 1.25x the plain relic bonus.
 const f=await db(set);
 const plain=evaluateRelicBonus(set,'competitive',{amount:900,win:true}).bonus;
 assert.equal(await creditVerifiedRelicBonus(f.env,'g','u','match:9','competitive',900,true,now),Math.floor(plain*1.25));
 // Abyss crown on a ラス doubles the extra loss.
 const c:RelicCollection={totalSummons:0,items:{},equipped:[]};const crown=ABYSS_RELICS.find(x=>x.id==='normal.abyss.crown')!;
 c.items[crown.id]={...crown,origin:'normal',count:1} as RelicItem;c.equipped.push(crown.id);
 const g=await db(c,100000);
 const raw=evaluateRelicBonus(c,'mahjong',{amount:4000,win:true}).bonus;
 assert.equal(await creditVerifiedRelicLoss(g.env,'g','u','mahjong:1','mahjong',4000,now),raw*2);
 // Betting losses with the Dragoon set are halved (and still capped).
 const bet={cash:100000,relics:set};
 assert.ok(nativeRelicLoss(bet,'market',100000,now,1_000_000)<=250);
});

test('Spike Rush (safe): relics act on the 40/20 base and add at most the base',async()=>{
 const s=strong(),f=await db(s.relics);
 f.sql.prepare('INSERT INTO spike_rewards VALUES(?,?,?,?)').run('match:s','g','u',JSON.stringify({gamesBefore:30,base:40}));
 assert.equal(await creditVerifiedRelicBonus(f.env,'g','u','match:s','spikerush',720,true,now),40);
});
