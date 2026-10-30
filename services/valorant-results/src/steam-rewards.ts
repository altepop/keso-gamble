import defaults from '../steam-rewards.json' with {type:'json'};
import {kpHash,kpRandom} from './kp.ts';
import type {KpEnv} from './kp.ts';

export const STEAM_MIN_PLAYTIME_MINUTES=120;
export interface SteamConfig {version:string;dailyCap:number;minPlaytimeMinutes:number;paidGamesOnly:boolean;enabled:boolean;startsAt:number|null;tiers:Array<{maxPercent:number;amount:number}>}
export type SteamEnv=KpEnv & {STEAM_WEB_API_KEY?:string;KP_STEAM_CONFIG?:string};
export interface SteamOwner {guild:string;user:string}
const ready=new WeakMap<object,Promise<void>>();
export const steamSchema=[
 `CREATE TABLE IF NOT EXISTS kp_steam_pending(hash TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,session_hash TEXT NOT NULL,expires INTEGER NOT NULL,steam TEXT,confirmed INTEGER NOT NULL DEFAULT 0)`,
 `CREATE TABLE IF NOT EXISTS kp_steam_nonces(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS kp_steam_limits(guild TEXT NOT NULL,user TEXT NOT NULL,action TEXT NOT NULL,window INTEGER NOT NULL,hits INTEGER NOT NULL,PRIMARY KEY(guild,user,action,window))`,
 `CREATE TABLE IF NOT EXISTS kp_steam_accounts(guild TEXT NOT NULL,user TEXT NOT NULL,steam TEXT NOT NULL,linked_at INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,resumed_at INTEGER NOT NULL,PRIMARY KEY(guild,user),UNIQUE(guild,steam))`,
 `CREATE TRIGGER IF NOT EXISTS kp_steam_owner_immutable BEFORE UPDATE OF user,steam ON kp_steam_accounts WHEN NEW.user!=OLD.user OR NEW.steam!=OLD.steam BEGIN SELECT RAISE(ABORT,'Steam owner cannot change'); END`,
 `CREATE TABLE IF NOT EXISTS kp_steam_games(guild TEXT NOT NULL,user TEXT NOT NULL,app INTEGER NOT NULL,title TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,baseline_at INTEGER NOT NULL DEFAULT 0,baseline TEXT NOT NULL DEFAULT '[]',next_at INTEGER NOT NULL DEFAULT 0,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0,error TEXT,last_checked INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild,user,app))`,
 `CREATE TRIGGER IF NOT EXISTS kp_steam_game_limit BEFORE INSERT ON kp_steam_games WHEN NEW.active=1 AND (SELECT count(*) FROM kp_steam_games WHERE guild=NEW.guild AND user=NEW.user AND active=1)>=5 BEGIN SELECT RAISE(ABORT,'Steam game limit'); END`,
 `CREATE TRIGGER IF NOT EXISTS kp_steam_game_resume_limit BEFORE UPDATE OF active ON kp_steam_games WHEN NEW.active=1 AND OLD.active=0 AND (SELECT count(*) FROM kp_steam_games WHERE guild=NEW.guild AND user=NEW.user AND active=1)>=5 BEGIN SELECT RAISE(ABORT,'Steam game limit'); END`,
 `CREATE TABLE IF NOT EXISTS kp_steam_daily(guild TEXT NOT NULL,user TEXT NOT NULL,day TEXT NOT NULL,amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount BETWEEN 0 AND 5000),PRIMARY KEY(guild,user,day))`,
 `CREATE TABLE IF NOT EXISTS kp_steam_events(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,steam TEXT NOT NULL,app INTEGER NOT NULL,achievement TEXT NOT NULL,title TEXT NOT NULL,percent REAL NOT NULL CHECK(percent BETWEEN 0 AND 100),requested INTEGER NOT NULL CHECK(typeof(requested)='integer' AND requested>0),amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount BETWEEN 0 AND requested),policy TEXT NOT NULL,unlocked_at INTEGER NOT NULL,at INTEGER NOT NULL,UNIQUE(guild,steam,app,achievement))`,
 `CREATE TABLE IF NOT EXISTS kp_steam_notice_items(seq INTEGER PRIMARY KEY AUTOINCREMENT,event TEXT NOT NULL UNIQUE,guild TEXT NOT NULL,user TEXT NOT NULL,at INTEGER NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS kp_steam_notice_user ON kp_steam_notice_items(guild,user,seq)`,
 `CREATE TRIGGER IF NOT EXISTS kp_steam_notice AFTER INSERT ON kp_steam_events BEGIN INSERT INTO kp_steam_notice_items(event,guild,user,at) VALUES(NEW.id,NEW.guild,NEW.user,NEW.at); END`,
 `CREATE INDEX IF NOT EXISTS kp_steam_history ON kp_steam_events(guild,user,at DESC)`,
 `CREATE TRIGGER IF NOT EXISTS kp_steam_cap_guard BEFORE INSERT ON kp_steam_events WHEN NEW.amount!=min(NEW.requested,max(0,5000-COALESCE((SELECT amount FROM kp_steam_daily WHERE guild=NEW.guild AND user=NEW.user AND day=strftime('%Y-%m-%d',NEW.at/1000,'unixepoch')),0))) BEGIN SELECT RAISE(ABORT,'Steam daily cap'); END`,
 `CREATE TRIGGER IF NOT EXISTS kp_steam_apply AFTER INSERT ON kp_steam_events WHEN NEW.amount>0 BEGIN INSERT INTO kp_steam_daily(guild,user,day,amount) VALUES(NEW.guild,NEW.user,strftime('%Y-%m-%d',NEW.at/1000,'unixepoch'),NEW.amount) ON CONFLICT(guild,user,day) DO UPDATE SET amount=amount+excluded.amount; INSERT INTO kp_ledger(id,guild,user,delta,kind,at) VALUES(NEW.id,NEW.guild,NEW.user,NEW.amount,'steam',NEW.at); END`,
];
export async function ensureSteam(env:SteamEnv){
 let job=ready.get(env.DB);if(!job){job=env.DB.batch(steamSchema.map(s=>env.DB.prepare(s))).then(()=>{});ready.set(env.DB,job);job.catch(()=>ready.delete(env.DB));}await job;
}
export async function steamLimit(env:SteamEnv,owner:SteamOwner,action:string,limit:number){
 await ensureSteam(env);const window=Math.floor(Date.now()/600000);
 const row=await env.DB.prepare('INSERT INTO kp_steam_limits VALUES(?,?,?,?,1) ON CONFLICT(guild,user,action,window) DO UPDATE SET hits=hits+1 RETURNING hits').bind(owner.guild,owner.user,action,window).first<{hits:number}>();
 if(!row||row.hits>limit)throw Error('Steam接続の操作が多いため、10分ほど待ってください。');
 await env.DB.prepare('DELETE FROM kp_steam_limits WHERE guild=? AND user=? AND window<?').bind(owner.guild,owner.user,window-1).run();
}
export function steamConfig(env:SteamEnv):SteamConfig{
 const c=env.KP_STEAM_CONFIG?JSON.parse(env.KP_STEAM_CONFIG):defaults;
 if(!c||c.dailyCap!==5000||c.minPlaytimeMinutes!==STEAM_MIN_PLAYTIME_MINUTES||c.paidGamesOnly!==true||typeof c.enabled!=='boolean'||typeof c.version!=='string'||! /^[a-zA-Z0-9._-]{1,64}$/.test(c.version)||!(c.startsAt===null||Number.isSafeInteger(c.startsAt)&&c.startsAt>0)||!Array.isArray(c.tiers)||c.tiers.length!==4||c.tiers.some((t:{maxPercent:number;amount:number},i:number)=>!t||t.maxPercent!==[0.1,1,10,100][i]||!Number.isSafeInteger(t.amount)||t.amount<=0||t.amount>1000000)||c.enabled&&!c.startsAt)throw Error('Steamの報酬設定を確認してください。');
 return c;
}
export function steamAmount(c:SteamConfig,percent:number){if(!Number.isFinite(percent)||percent<0||percent>100)throw Error('Invalid Steam rarity');return c.tiers.find(t=>percent<=t.maxPercent)!.amount;}
export function validSteamId(id:unknown):id is string{return typeof id==='string'&&/^\d{17}$/.test(id)&&BigInt(id)>=76561197960265728n&&BigInt(id)<=76561202255233023n;}
export class SteamReadError extends Error {code:string;delay:number;constructor(code:string,delay=15*60000){super(code);this.code=code;this.delay=delay;}}
async function steamFetchJson(url:URL,send:typeof fetch,httpError='private_or_unavailable'){
 let r:Response;try{r=await send(url.toString(),{redirect:'manual',signal:AbortSignal.timeout(10000)});}catch{throw new SteamReadError('network');}
 if(r.status===429)throw new SteamReadError('rate_limited',60*60000);if(!r.ok)throw new SteamReadError(httpError);
 const reader=r.body?.getReader();if(!reader)throw new SteamReadError('invalid_response');const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const n=await reader.read();if(n.done)break;size+=n.value.length;if(size>2*1024*1024){await reader.cancel();throw Error('large');}chunks.push(n.value);}const bytes=new Uint8Array(size);let at=0;for(const b of chunks){bytes.set(b,at);at+=b.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}catch{throw new SteamReadError('invalid_response');}
}
export async function steamJson(path:string,params:Record<string,string|number>,env:SteamEnv,send:typeof fetch=fetch){
 const url=new URL('https://api.steampowered.com/'+path);for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));if(!env.STEAM_WEB_API_KEY)throw new SteamReadError('configuration');url.searchParams.set('key',env.STEAM_WEB_API_KEY);
 return steamFetchJson(url,send);
}
export type SteamStoreStatus='paid'|'free_game'|'temporarily_free'|'not_paid_game'|'store_unavailable';
export function steamStoreStatus(app:number,raw:unknown):SteamStoreStatus{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return 'store_unavailable';
 const record=(raw as Record<string,any>)[String(app)],data=record?.data;
 if(record?.success!==true||!data||typeof data!=='object'||Array.isArray(data)||data.steam_appid!==app||typeof data.type!=='string')return 'store_unavailable';
 if(data.type!=='game')return 'not_paid_game';
 if(data.is_free===true)return 'free_game';if(data.is_free!==false)return 'store_unavailable';
 const price=data.price_overview;
 if(!price||typeof price.currency!=='string'||! /^[A-Z]{3}$/.test(price.currency)||!Number.isSafeInteger(price.initial)||price.initial<0||!Number.isSafeInteger(price.final)||price.final<0||price.final>price.initial)return 'store_unavailable';
 if(price.final===0)return 'temporarily_free';return 'paid';
}
/** A positive public store price is not a receipt proving what this individual paid. */
export async function requirePaidSteamGame(app:number,send:typeof fetch=fetch){
 const url=new URL('https://store.steampowered.com/api/appdetails');url.search=new URLSearchParams({appids:String(app),cc:'jp',l:'japanese'}).toString();
 let raw:unknown;try{raw=await steamFetchJson(url,send,'store_unavailable');}catch(e){if(e instanceof SteamReadError&&['rate_limited','network'].includes(e.code))throw e;throw new SteamReadError('store_unavailable');}
 const status=steamStoreStatus(app,raw);if(status!=='paid')throw new SteamReadError(status);
}
const PAID_GAME_ERRORS:Record<string,string>={free_game:'無料・基本無料ゲームはSteam報酬の対象外です。',temporarily_free:'無料配布中のゲームはSteam報酬の対象外です。',not_paid_game:'体験版・DLCなどは対象外です。有料ゲーム本体を選んでください。',store_unavailable:'Steamストアで有料販売を確認できません。しばらくしてから試してください。'};
const knownFreeOrNotGame=(code:string)=>['free_game','temporarily_free','not_paid_game'].includes(code);
export interface SteamAchievement {apiname:string;achieved:number;unlocktime:number}
export interface OwnedSteamGame {id:number;title:string;playtimeMinutes:number|null}
export async function ownedSteamGames(env:SteamEnv,steam:string,send:typeof fetch=fetch):Promise<OwnedSteamGame[]>{
 const data=await steamJson('IPlayerService/GetOwnedGames/v1/',{steamid:steam,include_appinfo:1,include_played_free_games:0,include_free_sub:0},env,send);
 const games=data?.response?.games??(data?.response?.game_count===0?[]:null);
 if(!Array.isArray(games)||games.length>20000||games.some(g=>!Number.isSafeInteger(g?.appid)||g.appid<=0)||new Set(games.map(g=>g.appid)).size!==games.length)throw Error('Steamのゲーム詳細を公開し、しばらくしてから試してください。');
 return games.map(g=>({id:g.appid,title:typeof g.name==='string'&&g.name.trim()?g.name.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,120):'Steam App '+g.appid,playtimeMinutes:Number.isSafeInteger(g.playtime_forever)&&g.playtime_forever>=0?g.playtime_forever:null})).sort((a,b)=>a.title.localeCompare(b.title,'ja'));
}
export async function playerAchievements(env:SteamEnv,steam:string,app:number,send:typeof fetch=fetch):Promise<SteamAchievement[]>{
 const data=await steamJson('ISteamUserStats/GetPlayerAchievements/v1/',{steamid:steam,appid:app,l:'japanese'},env,send);const p=data?.playerstats;
 if(p?.success!==true||p.steamID!==steam||!Array.isArray(p.achievements)||p.achievements.length>5000||p.achievements.some((a:SteamAchievement)=>!a||typeof a.apiname!=='string'||!a.apiname||a.apiname.length>128||/[\x00-\x1f\x7f]/.test(a.apiname)||![0,1].includes(a.achieved)||!Number.isSafeInteger(a.unlocktime)||a.unlocktime<0)||new Set(p.achievements.map((a:SteamAchievement)=>a.apiname)).size!==p.achievements.length)throw new SteamReadError('private_or_unavailable');return p.achievements;
}
export async function steamView(env:SteamEnv,owner:SteamOwner,now=Date.now()){
 const c=steamConfig(env);await ensureSteam(env);
 const account=await env.DB.prepare('SELECT steam,active FROM kp_steam_accounts WHERE guild=? AND user=?').bind(owner.guild,owner.user).first<{steam:string;active:number}>();
 const day=new Date(now).toISOString().slice(0,10),daily=await env.DB.prepare('SELECT amount FROM kp_steam_daily WHERE guild=? AND user=? AND day=?').bind(owner.guild,owner.user,day).first<{amount:number}>();
 const games=(await env.DB.prepare('SELECT app,title,active,baseline_at AS baselineAt,last_checked AS lastChecked,error FROM kp_steam_games WHERE guild=? AND user=?').bind(owner.guild,owner.user).all<{app:number;title:string;active:number;baselineAt:number;lastChecked:number;error:string|null}>()).results;
 return {available:Boolean(env.STEAM_WEB_API_KEY),enabled:c.enabled&&!!env.STEAM_WEB_API_KEY,account:account?{steamId:account.steam,active:!!account.active}:null,apps:games.map(g=>({id:g.app,title:g.title||'Steam App '+g.app})),tiers:c.tiers,dailyCap:c.dailyCap,minPlaytimeMinutes:c.minPlaytimeMinutes,paidGamesOnly:c.paidGamesOnly,earnedToday:daily?.amount??0,remainingToday:Math.max(0,c.dailyCap-(daily?.amount??0)),day,games};
}
export async function chooseSteamGame(env:SteamEnv,owner:SteamOwner,app:number,active:boolean,send:typeof fetch=fetch){
 steamConfig(env);if(!Number.isSafeInteger(app)||app<=0)throw Error('Steamゲームを選んでください。');await ensureSteam(env);
 const account=await env.DB.prepare('SELECT steam FROM kp_steam_accounts WHERE guild=? AND user=? AND active=1').bind(owner.guild,owner.user).first<{steam:string}>();if(!account)throw Error('先にSteamアカウントを接続してください。');
 if(!active){await env.DB.prepare('UPDATE kp_steam_games SET active=0,lease=NULL,lease_until=0 WHERE guild=? AND user=? AND app=?').bind(owner.guild,owner.user,app).run();return;}
 await steamLimit(env,owner,'game',10);
 // A newly selected or resumed game gets a fresh server snapshot. Old achievements never become a windfall.
 const selected=(await ownedSteamGames(env,account.steam,send)).find(g=>g.id===app);if(!selected)throw Error('Steamのゲーム詳細を公開し、所持しているゲームを選んでください。');
 if(selected.playtimeMinutes===null)throw Error('Steamの累計プレイ時間を確認できません。プレイ時間の公開設定を確認してください。');
 if(selected.playtimeMinutes<STEAM_MIN_PLAYTIME_MINUTES)throw Error('Steamで累計2時間（120分）以上を確認できるゲームだけを監視できます。');
 try{await requirePaidSteamGame(app,send);}catch(e){throw Error(e instanceof SteamReadError?PAID_GAME_ERRORS[e.code]??'Steamストアに接続できません。しばらくしてから試してください。':'Steamストアで有料販売を確認できません。');}
 let achievements:SteamAchievement[];try{achievements=await playerAchievements(env,account.steam,app,send);}catch{throw Error('Steamの実績を取得できません。プロフィールとゲーム詳細の公開設定を確認し、しばらくしてから試してください。');}
 if(!achievements.length)throw Error('このゲームの実績を取得できません。実績対応のゲームを選んでください。');
 const now=Date.now(),baseline=JSON.stringify(achievements.filter(a=>a.achieved===1).map(a=>a.apiname));
 const existing=await env.DB.prepare('SELECT active FROM kp_steam_games WHERE guild=? AND user=? AND app=?').bind(owner.guild,owner.user,app).first<{active:number}>();if(existing?.active)return;
 try{await env.DB.prepare(`INSERT INTO kp_steam_games(guild,user,app,title,baseline_at,baseline,next_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM kp_steam_accounts WHERE guild=? AND user=? AND active=1 AND steam=?) ON CONFLICT(guild,user,app) DO UPDATE SET active=1,title=excluded.title,baseline_at=excluded.baseline_at,baseline=excluded.baseline,next_at=excluded.next_at,error=NULL,lease=NULL,lease_until=0 WHERE kp_steam_games.active=0`).bind(owner.guild,owner.user,app,selected.title,now,baseline,now,owner.guild,owner.user,account.steam).run();}catch{throw Error('監視できるSteamゲームは同時に5本までです。');}
}
interface GameJob {guild:string;user:string;app:number;baseline_at:number;baseline:string;steam:string;linked_at:number;resumed_at:number}
/** One game per cron: at most 5 requests, including fresh ownership/playtime/store checks. */
export async function monitorSteam(env:SteamEnv,guild:string,send:typeof fetch=fetch,clock=Date.now){
 const c=steamConfig(env);if(!c.enabled||!c.startsAt||!env.STEAM_WEB_API_KEY)return;await ensureSteam(env);
 const now=clock(),lease=kpRandom();
 const row=await env.DB.prepare(`UPDATE kp_steam_games SET lease=?,lease_until=? WHERE (guild,user,app)=(SELECT g.guild,g.user,g.app FROM kp_steam_games g JOIN kp_steam_accounts a ON a.guild=g.guild AND a.user=g.user WHERE g.guild=? AND g.active=1 AND a.active=1 AND g.next_at<=? AND g.lease_until<? ORDER BY g.next_at,g.user,g.app LIMIT 1) RETURNING guild,user,app,baseline_at,baseline`).bind(lease,now+120000,guild,now,now).first<Omit<GameJob,'steam'|'linked_at'|'resumed_at'>>();if(!row)return;
 try{
  const a=await env.DB.prepare('SELECT steam,linked_at,resumed_at FROM kp_steam_accounts WHERE guild=? AND user=? AND active=1').bind(guild,row.user).first<{steam:string;linked_at:number;resumed_at:number}>();if(!a)throw new SteamReadError('disconnected');const job={...row,...a};
  // Never trust the browser or the playtime captured at selection. Recheck the linked owner's library.
  let owned:OwnedSteamGame[];
  try{owned=await ownedSteamGames(env,a.steam,send);}catch(e){if(e instanceof SteamReadError)throw e;throw new SteamReadError('playtime_unavailable');}
  const selected=owned.find(g=>g.id===job.app);
  if(!selected)throw new SteamReadError('game_not_owned');
  if(selected.playtimeMinutes===null)throw new SteamReadError('playtime_unavailable');
  if(selected.playtimeMinutes<STEAM_MIN_PLAYTIME_MINUTES)throw new SteamReadError('playtime_required');
  await requirePaidSteamGame(job.app,send);
  const list=await playerAchievements(env,a.steam,job.app,send),baseline=new Set<string>(JSON.parse(job.baseline));
  if(!job.baseline_at)throw new SteamReadError('baseline_required');
  const cutoff=Math.max(c.startsAt,a.linked_at,a.resumed_at,job.baseline_at);
  const candidates=list.filter(x=>x.achieved===1&&!baseline.has(x.apiname)&&x.unlocktime*1000>cutoff&&x.unlocktime*1000<=now);
  if(candidates.length){
   const schema=await steamJson('ISteamUserStats/GetSchemaForGame/v2/',{appid:job.app,l:'japanese'},env,send);
   const rarity=await steamJson('ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/',{gameid:job.app},env,send);
   if(!Array.isArray(schema?.game?.availableGameStats?.achievements)||!Array.isArray(rarity?.achievementpercentages?.achievements))throw new SteamReadError('missing_rarity');
   const names=new Map<string,string>(),rates=new Map<string,number>();
   for(const x of schema.game.availableGameStats.achievements)if(typeof x.name==='string'&&typeof x.displayName==='string')names.set(x.name,x.displayName.slice(0,200));
   for(const x of rarity.achievementpercentages.achievements)if(typeof x.name==='string'&&(typeof x.percent==='number'||typeof x.percent==='string'&&/^\d+(\.\d+)?$/.test(x.percent))&&Number.isFinite(Number(x.percent))&&Number(x.percent)>=0&&Number(x.percent)<=100)rates.set(x.name,Number(x.percent));
   const awarded=new Set((await env.DB.prepare('SELECT achievement FROM kp_steam_events WHERE guild=? AND steam=? AND app=?').bind(guild,a.steam,job.app).all<{achievement:string}>()).results.map(e=>e.achievement));
   let incomplete=false,more=false;const paid=[];
   for(const achievement of candidates){
    if(!names.has(achievement.apiname)||!rates.has(achievement.apiname)){incomplete=true;continue;}
    const percent=rates.get(achievement.apiname)!,id='steam:'+guild+':'+a.steam+':'+job.app+':'+await kpHash(achievement.apiname);
    if(awarded.has(achievement.apiname))continue;
    if(paid.length>=20){incomplete=true;more=true;break;}
    const settledAt=clock();
    // The insert guard and ledger trigger share a transaction. Unlink/stop during an API call cancels credit.
    await env.DB.prepare(`INSERT INTO kp_steam_events SELECT ?,?,?,?,?,?,?,?,?,min(?,max(0,5000-COALESCE((SELECT amount FROM kp_steam_daily WHERE guild=? AND user=? AND day=?),0))),?,?,? WHERE EXISTS(SELECT 1 FROM kp_steam_games g JOIN kp_steam_accounts a ON a.guild=g.guild AND a.user=g.user WHERE g.guild=? AND g.user=? AND g.app=? AND g.active=1 AND a.active=1 AND a.steam=? AND g.lease=? AND g.lease_until>=?) ON CONFLICT(guild,steam,app,achievement) DO NOTHING`).bind(id,guild,job.user,a.steam,job.app,achievement.apiname,names.get(achievement.apiname)!,percent,steamAmount(c,percent),steamAmount(c,percent),guild,job.user,new Date(settledAt).toISOString().slice(0,10),c.version,achievement.unlocktime*1000,settledAt,guild,job.user,job.app,a.steam,lease,settledAt).run();paid.push(id);
   }
   await env.DB.prepare('UPDATE kp_steam_games SET next_at=?,last_checked=?,error=?,lease=NULL,lease_until=0 WHERE guild=? AND user=? AND app=? AND lease=?').bind(now+(incomplete?60000:15*60000),now,more?'batch_remaining':incomplete?'missing_or_pending':null,guild,job.user,job.app,lease).run();
  }else await env.DB.prepare('UPDATE kp_steam_games SET next_at=?,last_checked=?,error=NULL,lease=NULL,lease_until=0 WHERE guild=? AND user=? AND app=? AND lease=?').bind(now+15*60000,now,guild,job.user,job.app,lease).run();
 }catch(e){const error=e instanceof SteamReadError?e:new SteamReadError('retry_pending');await env.DB.prepare('UPDATE kp_steam_games SET next_at=?,error=?,active=CASE WHEN ? THEN 0 ELSE active END,lease=NULL,lease_until=0 WHERE guild=? AND user=? AND app=? AND lease=?').bind(now+error.delay,error.code,Number(knownFreeOrNotGame(error.code)),guild,row.user,row.app,lease).run();}
}
