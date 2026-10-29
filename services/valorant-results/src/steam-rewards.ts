import defaults from '../steam-rewards.json' with {type:'json'};
import {kpHash,kpRandom} from './kp.ts';
import type {KpEnv} from './kp.ts';

export interface SteamConfig {version:string;zeroFromPercent:number;enabled:boolean;startsAt:number|null;apps:Array<{id:number;title:string}>;tiers:Array<{maxPercent:number;amount:number}>}
export type SteamEnv=KpEnv & {STEAM_WEB_API_KEY?:string;KP_STEAM_CONFIG?:string};
export interface SteamOwner {guild:string;user:string}
const ready=new WeakMap<object,Promise<void>>();
export const steamSchema=[
 `CREATE TABLE IF NOT EXISTS kp_steam_pending(hash TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,session_hash TEXT NOT NULL,expires INTEGER NOT NULL,steam TEXT,confirmed INTEGER NOT NULL DEFAULT 0)`,
 `CREATE TABLE IF NOT EXISTS kp_steam_nonces(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS kp_steam_limits(guild TEXT NOT NULL,user TEXT NOT NULL,action TEXT NOT NULL,window INTEGER NOT NULL,hits INTEGER NOT NULL,PRIMARY KEY(guild,user,action,window))`,
 `CREATE TABLE IF NOT EXISTS kp_steam_accounts(guild TEXT NOT NULL,user TEXT NOT NULL,steam TEXT NOT NULL,linked_at INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,resumed_at INTEGER NOT NULL,PRIMARY KEY(guild,user),UNIQUE(guild,steam))`,
 `CREATE TRIGGER IF NOT EXISTS kp_steam_owner_immutable BEFORE UPDATE OF user,steam ON kp_steam_accounts WHEN NEW.user!=OLD.user OR NEW.steam!=OLD.steam BEGIN SELECT RAISE(ABORT,'Steam owner cannot change'); END`,
 `CREATE TABLE IF NOT EXISTS kp_steam_games(guild TEXT NOT NULL,user TEXT NOT NULL,app INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,baseline_at INTEGER NOT NULL DEFAULT 0,baseline TEXT NOT NULL DEFAULT '[]',next_at INTEGER NOT NULL DEFAULT 0,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0,error TEXT,last_checked INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild,user,app))`,
 `CREATE TRIGGER IF NOT EXISTS kp_steam_game_limit BEFORE INSERT ON kp_steam_games WHEN NEW.active=1 AND (SELECT count(*) FROM kp_steam_games WHERE guild=NEW.guild AND user=NEW.user AND active=1)>=5 BEGIN SELECT RAISE(ABORT,'Steam game limit'); END`,
 `CREATE TRIGGER IF NOT EXISTS kp_steam_game_resume_limit BEFORE UPDATE OF active ON kp_steam_games WHEN NEW.active=1 AND OLD.active=0 AND (SELECT count(*) FROM kp_steam_games WHERE guild=NEW.guild AND user=NEW.user AND active=1)>=5 BEGIN SELECT RAISE(ABORT,'Steam game limit'); END`,
 `CREATE TABLE IF NOT EXISTS kp_steam_events(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,steam TEXT NOT NULL,app INTEGER NOT NULL,achievement TEXT NOT NULL,title TEXT NOT NULL,percent REAL NOT NULL CHECK(percent BETWEEN 0 AND 100),amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>=0),policy TEXT NOT NULL,unlocked_at INTEGER NOT NULL,at INTEGER NOT NULL,UNIQUE(guild,steam,app,achievement))`,
 `CREATE INDEX IF NOT EXISTS kp_steam_history ON kp_steam_events(guild,user,at DESC)`,
 `CREATE TRIGGER IF NOT EXISTS kp_steam_apply AFTER INSERT ON kp_steam_events WHEN NEW.amount>0 BEGIN INSERT INTO kp_ledger(id,guild,user,delta,kind,at) VALUES(NEW.id,NEW.guild,NEW.user,NEW.amount,'steam',NEW.at); END`,
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
 if(!c||c.zeroFromPercent!==50||typeof c.enabled!=='boolean'||typeof c.version!=='string'||! /^[a-zA-Z0-9._-]{1,64}$/.test(c.version)||!(c.startsAt===null||Number.isSafeInteger(c.startsAt)&&c.startsAt>0)||!Array.isArray(c.apps)||c.apps.length>100||c.apps.some((a:{id:number;title:string})=>!a||!Number.isSafeInteger(a.id)||a.id<=0||typeof a.title!=='string'||!a.title.trim()||a.title.length>120)||new Set(c.apps.map((a:{id:number})=>a.id)).size!==c.apps.length||!Array.isArray(c.tiers)||c.tiers.length!==4||c.tiers.some((t:{maxPercent:number;amount:number},i:number)=>!t||t.maxPercent!==[0.1,1,10,100][i]||!Number.isSafeInteger(t.amount)||t.amount<=0||t.amount>1000000)||c.enabled&&(!c.startsAt||!c.apps.length))throw Error('Steamの報酬設定を確認してください。');
 return c;
}
export function steamAmount(c:SteamConfig,percent:number){if(!Number.isFinite(percent)||percent<0||percent>100)throw Error('Invalid Steam rarity');if(percent>=c.zeroFromPercent)return 0;return c.tiers.find(t=>percent<=t.maxPercent)!.amount;}
export function validSteamId(id:unknown):id is string{return typeof id==='string'&&/^\d{17}$/.test(id)&&BigInt(id)>=76561197960265728n&&BigInt(id)<=76561202255233023n;}
export class SteamReadError extends Error {code:string;delay:number;constructor(code:string,delay=15*60000){super(code);this.code=code;this.delay=delay;}}
export async function steamJson(path:string,params:Record<string,string|number>,env:SteamEnv,send:typeof fetch=fetch){
 const url=new URL('https://api.steampowered.com/'+path);for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));if(!env.STEAM_WEB_API_KEY)throw new SteamReadError('configuration');url.searchParams.set('key',env.STEAM_WEB_API_KEY);
 let r:Response;try{r=await send(url.toString(),{redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw new SteamReadError('network');}
 if(r.status===429)throw new SteamReadError('rate_limited',60*60000);if(!r.ok)throw new SteamReadError('private_or_unavailable');
 const reader=r.body?.getReader();if(!reader)throw new SteamReadError('invalid_response');const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const n=await reader.read();if(n.done)break;size+=n.value.length;if(size>2*1024*1024){await reader.cancel();throw Error('large');}chunks.push(n.value);}const bytes=new Uint8Array(size);let at=0;for(const b of chunks){bytes.set(b,at);at+=b.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}catch{throw new SteamReadError('invalid_response');}
}
export interface SteamAchievement {apiname:string;achieved:number;unlocktime:number}
export async function playerAchievements(env:SteamEnv,steam:string,app:number,send:typeof fetch=fetch):Promise<SteamAchievement[]>{
 const data=await steamJson('ISteamUserStats/GetPlayerAchievements/v1/',{steamid:steam,appid:app,l:'japanese'},env,send);const p=data?.playerstats;
 if(p?.success!==true||p.steamID!==steam||!Array.isArray(p.achievements)||p.achievements.length>5000||p.achievements.some((a:SteamAchievement)=>!a||typeof a.apiname!=='string'||!a.apiname||a.apiname.length>128||/[\x00-\x1f\x7f]/.test(a.apiname)||![0,1].includes(a.achieved)||!Number.isSafeInteger(a.unlocktime)||a.unlocktime<0)||new Set(p.achievements.map((a:SteamAchievement)=>a.apiname)).size!==p.achievements.length)throw new SteamReadError('private_or_unavailable');return p.achievements;
}
export async function steamView(env:SteamEnv,owner:SteamOwner){
 const c=steamConfig(env);await ensureSteam(env);
 const account=await env.DB.prepare('SELECT steam,active FROM kp_steam_accounts WHERE guild=? AND user=?').bind(owner.guild,owner.user).first<{steam:string;active:number}>();
 const games=(await env.DB.prepare('SELECT app,active,baseline_at AS baselineAt,last_checked AS lastChecked,error FROM kp_steam_games WHERE guild=? AND user=?').bind(owner.guild,owner.user).all()).results;
 return {available:Boolean(env.STEAM_WEB_API_KEY),enabled:c.enabled&&!!env.STEAM_WEB_API_KEY,account:account?{steamId:account.steam,active:!!account.active}:null,apps:c.apps,tiers:c.tiers,zeroFromPercent:c.zeroFromPercent,games};
}
export async function chooseSteamGame(env:SteamEnv,owner:SteamOwner,app:number,active:boolean,send:typeof fetch=fetch){
 const c=steamConfig(env);if(!c.apps.some(a=>a.id===app))throw Error('対象のSteamゲームを選んでください。');await ensureSteam(env);
 const account=await env.DB.prepare('SELECT steam FROM kp_steam_accounts WHERE guild=? AND user=? AND active=1').bind(owner.guild,owner.user).first<{steam:string}>();if(!account)throw Error('先にSteamアカウントを接続してください。');
 if(!active){await env.DB.prepare('UPDATE kp_steam_games SET active=0,lease=NULL,lease_until=0 WHERE guild=? AND user=? AND app=?').bind(owner.guild,owner.user,app).run();return;}
 await steamLimit(env,owner,'game',10);
 // A newly selected or resumed game gets a fresh server snapshot. Old achievements never become a windfall.
 const data=await steamJson('IPlayerService/GetOwnedGames/v1/',{steamid:account.steam,include_played_free_games:1,include_free_sub:1},env,send);
 if(!Array.isArray(data?.response?.games)||!data.response.games.some((g:{appid:number})=>g.appid===app))throw Error('Steamのゲーム詳細を公開し、所持している対象ゲームを選んでください。');
 let achievements:SteamAchievement[];try{achievements=await playerAchievements(env,account.steam,app,send);}catch{throw Error('Steamの実績を取得できません。プロフィールとゲーム詳細の公開設定を確認し、しばらくしてから試してください。');}
 const now=Date.now(),baseline=JSON.stringify(achievements.filter(a=>a.achieved===1).map(a=>a.apiname));
 const existing=await env.DB.prepare('SELECT active FROM kp_steam_games WHERE guild=? AND user=? AND app=?').bind(owner.guild,owner.user,app).first<{active:number}>();if(existing?.active)return;
 try{await env.DB.prepare(`INSERT INTO kp_steam_games(guild,user,app,baseline_at,baseline,next_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM kp_steam_accounts WHERE guild=? AND user=? AND active=1 AND steam=?) ON CONFLICT(guild,user,app) DO UPDATE SET active=1,baseline_at=excluded.baseline_at,baseline=excluded.baseline,next_at=excluded.next_at,error=NULL,lease=NULL,lease_until=0 WHERE kp_steam_games.active=0`).bind(owner.guild,owner.user,app,now,baseline,now,owner.guild,owner.user,account.steam).run();}catch{throw Error('監視できるSteamゲームは同時に5本までです。');}
}
interface GameJob {guild:string;user:string;app:number;baseline_at:number;baseline:string;steam:string;linked_at:number;resumed_at:number}
/** One game per cron: at most 3 Web API calls; leases make overlapping crons safe. */
export async function monitorSteam(env:SteamEnv,guild:string,send:typeof fetch=fetch,clock=Date.now){
 const c=steamConfig(env);if(!c.enabled||!c.startsAt||!env.STEAM_WEB_API_KEY)return;await ensureSteam(env);
 const now=clock(),lease=kpRandom();
 const row=await env.DB.prepare(`UPDATE kp_steam_games SET lease=?,lease_until=? WHERE (guild,user,app)=(SELECT g.guild,g.user,g.app FROM kp_steam_games g JOIN kp_steam_accounts a ON a.guild=g.guild AND a.user=g.user WHERE g.guild=? AND g.active=1 AND a.active=1 AND g.next_at<=? AND g.lease_until<? AND g.app IN (${c.apps.map(()=>'?').join(',')}) ORDER BY g.next_at,g.user,g.app LIMIT 1) RETURNING guild,user,app,baseline_at,baseline`).bind(lease,now+120000,guild,now,now,...c.apps.map(a=>a.id)).first<Omit<GameJob,'steam'|'linked_at'|'resumed_at'>>();if(!row)return;
 try{
  const a=await env.DB.prepare('SELECT steam,linked_at,resumed_at FROM kp_steam_accounts WHERE guild=? AND user=? AND active=1').bind(guild,row.user).first<{steam:string;linked_at:number;resumed_at:number}>();if(!a)throw new SteamReadError('disconnected');const job={...row,...a};
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
   let incomplete=false;const paid=[];
   for(const achievement of candidates){
    if(!names.has(achievement.apiname)||!rates.has(achievement.apiname)){incomplete=true;continue;}
    const percent=rates.get(achievement.apiname)!,id='steam:'+guild+':'+a.steam+':'+job.app+':'+await kpHash(achievement.apiname);
    if(awarded.has(achievement.apiname))continue;
    if(paid.length>=20){incomplete=true;break;}
    // The insert guard and ledger trigger share a transaction. Unlink/stop during an API call cancels credit.
    await env.DB.prepare(`INSERT INTO kp_steam_events SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM kp_steam_games g JOIN kp_steam_accounts a ON a.guild=g.guild AND a.user=g.user WHERE g.guild=? AND g.user=? AND g.app=? AND g.active=1 AND a.active=1 AND a.steam=? AND g.lease=? AND g.lease_until>=?) ON CONFLICT(guild,steam,app,achievement) DO NOTHING`).bind(id,guild,job.user,a.steam,job.app,achievement.apiname,names.get(achievement.apiname)!,percent,steamAmount(c,percent),c.version,achievement.unlocktime*1000,now,guild,job.user,job.app,a.steam,lease,clock()).run();paid.push(id);
   }
   await env.DB.prepare('UPDATE kp_steam_games SET next_at=?,last_checked=?,error=?,lease=NULL,lease_until=0 WHERE guild=? AND user=? AND app=? AND lease=?').bind(now+(incomplete?60000:15*60000),now,incomplete?'missing_or_pending':null,guild,job.user,job.app,lease).run();
  }else await env.DB.prepare('UPDATE kp_steam_games SET next_at=?,last_checked=?,error=NULL,lease=NULL,lease_until=0 WHERE guild=? AND user=? AND app=? AND lease=?').bind(now+15*60000,now,guild,job.user,job.app,lease).run();
 }catch(e){const error=e instanceof SteamReadError?e:new SteamReadError('retry_pending');await env.DB.prepare('UPDATE kp_steam_games SET next_at=?,error=?,lease=NULL,lease_until=0 WHERE guild=? AND user=? AND app=? AND lease=?').bind(now+error.delay,error.code,guild,row.user,row.app,lease).run();}
}
