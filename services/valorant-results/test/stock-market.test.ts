import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
import {operateKp,readKpState,kpPulse} from '../src/kp-api.ts';
import {prepareStocks,payStockDividends,stockBenefits,stockDiscount,convertStocks,tickStocks,nextStockPrices,queueStockPosts,STOCK_HOLD,fortuneCounts,fictionNews} from '../src/stock-market.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const T=Date.parse('2026-10-28T09:00:00+09:00'),DAY=STOCK_HOLD;
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const name of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+name,import.meta.url),'utf8'));
 let intercept:((text:string)=>void)|undefined;
 class Query {text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){intercept?.(this.text);return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:KpEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const result=queries.map(q=>q.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}}as unknown as D1Database};
 for(const [name,id]of [['One','p1'],['Two','p2']])sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run(name+'#JP1',id,'ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 const cash=(u=one)=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').get(guild,u)!.balance);
 const credit=(id:string,n:number,u=one)=>sql.prepare("INSERT INTO kp_ledger VALUES(?,?,?,?,'test',?)").run(id,guild,u,n,Date.now());
 return {env,sql,cash,credit,setIntercept:(f:typeof intercept)=>{intercept=f;}};
}
const trade=(f:Awaited<ReturnType<typeof fixture>>,id:string,side:string,quantity:number,symbol='keso',user=one)=>operateKp(f.env,mapping,user,id,'trade',{symbol,side,quantity,pricingVersion:1,limit:side==='buy'?Number.MAX_SAFE_INTEGER:0});

