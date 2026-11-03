import type { KpEnv } from './kp.ts';
// 監視状態: each scheduled job records when it last worked and when it last failed (with a short, scrubbed reason),
// and the backlog that would pile up if something stopped (unsettled bets, pending claims, unsent posts…).
// Shown to members on the Activity's 資産 screen; aggregates only, no names or amounts per person.
export const HEALTH_FEATURES:Record<string,string>={
 valorant:'VALORANT 速報・KP',mahjong_watch:'雀魂の監視',unite_watch:'ユナイトの監視',voice:'通話の計測',stock_market:'株の相場',
 horse_race:'馬主の出走・賞金',horse_gift:'馬のプレゼント',race_settlement:'競馬の精算',debt_settlement:'借KPの返済・利子',
 crown_schedule:'冠レース',mleague:'Mリーグの結果・精算',earnings_post:'稼ぎchへの投稿',race_broadcast:'競馬の実況',
};
const ready=new WeakSet<object>();
const OK_WRITE_EVERY=5*60000,okWritten=new Map<string,number>();
async function ensureHealth(env:KpEnv){
 if(ready.has(env.DB))return;
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_health(feature TEXT PRIMARY KEY,last_ok INTEGER,last_error INTEGER,error TEXT,failures INTEGER NOT NULL DEFAULT 0)').run();
 ready.add(env.DB);
}
/** A failure reason safe to show: no URLs, tokens or long numbers, at most 80 characters. */
export function scrub(error:unknown){
 const text=error instanceof Error?`${error.name}: ${error.message}`:String(error);
 return text.replace(/https?:\/\/\S+/g,'[url]').replace(/[A-Za-z0-9_\-.]{24,}/g,'[…]').replace(/\d{6,}/g,'[…]').slice(0,80);
}
/** Runs one scheduled job and records the outcome. A failure is logged as before (`<feature>_pending`) and swallowed,
 * so one job never stops the others; recording itself never throws either. */
export async function track(env:KpEnv,feature:string,job:()=>Promise<unknown>){
 let failed:unknown=null;
 try{await job();}catch(error){failed=error??Error('failed');console.warn(feature+'_pending');}
 try{
  await ensureHealth(env);const now=Date.now();
  // A success is written at most every 5 minutes per job (the cron runs every minute); failures are written at once.
  if(failed===null&&now-(okWritten.get(feature)??0)<OK_WRITE_EVERY)return;
  if(failed===null)okWritten.set(feature,now);else okWritten.delete(feature);
  if(failed===null)await env.DB.prepare('INSERT INTO kp_health(feature,last_ok,failures) VALUES(?,?,0) ON CONFLICT(feature) DO UPDATE SET last_ok=excluded.last_ok,failures=0').bind(feature,now).run();
  else await env.DB.prepare('INSERT INTO kp_health(feature,last_error,error,failures) VALUES(?,?,?,1) ON CONFLICT(feature) DO UPDATE SET last_error=excluded.last_error,error=excluded.error,failures=failures+1').bind(feature,now,scrub(failed)).run();
 }catch{console.warn('health_record_pending');}
}
async function count(env:KpEnv,sql:string,...binds:unknown[]){
 try{const row=await env.DB.prepare(sql).bind(...binds).first<{n:number|null}>();return Number(row?.n??0);}catch{return null;}
}
export async function healthReport(env:KpEnv,guild:string,now=Date.now()){
 await ensureHealth(env);
 const rows=(await env.DB.prepare('SELECT feature,last_ok,last_error,error,failures FROM kp_health').all<{feature:string;last_ok:number|null;last_error:number|null;error:string|null;failures:number}>()).results;
 const byName=new Map(rows.map(r=>[r.feature,r]));
 const features=Object.entries(HEALTH_FEATURES).map(([feature,label])=>{
  const r=byName.get(feature);
  const status=!r?'unknown':r.failures>0&&(r.last_error??0)>=(r.last_ok??0)?'failing':now-(r.last_ok??0)>10*60000?'stale':'ok';
  return {feature,label,status,lastOk:r?.last_ok??null,lastError:r?.last_error??null,error:status==='failing'?r?.error??null:null,failures:r?.failures??0};
 });
 // Unsettled bets live inside each saved wallet; count them without exposing whose they are.
 let mlBets=0,raceBets=0;const mlMatches=new Set<string>();
 try{
  for(const row of (await env.DB.prepare(`SELECT data FROM kp_state WHERE guild=? AND data LIKE '%"status":"pending"%'`).bind(guild).all<{data:string}>()).results){
   const s=JSON.parse(row.data);
   for(const b of s.mlBets??[])if(b?.status==='pending'){mlBets++;mlMatches.add(b.match);}
   for(const b of s.raceBets??[])if(b?.status==='pending')raceBets++;
  }
 }catch{console.warn('health_backlog_pending');}
 const backlog={
  mleagueBets:mlBets,mleagueMatches:mlMatches.size,raceBets,
  mahjongClaims:await count(env,"SELECT COUNT(*) AS n FROM kp_mahjong_claims WHERE guild=? AND status='pending'",guild),
  debts:await count(env,'SELECT COUNT(*) AS n FROM kp_debts WHERE guild=? AND amount>0',guild),
  earningsPosts:await count(env,'SELECT COUNT(*) AS n FROM kp_posts WHERE sent=0'),
  alertPosts:await count(env,'SELECT COUNT(*) AS n FROM mahjong_watch_posts WHERE sent=0'),
  kpInbox:await count(env,'SELECT COUNT(*) AS n FROM kp_inbox'),
  uniteErrors:await count(env,'SELECT COUNT(*) AS n FROM unite_links WHERE guild=? AND error IS NOT NULL',guild),
 };
 return {at:now,features,backlog};
}
