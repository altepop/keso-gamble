// Rare fictional market shocks (manual and automatic events use the same table,
// price mutation trigger, news history, Discord format and idempotent post queue).
import type {KpEnv} from './kp.ts';
import {prepareStocks} from './stock-market.ts';
import {ensureStockOperator,stockShockPrice} from './stock-admin.ts';
import {stockBulletin} from './stock-bulletins.ts';
// @ts-expect-error Shared browser market catalog.
import {MARKET} from '../../../js/engine.js';
// @ts-expect-error Fictional stock news catalog shared with the browser.
import {resolveStockStory} from '../../../js/stock-stories.js';
type Direction='up'|'down';
type Change={symbol:string;direction:Direction;strength:10|25|50};
type Story={headline:string;body:string};
type Plan={moves:Change[];story:Story;type:'single'|'sequel'|'sector'};
type Config={enabled:number;next_at:number;token:string};
const stocks=MARKET as {id:string;name:string;initialPrice:number}[];
const HOUR=3600000, SLOT=300000, SYSTEM_USER='000000000000000001';
const initialized=new WeakSet<object>();
const rand=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
const item=<T>(list:T[],draw:()=>number)=>list[Math.min(list.length-1,Math.floor(draw()*list.length))];
const direction=(draw:()=>number):Direction=>draw()<0.5?'up':'down';
const magnitude=(draw:()=>number):10|25|50=>{const n=draw();return n<0.72?10:n<0.97?25:50;};
const NEXT_MIN=3*HOUR,NEXT_SPAN=17*HOUR;
export const nextGuerrillaAt=(now:number,draw:()=>number)=> {
 let at=now+NEXT_MIN+Math.floor(draw()*NEXT_SPAN);
 if(draw()<0.18)at+=24*HOUR+Math.floor(draw()*16*HOUR);
 const jstHour=new Date(at+9*HOUR).getUTCHours();
 if(jstHour<8)at+=(8-jstHour)*HOUR+Math.floor(draw()*HOUR);
 return Math.ceil(at/SLOT)*SLOT;
};
export async function ensureGuerrillaSettings(env:KpEnv){
 if(initialized.has(env.DB))return;
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS stock_guerrilla_settings(guild TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 1,next_at INTEGER NOT NULL,token TEXT NOT NULL DEFAULT \'\',last_at INTEGER NOT NULL DEFAULT 0)').run();
 initialized.add(env.DB);
}
export async function guerrillaSettings(env:KpEnv,guild:string,now=Date.now()){
 await ensureGuerrillaSettings(env);
 const row=await env.DB.prepare('SELECT enabled,next_at,token FROM stock_guerrilla_settings WHERE guild=?').bind(guild).first<Config>();
 if(row)return {enabled:row.enabled===1,nextAt:row.next_at};
 return {enabled:true,nextAt:0};
}
export async function setGuerrillaEnabled(env:KpEnv,guild:string,enabled:unknown,now=Date.now()){
 if(typeof enabled!=='boolean')throw Error('自動イベントの設定を確認してください。');
 await ensureGuerrillaSettings(env);
 await env.DB.prepare(`INSERT INTO stock_guerrilla_settings(guild,enabled,next_at) VALUES(?,?,?)
 ON CONFLICT(guild) DO UPDATE SET enabled=excluded.enabled,next_at=CASE WHEN excluded.enabled=1 AND stock_guerrilla_settings.enabled=0 THEN excluded.next_at ELSE stock_guerrilla_settings.next_at END`)
  .bind(guild,enabled?1:0,nextGuerrillaAt(now,rand)).run();
 return guerrillaSettings(env,guild,now);
}
export const SECTOR_SCENARIOS:Array<{headline:string;body:string;moves:Change[]}>= [
 {headline:'KESO TOWNの大停電、関連企業の明暗分かれる',
  body:'市内の大規模停電でゲーム配信と冷蔵設備が停止。一方、石原エレクトリックには復旧用機器の注文が殺到し、VDKブラック商事はなぜか発電機を大量に保有していた。',
  moves:[{symbol:'ishi',direction:'up',strength:25},{symbol:'riso',direction:'down',strength:10},{symbol:'yuya',direction:'down',strength:25},{symbol:'vdk',direction:'up',strength:50}]},
 {headline:'巨大な焼肉イベントが街の需給を一変',
  body:'焼肉無料キャンペーンで他人の金で焼肉の予約が爆発。リソ寿司は客足が遠のき、メシウマ食堂は他店の在庫切れを喜んでいる。',
  moves:[{symbol:'tnkn',direction:'up',strength:25},{symbol:'riso',direction:'down',strength:10},{symbol:'msum',direction:'up',strength:10}]},
 {headline:'謎の新決済システム導入で街が混乱',
  body:'金融決済の統一が突然発表され、矢野ファイナンスの注文が急増。小林百貨店ではレジが停止したが、名古屋ヘンテコ発明所は代替機を急遽発表。',
  moves:[{symbol:'yano',direction:'up',strength:25},{symbol:'koba',direction:'down',strength:10},{symbol:'ngya',direction:'up',strength:10}]},
 {headline:'KESO TOWN全域で通信障害、通信株に思惑',
  body:'接続障害でゲーム配信とサービスが一時停止。KESOホールディングスには復旧需要が集中したが、ゆーやエンタメは売上見通しを引き下げた。',
  moves:[{symbol:'keso',direction:'up',strength:25},{symbol:'yuya',direction:'down',strength:25},{symbol:'ishi',direction:'up',strength:10}]}
];
export function planGuerrilla(draw:()=>number,previous?:{symbol:string;headline:string;direction:string;at:number},now=Date.now()):Plan{
 if(draw()<0.09){const choice=item(SECTOR_SCENARIOS,draw);return {moves:choice.moves,story:{headline:choice.headline,body:choice.body},type:'sector'};}
 if(previous&&now-previous.at<48*HOUR&&draw()<0.33){
  const turn=draw()<0.5,dir=turn?(previous.direction==='up'?'down':'up'):(previous.direction==='up'?'up':'down');
  const title=previous.headline.slice(0,33);
  const name=stocks.find(s=>s.id===previous.symbol)?.name??'企業';
  return {type:'sequel',moves:[{symbol:previous.symbol,direction:dir,strength:magnitude(draw)}],
   story:{headline:`【続報】${name}、${dir==='up'?'買い戻しが拡大':'売り注文が殺到'}`,
    body:`先日の「${title}」を受けて追加情報が発表された。関係者の説明をめぐり評価が分かれ、${dir==='up'?'売られすぎとの見方から買い注文が広がっている。':'先行きへの不安が拡大し、投資家が保有株を手放している。'}`}};
 }
 const stock=item(stocks,draw),dir=direction(draw),strength=magnitude(draw);
 const story=resolveStockStory(stock.id,dir,'auto',String(Math.floor(draw()*1000000000))) as Story;
 return {type:'single',moves:[{symbol:stock.id,direction:dir,strength}],story};
}
export async function runGuerrillaMarket(env:KpEnv&{KP_EARNINGS_WEBHOOK_URL?:string},guild:string,now=Date.now(),draw:()=>number=rand){
 // The bot cron runs every minute: only one out of five minutes even touches D1.
 if(Math.floor(now/60000)%5!==0||!env.KP_EARNINGS_WEBHOOK_URL)return null;
 await ensureGuerrillaSettings(env);
 const config=await env.DB.prepare('SELECT enabled,next_at,token FROM stock_guerrilla_settings WHERE guild=?').bind(guild).first<Config>();
 if(!config){
  await env.DB.prepare('INSERT OR IGNORE INTO stock_guerrilla_settings(guild,enabled,next_at) VALUES(?,1,?)').bind(guild,nextGuerrillaAt(now,draw)).run();
  return null;
 }
 if(!config.enabled||now<config.next_at)return null;
 // The story-history table is created only when an event is actually due.
 await ensureStockOperator(env);
 const previous=await env.DB.prepare('SELECT symbol,headline,direction,at FROM stock_event_headlines WHERE guild=? ORDER BY at DESC LIMIT 1')
  .bind(guild).first<{symbol:string;headline:string;direction:string;at:number}>();
 const plan=planGuerrilla(draw,previous??undefined,now);
 const market=await prepareStocks(env,guild,undefined,now);
 const session=crypto.randomUUID(),nextAt=nextGuerrillaAt(now,draw),impacts:Array<{name:string;symbol:string;before:number;after:number}>=[];
 for(const change of plan.moves){
  const before=market.prices[change.symbol],after=stockShockPrice(before,change.direction,change.strength);
  if(before===after)continue; // A price at its clamp cannot move in the requested direction.
  impacts.push({name:stocks.find(s=>s.id===change.symbol)!.name,symbol:change.symbol,before,after});
 }
 if(!impacts.length)return null;
 const bulletin=stockBulletin(impacts,plan.story.headline,plan.story.body,session);
 const statements=[
  env.DB.prepare('UPDATE stock_guerrilla_settings SET next_at=?,last_at=?,token=? WHERE guild=? AND enabled=1 AND next_at<=?')
   .bind(nextAt,now,session,guild,now)
 ];
 for(const [index,i] of impacts.entries()){
  const change=plan.moves.find(c=>c.symbol===i.symbol)!;
  const history=[...(market.history[i.symbol]??[]),i.after].slice(-48);
  const publicId=crypto.randomUUID(),opId=crypto.randomUUID();
  statements.push(env.DB.prepare(`INSERT INTO stock_admin_moves(guild,user,id,symbol,direction,strength,before_price,after_price,market_version,history,at)
   SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM stock_guerrilla_settings WHERE guild=? AND token=?)`)
   .bind(guild,SYSTEM_USER,opId,i.symbol,change.direction,change.strength,i.before,i.after,market.version+index,
    JSON.stringify({prices:history,headline:plan.story.headline,body:plan.story.body,publicId,silent:true}),now,guild,session));
 }
 statements.push(env.DB.prepare(`INSERT OR IGNORE INTO kp_posts(id,body,at)
  SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM stock_guerrilla_settings WHERE guild=? AND token=?)`)
  .bind('market-bulletin:'+session,bulletin,now,guild,session));
 const done=await env.DB.batch(statements);
 if(!done[0].meta.changes)return null; // a concurrent cron has already claimed the event
 return {type:plan.type,count:impacts.length,nextAt}; // no operator details, no public action metadata
}