test('共通価格は口座のseedや個別価格と無関係。移行で評価額と端数を保存し、再実行で増えない',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();f.credit('start',1000);
 const row=f.sql.prepare('SELECT data FROM kp_state WHERE guild=? AND user=?').get(guild,one)!;
 const data=JSON.parse(String(row.data));data.holdings.keso=3;data.prices.keso=1311;data.seed=123;
 f.sql.prepare('UPDATE kp_state SET data=? WHERE guild=? AND user=?').run(JSON.stringify(data),guild,one);
 const a=await readKpState(f.env,mapping,one),b=await readKpState(f.env,mapping,two);
 assert.deepEqual(a.prices,b.prices);assert.equal(a.prices.keso,1200);assert.equal(a.holdings.keso,3);assert.equal(a.cash,1333);
 assert.equal(a.cash+a.holdings.keso*a.prices.keso,4933);
 await Promise.all([readKpState(f.env,mapping,one),readKpState(f.env,mapping,one)]);assert.equal(f.cash(),1333);
 assert.equal(f.sql.prepare('SELECT SUM(remaining) n FROM stock_lots WHERE user=?').get(one)!.n,3);
 assert.throws(()=>convertStocks({holdings:{keso:-1}},a.prices));
});
test('移行の台帳が失敗したら保有株も移行マーカーも全体を戻す',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();
 f.sql.prepare("UPDATE kp_state SET data=json_set(data,'$.holdings.keso',1,'$.prices.keso',1300) WHERE user=?").run(one);
 f.sql.exec("CREATE TRIGGER migration_fail BEFORE INSERT ON kp_ledger WHEN NEW.kind='stock-migration' BEGIN SELECT RAISE(ABORT,'fixture');END");
 await assert.rejects(prepareStocks(f.env,guild,one));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM stock_accounts WHERE user=?').get(one)!.n,0);assert.equal(f.cash(),0);
 f.sql.exec('DROP TRIGGER migration_fail');await prepareStocks(f.env,guild,one);assert.equal(f.cash(),100);
});
test('株取引は共有価格で1回だけ精算し、買い増しは新しい保有期間になる。売却は古い株から',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();f.credit('fund',100000);
 await trade(f,'stock-buy-operation-01','buy',10);assert.equal(f.cash(),87807);
 await trade(f,'stock-buy-operation-01','buy',10);assert.equal(f.cash(),87807);
 t.mock.timers.tick(DAY+1000);await trade(f,'stock-buy-operation-02','buy',5);
 const m=await prepareStocks(f.env,guild,one);const benefit=await stockBenefits(f.env,m,one);
 assert.equal(benefit.eligibleValue,10*m.prices.keso);
 await trade(f,'stock-sell-operation-1','sell',6);
 const after=await prepareStocks(f.env,guild,one);assert.equal((await stockBenefits(f.env,after,one)).eligibleValue,4*after.prices.keso);
 const lots=f.sql.prepare('SELECT remaining FROM stock_lots WHERE user=? ORDER BY at,id').all(one);assert.deepEqual(lots.map(r=>r.remaining),[4,5]);
 assert.equal((await readKpState(f.env,mapping,one)).holdings.keso,9);
});
test('ロット更新が失敗した場合は買付・KP・操作IDを全体ロールバック',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();f.credit('fund',10000);await prepareStocks(f.env,guild,one);
 f.sql.exec("CREATE TRIGGER buy_fail BEFORE INSERT ON stock_lots WHEN NEW.id LIKE 'stock:%' BEGIN SELECT RAISE(ABORT,'fixture');END");
 await assert.rejects(trade(f,'stock-rollback-buy-01','buy',2));assert.equal(f.cash(),10000);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_operations').get()!.n,0);
 f.sql.exec('DROP TRIGGER buy_fail');await trade(f,'stock-rollback-buy-01','buy',2);assert.equal(f.cash(),7572);
});
test('共有相場のversionが競合したら最新価格でやり直す。古い価格は約定しない',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();f.credit('fund',10000);await prepareStocks(f.env,guild,one);
 let changed=false;f.setIntercept(text=>{if(!changed&&text.startsWith('INSERT INTO kp_operations')){changed=true;f.sql.prepare("UPDATE stock_markets SET version=version+1,prices=json_set(prices,'$.keso',1500) WHERE guild=?").run(guild);}});
 await trade(f,'stock-price-conflict-1','buy',2);assert.equal(f.cash(),6966);assert.equal(f.sql.prepare('SELECT price FROM stock_trades').get()!.price,1501.5);
});
test('配当はJST9時の24時間以上保有分のみ。銘柄合算で日500KPまで。同時再試行も1回',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T+3600000});const f=await fixture();f.credit('fund',1000000);await trade(f,'dividend-buy-operation','buy',100);
 let m=await prepareStocks(f.env,guild,one);await payStockDividends(f.env,m,T+DAY);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM stock_dividends').get()!.n,0);
 const before=f.cash();await Promise.all([payStockDividends(f.env,m,T+2*DAY),payStockDividends(f.env,m,T+2*DAY)]);assert.equal(f.cash(),before+500);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM stock_dividends').get()!.n,1);
 await payStockDividends(f.env,m,T+2*DAY+3600000);assert.equal(f.cash(),before+500);
});
test('配当の台帳が失敗すれば受取済み扱いにしない。売却・買い直しでは古い権利が復活しない',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();f.credit('fund',100000);await trade(f,'dividend-fifo-buy-one','buy',10);const m=await prepareStocks(f.env,guild,one),before=f.cash();
 f.sql.exec("CREATE TRIGGER dividend_fail BEFORE INSERT ON kp_ledger WHEN NEW.kind='dividend' BEGIN SELECT RAISE(ABORT,'fixture');END");
 await assert.rejects(payStockDividends(f.env,m,T+DAY));assert.equal(f.cash(),before);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM stock_dividends').get()!.n,0);
 f.sql.exec('DROP TRIGGER dividend_fail');
 t.mock.timers.tick(12*3600000);await trade(f,'dividend-fifo-sell-all','sell',10);await trade(f,'dividend-fifo-buy-again','buy',10);
 await payStockDividends(f.env,m,T+DAY);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM stock_dividends').get()!.n,0);
});
test('24時間の優待が指名と高級品に適用され、再送・残高不足・割引上限を守る',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();f.credit('fund',200000);await trade(f,'benefits-buy-operation','buy',50);
 assert.equal((await readKpState(f.env,mapping,one)).stockBenefits.percent,0);
 t.mock.timers.tick(DAY+1);const s=await readKpState(f.env,mapping,one);assert.equal(s.stockBenefits.percent,5);
 const before=f.cash();const r=await operateKp(f.env,mapping,one,'benefit-directive-one','directive',{target:two,task:'competitive'}) as {result:{discount:{paid:number}}};
 assert.equal(r.result.discount.paid,7600);assert.equal(f.cash(),before-7600);await operateKp(f.env,mapping,one,'benefit-directive-one','directive',{target:two,task:'competitive'});assert.equal(f.cash(),before-7600);
 const luxury=await operateKp(f.env,mapping,one,'benefit-luxury-title-1','luxury',{item:'title',title:'KP長者'}) as {result:{discount:{paid:number}}};assert.equal(luxury.result.discount.paid,19000);
 assert.deepEqual(stockDiscount(2000000,5),{base:2000000,percent:5,saved:2000,paid:1998000});assert.throws(()=>stockDiscount(100,50));
});
test('売却直後に優待は減る。他人の保有やクライアント指定の割引率は使えない',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();f.credit('fund',100000);f.credit('fund2',20000,two);await trade(f,'benefit-ownership-buy','buy',50);t.mock.timers.tick(DAY+1);
 await trade(f,'benefit-ownership-sell','sell',50);assert.equal((await readKpState(f.env,mapping,one)).stockBenefits.percent,0);
 const before=f.cash(two);await operateKp(f.env,mapping,two,'benefit-foreign-direct','directive',{target:one,task:'competitive',percent:100,discount:8000});assert.equal(f.cash(two),before-8000);
});
test('保存済みの試合とQUIZが株ニュースに一度だけ反映される。過去分を遡って材料にしない',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();await readKpState(f.env,mapping,one);const m=await prepareStocks(f.env,guild,one);
 f.sql.prepare('INSERT INTO kp_events VALUES(?,?,?,?,?,?,?,?,?,?)').run('new-win',guild,one,'p1','new-match','competitive','win',900,'fixture',T+1000);
 f.sql.prepare('INSERT INTO kp_events VALUES(?,?,?,?,?,?,?,?,?,?)').run('old-win',guild,one,'p1','old-match','competitive','win',900,'fixture',T-1000);
 f.sql.prepare('INSERT INTO kp_quiz_events VALUES(?,?,?,?,?,?,?,?)').run('new-quiz',guild,one,'SOLO','2026-10-28','new-game',50,T+2000);
 const next=await tickStocks(f.env,m,T+300000,()=>.5);assert.equal(next.prices.keso,1205);assert.equal(next.prices.riso,781);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM stock_news WHERE symbol IN ('keso','riso')").get()!.n,2);
 // The win also counts once for the luck stocks (the old one, before the market, does not).
 assert.deepEqual(f.sql.prepare("SELECT symbol,bps FROM stock_news WHERE symbol IN ('msum','tnkn') ORDER BY symbol").all().map(r=>[r.symbol,r.bps]),[['msum',-20],['tnkn',20]]);
 const again=await tickStocks(f.env,next,T+600000,()=>.5);assert.equal(again.prices.keso,next.prices.keso);assert.equal(again.prices.riso,next.prices.riso);
});
test('相場更新の競合で履歴やニュースを二重に進めず、ニュースの影響も上限がある',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();const m=await prepareStocks(f.env,guild,one);
 await Promise.all([tickStocks(f.env,m,T+300000,()=>.5),tickStocks(f.env,m,T+300000,()=>1)]);
 const row=f.sql.prepare('SELECT version,history FROM stock_markets').get()!;assert.equal(row.version,1);assert.equal(JSON.parse(String(row.history)).keso.length,2);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM stock_ticks').get()!.n,1);
 const p={keso:1000,riso:1000,yuya:1000,yano:1000};assert.equal(nextStockPrices(p,Array.from({length:100},()=>({symbol:'keso',bps:40})),()=>1).keso,1038);
});
test('急騰・急落は稼ぎchへキュー登録。同じ更新を繰り返しても1件で個人の名前は出さない',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();const m=await prepareStocks(f.env,guild,one);m.version=1;m.prices.keso=1300;
 const env={...f.env,KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/1/token'};
 await queueStockPosts(env,m,T+300000);await queueStockPosts(env,m,T+300000);
 const posts=f.sql.prepare('SELECT body FROM kp_posts').all();assert.equal(posts.length,1);const body=JSON.parse(String(posts[0].body));assert.match(body.content,/急騰/);assert.deepEqual(body.allowed_mentions,{parse:[]});assert.doesNotMatch(body.content,/@|One|Two/);
});

