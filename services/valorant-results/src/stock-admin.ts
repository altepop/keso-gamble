// Server-only operator control for the fictional shared KESO PLAY stock market.
// Authentication + owner authorization are enforced in kp-api.ts, never by the UI.
import type {KpEnv} from './kp.ts';
import {prepareStocks} from './stock-market.ts';
import {stockBulletin} from './stock-bulletins.ts';
// @ts-expect-error Browser and Worker share the same fictional news catalog.
import {resolveStockStory,validateCustomStory} from '../../../js/stock-stories.js';
// @ts-expect-error Shared browser's stock table.
import {MARKET} from '../../../js/engine.js';

const STOCKS=MARKET as Array<{id:string;name:string}>;
const IDS=new Set(STOCKS.map(s=>s.id));
const STRENGTHS=[10,25,50];
const MIN=20,MAX=10_000_000;
let ready=new WeakSet<object>();
export function stockShockPrice(before:number,direction:unknown,strength:unknown){
 if(!Number.isSafeInteger(before)||before<MIN||before>MAX||!['up','down'].includes(direction as string)||!STRENGTHS.includes(strength as number))
  throw Error('変動内容を確認してください。');
 const factor=direction==='up'?1+(strength as number)/100:1-(strength as number)/100;
 return Math.max(MIN,Math.min(MAX,Math.round(before*factor)));
}
export async function ensureStockOperator(env:KpEnv){
 if(ready.has(env.DB))return;
 await env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS stock_admin_moves(
   guild TEXT NOT NULL,user TEXT NOT NULL,id TEXT NOT NULL,
   symbol TEXT NOT NULL,direction TEXT NOT NULL,strength INTEGER NOT NULL,
   before_price INTEGER NOT NULL,after_price INTEGER NOT NULL,market_version INTEGER NOT NULL,
   history TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(guild,user,id)
  )`),
  // Reinstall atomically on the first operator action per Worker instance.
  // Older databases already have this trigger with a hard-coded generic title.
  // Bundling DROP + CREATE in one D1 batch keeps market updates atomic.
  // Only public, fictional story details go here; this index is also the sequel lookup.
  env.DB.prepare('CREATE TABLE IF NOT EXISTS stock_event_headlines(id TEXT PRIMARY KEY,guild TEXT NOT NULL,symbol TEXT NOT NULL,headline TEXT NOT NULL,body TEXT NOT NULL,direction TEXT NOT NULL,at INTEGER NOT NULL)'),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS stock_event_headlines_recent ON stock_event_headlines(guild,at DESC)'),
    env.DB.prepare('DROP TRIGGER IF EXISTS stock_admin_move_apply'),
  env.DB.prepare(`CREATE TRIGGER stock_admin_move_apply AFTER INSERT ON stock_admin_moves BEGIN
   INSERT OR IGNORE INTO stock_ticks(guild,version,prices,at)
    SELECT guild,version,prices,at FROM stock_markets WHERE guild=NEW.guild;
   UPDATE stock_markets
    SET prices=json_set(prices,'$.'||NEW.symbol,NEW.after_price),
        history=json_set(history,'$.'||NEW.symbol,json_extract(NEW.history,'$.prices')),
        version=version+1,token='admin:'||NEW.user||':'||NEW.id
    WHERE guild=NEW.guild AND version=NEW.market_version;
   SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'Stock market changed') END;
   DELETE FROM stock_order_quotes WHERE guild=NEW.guild AND symbol=NEW.symbol;
   INSERT INTO stock_ticks(guild,version,prices,at)
    SELECT guild,version,prices,NEW.at FROM stock_markets WHERE guild=NEW.guild;
   INSERT OR IGNORE INTO stock_news(guild,id,symbol,label,bps,at,applied_version,applied_bps,applied_at)
    VALUES(NEW.guild,'admin:'||NEW.user||':'||NEW.id,NEW.symbol,json_extract(NEW.history,'$.headline')||char(10)||json_extract(NEW.history,'$.body'),
       ROUND(10000.0*(NEW.after_price-NEW.before_price)/NEW.before_price),NEW.at,
       NEW.market_version+1,ROUND(10000.0*(NEW.after_price-NEW.before_price)/NEW.before_price),NEW.at);
   INSERT OR IGNORE INTO stock_event_headlines(id,guild,symbol,headline,body,direction,at)
    SELECT json_extract(NEW.history,'$.publicId'),NEW.guild,NEW.symbol,
      json_extract(NEW.history,'$.headline'),json_extract(NEW.history,'$.body'),NEW.direction,NEW.at
    WHERE json_extract(NEW.history,'$.publicId') IS NOT NULL;
   INSERT OR IGNORE INTO kp_posts(id,body,at)
    SELECT 'market-bulletin:'||json_extract(NEW.history,'$.publicId'),
      json_extract(NEW.history,'$.bulletin'),NEW.at
    WHERE json_extract(NEW.history,'$.bulletin') IS NOT NULL
      AND COALESCE(json_extract(NEW.history,'$.silent'),0)=0;
  END`)
 ]);
 ready.add(env.DB);
}
export async function applyStockShock(env:KpEnv,guild:string,user:string,id:string,args:Record<string,unknown>,now=Date.now()){
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(id))throw Error('操作IDが不正です。');
 if(!/^\d{15,22}$/.test(user)||!/^\d{15,22}$/.test(guild))throw Error('接続情報が不正です。');
 const symbol=args.symbol,direction=args.direction,strength=args.strength;
 const eventId=typeof args.eventId==='string'?args.eventId:'auto';
 // The server independently selects/validates the announcement. Do not trust
 // a client-provided preset text. Custom stories are restricted to the owner.
 const story=eventId==='custom'?validateCustomStory(args.headline,args.body)
  :resolveStockStory(symbol as string,direction as string,eventId,id);

 if(typeof symbol!=='string'||!IDS.has(symbol)||!['up','down'].includes(direction as string)||!STRENGTHS.includes(strength as number))
  throw Error('銘柄・方向・強さを確認してください。');
 await ensureStockOperator(env);
 for(let attempt=0;attempt<5;attempt++){
  const previous=await env.DB.prepare('SELECT symbol,direction,strength,before_price,after_price,market_version,history FROM stock_admin_moves WHERE guild=? AND user=? AND id=?')
   .bind(guild,user,id).first<{symbol:string;direction:string;strength:number;before_price:number;after_price:number;market_version:number;history:string}>();
  if(previous){
   const stored=JSON.parse(previous.history) as {headline?:string;body?:string;eventId?:string};
   if(previous.symbol!==symbol||previous.direction!==direction||previous.strength!==strength||
      (stored.headline!==undefined&&(stored.headline!==story.headline||stored.body!==story.body||stored.eventId!==eventId)))
     throw Error('操作IDが重複しています。');
   return {symbol,direction,strength,before:previous.before_price,after:previous.after_price,version:previous.market_version+1,headline:stored.headline??'運営による特別相場イベント',body:stored.body??'',replayed:true};
  }
  const market=await prepareStocks(env,guild,undefined,now);
  const before=market.prices[symbol],after=stockShockPrice(before,direction,strength);
  if(after===before)throw Error('株価が上限または下限に達しています。');
  const history=[...(market.history[symbol]??[]),after].slice(-48);
  const publicId=crypto.randomUUID();
  const bulletin=(env as KpEnv&{KP_EARNINGS_WEBHOOK_URL?:string}).KP_EARNINGS_WEBHOOK_URL
   ?stockBulletin([{symbol,name:STOCKS.find(s=>s.id===symbol)!.name,before,after}],story.headline,story.body,publicId):null;
  try{
   const result=await env.DB.prepare(`INSERT INTO stock_admin_moves(guild,user,id,symbol,direction,strength,before_price,after_price,market_version,history,at)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM stock_markets WHERE guild=? AND version=?)
    ON CONFLICT(guild,user,id) DO NOTHING`)
    .bind(guild,user,id,symbol,direction,strength,before,after,market.version,JSON.stringify({prices:history,headline:story.headline,body:story.body,eventId,publicId,bulletin}),now,guild,market.version).run();
   if(result.meta.changes)return {symbol,direction,strength,before,after,version:market.version+1,headline:story.headline,body:story.body,replayed:false};
  }catch(error){
   if(!String((error as Error)?.message).includes('Stock market changed'))throw error;
  }
 }
 throw Error('相場が同時に動きました。更新して再実行してください。');
}
