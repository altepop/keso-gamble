// One server market per guild. Quotes, dividends, lots and benefits never use the demo PRNG.
import type {KpEnv} from './kp.ts';
// @ts-expect-error Shared pure browser engine.
import {MARKET,advanceMarket} from '../../../js/engine.js';
interface Stock {id:string;name:string;initialPrice:number}
const STOCKS=MARKET as Stock[];
const IDS=STOCKS.map(s=>s.id);
export const STOCK_INTERVAL=5*60_000,STOCK_HOLD=86400000,DIVIDEND_CAP=500;
export interface Market {guild:string;version:number;prices:Record<string,number>;history:Record<string,number[]>;at:number;startedAt:number;token:string}
export interface StockBenefits {eligibleValue:number;percent:number;heldHours:number}
interface RawMarket {guild:string;version:number;prices:string;history:string;at:number;started_at:number;token:string}
const ready=new WeakSet<object>();
const parse=(r:RawMarket):Market=>({guild:r.guild,version:r.version,prices:JSON.parse(r.prices),history:JSON.parse(r.history),at:r.at,startedAt:r.started_at,token:r.token});
export function stockDiscount(base:number,percent:number){
 if(!Number.isSafeInteger(base)||base<0||![0,3,5].includes(percent))throw Error('Invalid stock discount');
 const saved=Math.min(2000,Math.floor(base*percent/100));return {base,percent,saved,paid:base-saved};
}
export async function ensureStocks(env:KpEnv){
 if(ready.has(env.DB))return;
 await env.DB.batch([
 `CREATE TABLE IF NOT EXISTS stock_markets(guild TEXT PRIMARY KEY,version INTEGER NOT NULL,prices TEXT NOT NULL,history TEXT NOT NULL,at INTEGER NOT NULL,started_at INTEGER NOT NULL,token TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS stock_accounts(guild TEXT NOT NULL,user TEXT NOT NULL,source_version INTEGER NOT NULL,holdings TEXT NOT NULL,old_value INTEGER NOT NULL,new_value INTEGER NOT NULL,refund INTEGER NOT NULL CHECK(refund>=0),at INTEGER NOT NULL,PRIMARY KEY(guild,user))`,
 `CREATE TABLE IF NOT EXISTS stock_lots(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,symbol TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>=0),remaining INTEGER NOT NULL CHECK(remaining BETWEEN 0 AND quantity),price INTEGER NOT NULL CHECK(price>0),at INTEGER NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS stock_lots_owner ON stock_lots(guild,user,symbol,at,id)`,
 `CREATE TABLE IF NOT EXISTS stock_trades(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,symbol TEXT NOT NULL,side TEXT NOT NULL CHECK(side IN ('buy','sell')),quantity INTEGER NOT NULL CHECK(quantity>0),price INTEGER NOT NULL,at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS stock_sale_lots(sale TEXT NOT NULL,lot TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),PRIMARY KEY(sale,lot))`,
 `CREATE TABLE IF NOT EXISTS stock_dividend_days(guild TEXT NOT NULL,day TEXT NOT NULL,prices TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(guild,day))`,
 `CREATE TABLE IF NOT EXISTS stock_dividends(guild TEXT NOT NULL,user TEXT NOT NULL,day TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 500),eligible_value INTEGER NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(guild,user,day))`,
 `CREATE TABLE IF NOT EXISTS stock_news(guild TEXT NOT NULL,id TEXT NOT NULL,symbol TEXT NOT NULL,label TEXT NOT NULL,bps INTEGER NOT NULL,at INTEGER NOT NULL,applied_version INTEGER,applied_bps INTEGER NOT NULL DEFAULT 0,applied_at INTEGER,PRIMARY KEY(guild,id))`,
 `CREATE INDEX IF NOT EXISTS stock_news_pending ON stock_news(guild,applied_version,at)`,
 `CREATE TABLE IF NOT EXISTS stock_ticks(guild TEXT NOT NULL,version INTEGER NOT NULL,prices TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(guild,version))`,
 `CREATE TABLE IF NOT EXISTS stock_announcements(guild TEXT NOT NULL,symbol TEXT NOT NULL,slot INTEGER NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(guild,symbol,slot))`,
 `CREATE TABLE IF NOT EXISTS kp_posts(id TEXT PRIMARY KEY,body TEXT NOT NULL,at INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0)`,
 // One migration row changes holdings and returns only the conversion remainder, atomically.
 `CREATE TRIGGER IF NOT EXISTS stock_account_apply AFTER INSERT ON stock_accounts BEGIN
  UPDATE kp_state SET data=json_set(data,'$.holdings',json(NEW.holdings)),version=version+1 WHERE guild=NEW.guild AND user=NEW.user AND version=NEW.source_version;
  SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'stock migration changed') END;
  INSERT INTO kp_ledger(id,guild,user,delta,kind,at) SELECT 'stock-migration:'||NEW.guild||':'||NEW.user,NEW.guild,NEW.user,NEW.refund,'stock-migration',NEW.at WHERE NEW.refund>0;
  INSERT INTO stock_lots(id,guild,user,symbol,quantity,remaining,price,at)
   SELECT 'stock-migration:'||NEW.guild||':'||NEW.user||':'||j.key,NEW.guild,NEW.user,j.key,j.value,j.value,json_extract(m.prices,'$.'||j.key),NEW.at FROM json_each(NEW.holdings) j JOIN stock_markets m ON m.guild=NEW.guild WHERE j.value>0;
 END`,
 `CREATE TRIGGER IF NOT EXISTS stock_dividend_apply AFTER INSERT ON stock_dividends BEGIN
  INSERT INTO kp_ledger(id,guild,user,delta,kind,at) VALUES('stock-dividend:'||NEW.guild||':'||NEW.user||':'||NEW.day,NEW.guild,NEW.user,NEW.amount,'dividend',NEW.at);
 END`,
 // The existing operation insert is already guarded by both wallet and state versions.
 // The market version is checked there too. Lots and the wallet settle in that same SQL statement.
 `CREATE TRIGGER IF NOT EXISTS stock_trade_apply AFTER INSERT ON kp_operations WHEN json_extract(NEW.response,'$.stockTrade.symbol') IS NOT NULL BEGIN
  INSERT INTO stock_trades(id,guild,user,symbol,side,quantity,price,at) VALUES('stock:'||NEW.guild||':'||NEW.user||':'||NEW.id,NEW.guild,NEW.user,json_extract(NEW.response,'$.stockTrade.symbol'),json_extract(NEW.response,'$.stockTrade.side'),json_extract(NEW.response,'$.stockTrade.quantity'),json_extract(NEW.response,'$.stockTrade.price'),NEW.at);
 END`,
 `CREATE TRIGGER IF NOT EXISTS stock_dividend_before_trade BEFORE INSERT ON stock_trades BEGIN
  INSERT OR IGNORE INTO stock_dividend_days(guild,day,prices,at) SELECT guild,strftime('%Y-%m-%d',(NEW.at/86400000)*86400,'unixepoch'),prices,NEW.at FROM stock_markets WHERE guild=NEW.guild AND started_at<(NEW.at/86400000)*86400000;
  INSERT OR IGNORE INTO stock_dividends(guild,user,day,amount,eligible_value,at)
   SELECT l.guild,l.user,strftime('%Y-%m-%d',(NEW.at/86400000)*86400,'unixepoch'),MIN(500,CAST(SUM(l.remaining*CAST(json_extract(m.prices,'$.'||l.symbol) AS INTEGER))/100 AS INTEGER)),SUM(l.remaining*CAST(json_extract(m.prices,'$.'||l.symbol) AS INTEGER)),NEW.at
   FROM stock_lots l JOIN stock_dividend_days m ON m.guild=l.guild AND m.day=strftime('%Y-%m-%d',(NEW.at/86400000)*86400,'unixepoch') WHERE l.guild=NEW.guild AND l.remaining>0 AND l.at<=(NEW.at/86400000)*86400000-86400000 GROUP BY l.guild,l.user HAVING SUM(l.remaining*CAST(json_extract(m.prices,'$.'||l.symbol) AS INTEGER))>=100;
 END`,
 `CREATE TRIGGER IF NOT EXISTS stock_lot_buy AFTER INSERT ON stock_trades WHEN NEW.side='buy' BEGIN
  INSERT INTO stock_lots(id,guild,user,symbol,quantity,remaining,price,at) VALUES(NEW.id,NEW.guild,NEW.user,NEW.symbol,NEW.quantity,NEW.quantity,NEW.price,NEW.at);
 END`,
 `CREATE TRIGGER IF NOT EXISTS stock_lot_sell AFTER INSERT ON stock_trades WHEN NEW.side='sell' BEGIN
  INSERT INTO stock_sale_lots(sale,lot,quantity)
   SELECT NEW.id,id,taken FROM (SELECT id,MIN(remaining,MAX(0,NEW.quantity-COALESCE(SUM(remaining) OVER(ORDER BY at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0))) AS taken FROM stock_lots WHERE guild=NEW.guild AND user=NEW.user AND symbol=NEW.symbol AND remaining>0) WHERE taken>0;
  SELECT CASE WHEN COALESCE((SELECT SUM(quantity) FROM stock_sale_lots WHERE sale=NEW.id),0)!=NEW.quantity THEN RAISE(ABORT,'stock holdings changed') END;
  UPDATE stock_lots SET remaining=remaining-(SELECT quantity FROM stock_sale_lots WHERE sale=NEW.id AND lot=stock_lots.id) WHERE id IN(SELECT lot FROM stock_sale_lots WHERE sale=NEW.id);
 END`,
 ].map(sql=>env.DB.prepare(sql)));ready.add(env.DB);
}
async function read(env:KpEnv,guild:string){const row=await env.DB.prepare('SELECT * FROM stock_markets WHERE guild=?').bind(guild).first<RawMarket>();if(!row)throw Error('Stock market unavailable');return parse(row);}
export function convertStocks(data:{holdings?:Record<string,number>;prices?:Record<string,number>},prices:Record<string,number>){
 let oldValue=0,newValue=0;const holdings:Record<string,number>={};
 for(const id of IDS){const q=data.holdings?.[id]??0,p=data.prices?.[id]??prices[id];if(!Number.isSafeInteger(q)||q<0||!Number.isSafeInteger(p)||p<1||!Number.isSafeInteger(q*p))throw Error('Invalid legacy shares');const value=q*p;holdings[id]=Math.floor(value/prices[id]);oldValue+=value;newValue+=holdings[id]*prices[id];}
 if(!Number.isSafeInteger(oldValue)||!Number.isSafeInteger(newValue))throw Error('Invalid legacy stock value');
 return {holdings,oldValue,newValue,refund:oldValue-newValue};
}
export async function migrateStocks(env:KpEnv,market:Market,user:string,now=Date.now()){
 if(await env.DB.prepare('SELECT 1 FROM stock_accounts WHERE guild=? AND user=?').bind(market.guild,user).first())return;
 for(let i=0;i<4;i++){
  const old=await env.DB.prepare('SELECT data,version FROM kp_state WHERE guild=? AND user=?').bind(market.guild,user).first<{data:string;version:number}>();if(!old)return;
  const legacy=JSON.parse(old.data);advanceMarket(legacy,now);
  const converted=convertStocks(legacy,market.prices);
  const result=await env.DB.prepare(`INSERT INTO stock_accounts(guild,user,source_version,holdings,old_value,new_value,refund,at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM kp_state WHERE guild=? AND user=? AND version=?) AND EXISTS(SELECT 1 FROM stock_markets WHERE guild=? AND version=?) ON CONFLICT(guild,user) DO NOTHING`)
   .bind(market.guild,user,old.version,JSON.stringify(converted.holdings),converted.oldValue,converted.newValue,converted.refund,now,market.guild,user,old.version,market.guild,market.version).run();
  if(result.meta.changes||await env.DB.prepare('SELECT 1 FROM stock_accounts WHERE guild=? AND user=?').bind(market.guild,user).first())return;
  market=await read(env,market.guild);
 }
 throw Error('株の移行が他の操作と重なりました。もう一度お試しください。');
}
export async function payStockDividends(env:KpEnv,market:Market,now=Date.now()){
 // 00:00 UTC = 09:00 JST. A full 24-hour lot age is required at this boundary.
 const boundary=Math.floor(now/STOCK_HOLD)*STOCK_HOLD;
 if(boundary<=market.startedAt)return;
 const day=new Date(boundary).toISOString().slice(0,10);
 await env.DB.prepare('INSERT OR IGNORE INTO stock_dividend_days VALUES(?,?,?,?)').bind(market.guild,day,JSON.stringify(market.prices),now).run();
 await env.DB.prepare(`INSERT OR IGNORE INTO stock_dividends(guild,user,day,amount,eligible_value,at)
  SELECT l.guild,l.user,?,MIN(500,CAST(SUM(l.remaining*CAST(json_extract(m.prices,'$.'||l.symbol) AS INTEGER))/100 AS INTEGER)),SUM(l.remaining*CAST(json_extract(m.prices,'$.'||l.symbol) AS INTEGER)),?
  FROM stock_lots l JOIN stock_dividend_days m ON m.guild=l.guild AND m.day=? WHERE l.guild=? AND l.remaining>0 AND l.at<=? GROUP BY l.guild,l.user HAVING SUM(l.remaining*CAST(json_extract(m.prices,'$.'||l.symbol) AS INTEGER))>=100`)
  .bind(day,now,day,market.guild,boundary-STOCK_HOLD).run();
}
async function captureNews(env:KpEnv,market:Market,now:number){
 const since=Math.max(market.startedAt,now-86400000),guild=market.guild;
 const tables=new Set((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{name:string}>()).results.map(r=>r.name));
 // Fixed source tables only; no display names, webhook text or browser-submitted events.
 if(tables.has('kp_events'))await env.DB.prepare(`INSERT OR IGNORE INTO stock_news(guild,id,symbol,label,bps,at) SELECT guild,'valo:'||match||':'||outcome,'keso',CASE WHEN outcome='win' THEN 'VALORANTで勝利' ELSE 'VALORANTで敗戦' END,CASE WHEN outcome='win' THEN 40 ELSE -30 END,MAX(at) FROM kp_events WHERE guild=? AND at>=? AND outcome IN('win','loss') GROUP BY guild,match,outcome`).bind(guild,since).run();
 for(const table of ['kp_quiz_events','kp_quiz_ranked_extra'])if(tables.has(table))await env.DB.prepare(`INSERT OR IGNORE INTO stock_news(guild,id,symbol,label,bps,at) SELECT guild,'quiz:'||game,'riso','QUIZのプレイを記録',15,completed_at FROM ${table} WHERE guild=? AND completed_at>=?`).bind(guild,since).run();
 // Settlement delta is gross payout; the stake was debited when the ticket was bought.
 // Match only the bets settled by this operation, then subtract their stakes.
 await env.DB.prepare(`INSERT OR IGNORE INTO stock_news(guild,id,symbol,label,bps,at)
  SELECT guild,'race:'||user||':'||id,'yuya',CASE WHEN net>0 THEN '競馬で大きな利益' ELSE '競馬で大きな損失' END,CASE WHEN net>0 THEN 50 ELSE -40 END,at FROM (
   SELECT o.guild,o.user,o.id,o.at,SUM(CAST(json_extract(b.value,'$.payout') AS INTEGER)-CAST(json_extract(b.value,'$.amount') AS INTEGER)) AS net
   FROM kp_operations o JOIN json_each(o.response,'$.result.settled') r JOIN json_each(o.state,'$.raceBets') b ON json_extract(b.value,'$.id')=json_extract(r.value,'$.id')
   WHERE o.guild=? AND o.at>=? AND o.id LIKE 'race-settle:%' GROUP BY o.guild,o.user,o.id,o.at
  ) WHERE ABS(net)>=5000`).bind(guild,since).run();
 await env.DB.prepare(`INSERT OR IGNORE INTO stock_news(guild,id,symbol,label,bps,at) SELECT guild,'trades:'||CAST(at/300000 AS INTEGER),'yano','株の売買が活発',15,MAX(at) FROM stock_trades WHERE guild=? AND at>=? GROUP BY guild,CAST(at/300000 AS INTEGER) HAVING COUNT(*)>=5`).bind(guild,since).run();
}
export function nextStockPrices(prices:Record<string,number>,news:Array<{symbol:string;bps:number}>,draw:()=>number){
 const volatility:Record<string,number>={keso:60,riso:100,yuya:200,yano:50};
 return Object.fromEntries(IDS.map(id=>{
  const impact=Math.max(-250,Math.min(250,news.filter(n=>n.symbol===id).reduce((sum,n)=>sum+n.bps,0)));
  const noise=Math.round((draw()*2-1)*volatility[id]);
  return [id,Math.max(20,Math.min(10000000,Math.round(prices[id]*(10000+impact+noise)/10000)))];
 }));
}
const random=()=>{const v=new Uint32Array(1);crypto.getRandomValues(v);return v[0]/4294967296;};
export async function tickStocks(env:KpEnv,market:Market,now=Date.now(),draw:()=>number=random){
 if(now-market.at<STOCK_INTERVAL)return market;
 await captureNews(env,market,now);
 const pending=(await env.DB.prepare('SELECT id,symbol,label,bps,at FROM stock_news WHERE guild=? AND applied_version IS NULL ORDER BY at,id LIMIT 40').bind(market.guild).all<{id:string;symbol:string;label:string;bps:number;at:number}>()).results;
 const used=(await env.DB.prepare("SELECT symbol,SUM(ABS(applied_bps)) AS total,SUM(CASE WHEN id LIKE 'trades:%' THEN ABS(applied_bps) ELSE 0 END) AS trades FROM stock_news WHERE guild=? AND applied_at>=? GROUP BY symbol").bind(market.guild,Math.floor(now/STOCK_HOLD)*STOCK_HOLD).all<{symbol:string;total:number;trades:number}>()).results;
 const budgets=new Map(IDS.map(id=>[id,{day:300-(used.find(r=>r.symbol===id)?.total??0),tick:250,trades:30-(used.find(r=>r.symbol===id)?.trades??0)}]));
 const effective=pending.map(n=>{const b=budgets.get(n.symbol);if(!b)return {...n,bps:0};const trading=n.id.startsWith('trades:');const size=Math.max(0,Math.min(Math.abs(n.bps),b.day,b.tick,trading?b.trades:Infinity));b.day-=size;b.tick-=size;if(trading)b.trades-=size;return {...n,bps:Math.sign(n.bps)*size};});
 const prices=nextStockPrices(market.prices,effective,draw),history=Object.fromEntries(IDS.map(id=>[id,[...(market.history[id]??[]),prices[id]].slice(-48)]));
 const token=crypto.randomUUID(),version=market.version+1,guard='EXISTS(SELECT 1 FROM stock_markets WHERE guild=? AND token=?)';
 const commands=[env.DB.prepare('UPDATE stock_markets SET version=?,prices=?,history=?,at=?,token=? WHERE guild=? AND version=?').bind(version,JSON.stringify(prices),JSON.stringify(history),now,token,market.guild,market.version),
  env.DB.prepare(`INSERT OR IGNORE INTO stock_ticks SELECT ?,?,?,? WHERE ${guard}`).bind(market.guild,version,JSON.stringify(prices),now,market.guild,token)];
 for(const n of effective)commands.push(env.DB.prepare(`UPDATE stock_news SET applied_version=?,applied_bps=?,applied_at=? WHERE guild=? AND id=? AND applied_version IS NULL AND ${guard}`).bind(version,n.bps,now,market.guild,n.id,market.guild,token));
 await env.DB.batch(commands);
 return read(env,market.guild);
}
export async function prepareStocks(env:KpEnv,guild:string,user?:string,now=Date.now()){
 await ensureStocks(env);
 const prices=Object.fromEntries(STOCKS.map(s=>[s.id,s.initialPrice])),history=Object.fromEntries(STOCKS.map(s=>[s.id,[s.initialPrice]]));
 await env.DB.prepare('INSERT OR IGNORE INTO stock_markets VALUES(?,0,?,?,?,?,?)').bind(guild,JSON.stringify(prices),JSON.stringify(history),now,now,'initial').run();
 let market=await read(env,guild);
 const missing=(await env.DB.prepare('SELECT s.user FROM kp_state s LEFT JOIN stock_accounts a ON a.guild=s.guild AND a.user=s.user WHERE s.guild=? AND a.user IS NULL LIMIT 25').bind(guild).all<{user:string}>()).results;
 for(const row of missing)await migrateStocks(env,market,row.user,now);
 if(user&&!missing.some(r=>r.user===user))await migrateStocks(env,market,user,now);
 await payStockDividends(env,market,now);
 market=await tickStocks(env,market,now);
 return market;
}
export async function stockBenefits(env:KpEnv,market:Market,user:string,now=Date.now()):Promise<StockBenefits>{
 const lots=(await env.DB.prepare('SELECT symbol,remaining FROM stock_lots WHERE guild=? AND user=? AND remaining>0 AND at<=?').bind(market.guild,user,now-STOCK_HOLD).all<{symbol:string;remaining:number}>()).results;
 const value=lots.reduce((sum,l)=>sum+l.remaining*market.prices[l.symbol],0);
 return {eligibleValue:value,percent:value>=50000?5:value>=10000?3:0,heldHours:24};
}
export async function stockView(env:KpEnv,market:Market,user?:string,now=Date.now()){
 const news=(await env.DB.prepare('SELECT symbol,label,applied_bps AS bps,at FROM stock_news WHERE guild=? AND applied_version IS NOT NULL AND applied_bps!=0 ORDER BY at DESC,id DESC LIMIT 12').bind(market.guild).all()).results;
 const ticks=(await env.DB.prepare('SELECT prices,at FROM stock_ticks WHERE guild=? ORDER BY version DESC LIMIT 48').bind(market.guild).all<{prices:string;at:number}>()).results.reverse().map(r=>({prices:JSON.parse(r.prices),at:r.at}));
 if(!ticks.length)ticks.push({prices:market.prices,at:market.at});
 const dividends=user?(await env.DB.prepare('SELECT day,amount,eligible_value AS eligibleValue,at FROM stock_dividends WHERE guild=? AND user=? ORDER BY day DESC LIMIT 7').bind(market.guild,user).all()).results:[];
 return {version:market.version,at:market.at,startedAt:market.startedAt,intervalMinutes:5,dividendPercent:1,dividendCap:DIVIDEND_CAP,holdHours:24,discountCap:2000,ticks,news,dividends};
}
export async function queueStockPosts(env:KpEnv&{KP_EARNINGS_WEBHOOK_URL?:string},market:Market,now=Date.now()){
 if(!env.KP_EARNINGS_WEBHOOK_URL||market.version===0)return;
 const previous=await env.DB.prepare('SELECT prices FROM stock_ticks WHERE guild=? AND version=?').bind(market.guild,market.version-1).first<{prices:string}>();
 const old=previous?JSON.parse(previous.prices):Object.fromEntries(STOCKS.map(s=>[s.id,s.initialPrice]));
 const slot=Math.floor(now/(30*60_000));
 for(const s of STOCKS){
  const change=(market.prices[s.id]/old[s.id]-1)*100;
  if(Math.abs(change)<3)continue;
  const info=await env.DB.prepare('SELECT MAX(at) AS last FROM stock_announcements WHERE guild=? AND symbol=?').bind(market.guild,s.id).first<{last:number|null}>();if(info?.last&&now-info.last<30*60_000)continue;
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM stock_announcements WHERE guild=? AND at>=?').bind(market.guild,Math.floor(now/86400000)*86400000).first<{n:number}>();if((count?.n??0)>=8)return;
  const body=JSON.stringify({content:`📈 **${s.name} ${change>0?'急騰':'急落'}**\n${market.prices[s.id].toLocaleString('ja-JP')} KP（${change>0?'+':''}${change.toFixed(1)}%）\nKESO PLAYの「株」で確認できます。`,allowed_mentions:{parse:[]}});
  await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO stock_announcements VALUES(?,?,?,?)').bind(market.guild,s.id,slot,now),
   env.DB.prepare("INSERT OR IGNORE INTO kp_posts(id,body,at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM stock_announcements WHERE guild=? AND symbol=? AND slot=?)").bind('stock:'+market.guild+':'+s.id+':'+slot,body,now,market.guild,s.id,slot),
  ]);
 }
}