test('9時に固定した評価額を使う。株価が後で上がってもその日の配当は増えない',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();f.credit('fund',10000);await trade(f,'dividend-snapshot-buy','buy',2);const m=await prepareStocks(f.env,guild,one);
 await payStockDividends(f.env,m,T+DAY);const first=f.cash();assert.equal(f.sql.prepare('SELECT amount FROM stock_dividends').get()!.amount,24);
 f.sql.prepare("UPDATE stock_markets SET prices=json_set(prices,'$.keso',100000) WHERE guild=?").run(guild);
 await payStockDividends(f.env,{...m,prices:{...m.prices,keso:100000}},T+DAY+3600000);assert.equal(f.cash(),first);
});
test('ニュースの効果は1銘柄1日3%まで。売買による材料だけなら0.3%まで',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();let m=await prepareStocks(f.env,guild,one);
 for(let round=0;round<3;round++){
  const at=T+(round+1)*300000;
  for(let i=0;i<10;i++)f.sql.prepare('INSERT INTO kp_events VALUES(?,?,?,?,?,?,?,?,?,?)').run('cap-'+round+'-'+i,guild,one,'p1','cap-match-'+round+'-'+i,'competitive','win',900,'fixture',at-1000);
  m=await tickStocks(f.env,m,at,()=>.5);
 }
 assert.equal(f.sql.prepare("SELECT SUM(ABS(applied_bps)) n FROM stock_news WHERE symbol='keso'").get()!.n,300);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM stock_news WHERE applied_version IS NULL').get()!.n,0,'capped events are consumed, not retried tomorrow');
});

test('競馬ニュースは払戻額ではなく精算対象馬券の純損益を使い、外れも材料になる',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();f.credit('fund',100000);const m=await prepareStocks(f.env,guild,one);
 const add=(id:string,bets:Array<{id:string;amount:number;payout:number}>,ids:string[])=>{
  const state=JSON.parse(String(f.sql.prepare('SELECT data FROM kp_state WHERE guild=? AND user=?').get(guild,one)!.data));state.raceBets=bets;
  const settled=bets.filter(b=>ids.includes(b.id));
  f.sql.prepare('INSERT INTO kp_operations VALUES(?,?,?,?,?,?,?,?,?)').run('race-settle:'+id,guild,one,'fixture',JSON.stringify({result:{settled}}),settled.reduce((s,b)=>s+b.payout,0),JSON.stringify(state),null,T+1000);
 };
 add('small',[{id:'a',amount:10000,payout:11000}],['a']);
 add('win',[{id:'b',amount:10000,payout:16000},{id:'unrelated',amount:90000,payout:0}],['b']);
 add('loss',[{id:'c',amount:6000,payout:0}],['c']);
 await tickStocks(f.env,m,T+300000,()=>.5);
 const news=f.sql.prepare("SELECT label,bps FROM stock_news WHERE symbol='yuya' ORDER BY id").all();
 assert.deepEqual(news.map(n=>[n.label,n.bps]),[['競馬で大きな損失',-40],['競馬で大きな利益',50]]);
});

test('新しく上場した銘柄：前からある相場と口座はそのまま、上場価格から売買できる',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();f.credit('fund',10000);await prepareStocks(f.env,guild,one);
 // The market and the wallet as saved before the listing: only the first four stocks.
 const old=['keso','riso','yuya','yano'];
 f.sql.prepare("UPDATE stock_markets SET prices=json_remove(prices,'$.msum','$.tnkn','$.komi','$.ishi','$.vdk','$.godo','$.ngya','$.koba'),history=json_remove(history,'$.msum','$.tnkn','$.komi','$.ishi','$.vdk','$.godo','$.ngya','$.koba')").run();
 f.sql.prepare("UPDATE kp_state SET data=json_remove(data,'$.holdings.vdk','$.holdings.msum') WHERE user=?").run(one);
 const state=await readKpState(f.env,mapping,one);
 assert.equal(state.prices.vdk,100);assert.equal(state.holdings.vdk,0);assert.equal(state.cash,10000);
 for(const id of old)assert.ok(Number.isSafeInteger(state.prices[id]));
 await trade(f,'listing-buy-vdk-01','buy',10,'vdk');
 assert.equal(f.cash(),10000-1050-11);assert.equal((await readKpState(f.env,mapping,one)).holdings.vdk,10);
 const m=await tickStocks(f.env,await prepareStocks(f.env,guild,one),T+300000,()=>.5);
 assert.ok(Number.isSafeInteger(JSON.parse(String(f.sql.prepare('SELECT prices FROM stock_markets').get()!.prices)).komi),'saved on the next tick');
 assert.ok(m.prices.koba>0);
});
test('メシウマ食堂・他人の金で焼肉は、誰かがKPを失った回数・得た回数で動く（金額は見ない、QUIZ・購入は数えない）',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();const m=await prepareStocks(f.env,guild,one);
 const ledger=(id:string,delta:number,kind:string)=>f.sql.prepare('INSERT INTO kp_ledger VALUES(?,?,?,?,?,?)').run(id,guild,one,delta,kind,T+1000);
 const op=(id:string,response:object)=>f.sql.prepare("INSERT INTO kp_operations(id,guild,user,request_hash,response,delta,state,at) VALUES(?,?,?,'h',?,0,'{}',?)").run(id,guild,two,JSON.stringify(response),T+2000);
 ledger('l1',50000,'test');ledger('penalty:x',-200,'match');ledger('u1',-100,'unite');ledger('m1',-30000,'mahjong');ledger('q1',50,'quiz');ledger('v1',30,'voice');
 op('chin',{result:{units:-2,net:-200}});op('bj',{result:{hand:null,done:{net:15000}}});op('spin',{result:{type:'red',outcome:3,amount:100,payout:200}});
 op('bet',{result:{bet:{amount:500}}});op('buy',{result:{symbol:'keso',side:'buy',quantity:1,price:1200}});
 op('race-settle:a,b',{result:{settled:[{id:'a',status:'lost',payout:0},{id:'b',status:'won',payout:900}]}});op('ml-settle:c',{result:{settled:[{id:'c',status:'refunded',payout:100}]}});
 assert.deepEqual(await fortuneCounts(f.env,guild,T,T+300000),{minus:5,plus:3});
 assert.deepEqual(await fortuneCounts(f.env,guild,T+300000,T+600000),{minus:0,plus:0},'only since the last tick');
 const next=await tickStocks(f.env,m,T+300000,()=>.5);
 assert.deepEqual(f.sql.prepare("SELECT symbol,bps,label FROM stock_news WHERE symbol IN ('msum','tnkn') ORDER BY symbol").all().map(r=>[r.symbol,r.bps,r.label]),[['msum',40,'直近でKPを失った5回・得た3回'],['tnkn',-40,'直近でKPを失った5回・得た3回']]);
 assert.ok(next.prices.msum>1000&&next.prices.tnkn<1000);
 await tickStocks(f.env,next,T+300000,()=>.5);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM stock_news WHERE symbol='msum'").get()!.n,1,'a repeated tick adds nothing');
});
test('架空の会社はたまに架空ニュースで大きく動く。外れの抽選ではニュースなし',()=>{
 assert.deepEqual(fictionNews(()=>.5),[]);
 const seq=[0,0.2,0,  0,0.9,0,  0.9,0.9,0.9,0.9];let i=0;
 const news=fictionNews(()=>seq[i++]);
 assert.deepEqual(news.map(n=>[n.symbol,n.bps]),[['komi',200],['ishi',-150]]);
 assert.ok(news.every(n=>n.label.length>0));
});

test('全銘柄の買付は共通価格を上げ、売却は下げる。再送では価格もKPも再更新しない',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();f.credit('order-fund',10000000);
 const initial=await readKpState(f.env,mapping,one),ids=Object.keys(initial.prices);
 for(const symbol of ids){
  const before=await readKpState(f.env,mapping,one),id='demand-buy-operation-'+symbol;
  const response=await trade(f,id,'buy',2,symbol);const bought=await readKpState(f.env,mapping,one),other=await readKpState(f.env,mapping,two);
  assert(bought.prices[symbol]>before.prices[symbol]);assert.equal(other.prices[symbol],bought.prices[symbol]);
  const cash=f.cash(),version=bought.stockMarket.version;assert.deepEqual(await trade(f,id,'buy',2,symbol),response);assert.equal(f.cash(),cash);assert.equal((await readKpState(f.env,mapping,one)).stockMarket.version,version);
  await trade(f,'demand-sell-operation-'+symbol,'sell',2,symbol);const sold=await readKpState(f.env,mapping,one);
  assert(sold.prices[symbol]<bought.prices[symbol]);assert.equal(sold.stockMarket.orderQuotes[symbol],before.stockMarket.orderQuotes[symbol]);assert(sold.cash<before.cash);
 }
 assert.equal(f.sql.prepare('SELECT at FROM stock_markets').get()!.at,T,'orders do not postpone regular market ticks');
});
test('別ユーザーの売買でpulseも変わり、同時買付は後の注文ほど高い価格になる',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();f.credit('fund-one',1000000);f.credit('fund-two',1000000,two);await readKpState(f.env,mapping,one);
 const pulse=await kpPulse(f.env,guild,two,T);
 await Promise.all([trade(f,'parallel-stock-buy-one','buy',10,'keso',one),trade(f,'parallel-stock-buy-two','buy',10,'keso',two)]);
 assert.notEqual(await kpPulse(f.env,guild,two,T),pulse);
 const trades=f.sql.prepare('SELECT price FROM stock_trades ORDER BY price').all();assert(Number(trades[1]!.price)>Number(trades[0]!.price));
 const state=await readKpState(f.env,mapping,one);assert.equal(state.stockMarket.orderQuotes.keso,1228.8*1000000);assert.equal(state.stockMarket.ticks.length,3);
 const m=await tickStocks(f.env,await prepareStocks(f.env,guild,one),T+300000,()=>.5);assert.equal(m.version,state.stockMarket.version+1);assert.equal(m.at,T+300000);
});
test('確認した額より不利な価格では約定せず、古いクライアントの注文も課金しない',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();f.credit('guard-one',1000000);f.credit('guard-two',1000000,two);
 await assert.rejects(operateKp(f.env,mapping,one,'old-client-buy-request','trade',{symbol:'keso',side:'buy',quantity:10}),/Activityを開き直/);assert.equal(f.cash(),1000000);
 await trade(f,'guard-other-user-buy','buy',10,'keso',two);
 await assert.rejects(operateKp(f.env,mapping,one,'guard-stale-buy-quote','trade',{symbol:'keso',side:'buy',quantity:10,pricingVersion:1,limit:12193}),/株価が変わった/);assert.equal(f.cash(),1000000);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_operations WHERE user=?').get(one)!.n,0);
});
test('株価反映やロットで失敗した売買は価格・履歴・精度・財布を全体ロールバック',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();f.credit('atomic-fund',1000000);const before=await readKpState(f.env,mapping,one);
 f.sql.exec("CREATE TRIGGER impact_fail BEFORE INSERT ON stock_ticks WHEN NEW.version>0 BEGIN SELECT RAISE(ABORT,'impact failed'); END");
 await assert.rejects(trade(f,'rollback-impact-buy','buy',10),/impact failed/);assert.equal(f.cash(),1000000);
 const after=await readKpState(f.env,mapping,one);assert.deepEqual(after.prices,before.prices);assert.deepEqual(after.holdings,before.holdings);assert.deepEqual(after.stockMarket.orderQuotes,before.stockMarket.orderQuotes);assert.equal(after.stockMarket.version,before.stockMarket.version);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM stock_trades').get()!.n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM stock_order_quotes').get()!.n,0);
 f.sql.exec('DROP TRIGGER impact_fail');await trade(f,'rollback-impact-buy','buy',10);assert((await readKpState(f.env,mapping,one)).prices.keso>1200);
});

test('全銘柄の通常変動幅は旧設定より大きく、上げ下げの対数幅は対称',()=>{
 const previous={keso:60,riso:100,yuya:200,yano:50,msum:40,tnkn:40,komi:150,ishi:80,vdk:250,godo:80,ngya:150,koba:60};
 const base=Object.fromEntries(Object.keys(previous).map(id=>[id,1000000]));
 const up=nextStockPrices(base,[],()=>1),down=nextStockPrices(base,[],()=>0);
 for(const [id,bps] of Object.entries(previous)){assert(up[id]!>1000000*(1+bps/10000));assert(down[id]!<1000000*(1-bps/10000));assert(Math.abs(Math.log(up[id]!/1000000)+Math.log(down[id]!/1000000))<0.000002);}
});

test('売却の受取額も確認した下限を守り、不利な価格では保有株を減らさない',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T});const f=await fixture();f.credit('sell-limit-fund',1000000);
 f.sql.prepare("UPDATE kp_state SET data=json_set(data,'$.holdings.keso',20,'$.prices.keso',1200) WHERE user=?").run(two);await readKpState(f.env,mapping,two);
 await trade(f,'sell-limit-buy-first','buy',10);const cash=f.cash();await trade(f,'sell-limit-other-sell','sell',10,'keso',two);
 await assert.rejects(operateKp(f.env,mapping,one,'sell-limit-stale-order','trade',{symbol:'keso',side:'sell',quantity:10,pricingVersion:1,limit:11951}),/株価が変わった/);
 assert.equal(f.cash(),cash);assert.equal((await readKpState(f.env,mapping,one)).holdings.keso,10);
});
