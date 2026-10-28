import sealed from '../mahjong-bootstrap.encrypted.json' with {type:'json'};
import taunts from '../mahjong-taunts.json' with {type:'json'};
import {decryptKpMapping} from './kp.ts';

export interface MahjongConfig {enabled:boolean;startedAt:number;players:Array<{id:number;name:string}>;modes:number[]}
export interface MahjongEnv {DB:D1Database;DISCORD_WEBHOOK_URL?:string;KP_BOOTSTRAP_PRIVATE_KEY?:string;AMAE_KOROMO_TOKEN?:string}
interface Member {accountId:number;nickname:string;score:number}
export interface MahjongRecord {_id:string;modeId:number;startTime:number;endTime:number;players:Member[]}
const API='https://5-data.amae-koromo.com/api/v2/';
const MODES:Record<number,string>={11:'四麻・玉の間 東風',12:'四麻・玉の間 半荘',23:'三麻・玉の間 東風',24:'三麻・玉の間 半荘'};
const INTERVAL=5*60_000,LOOKBACK=7*24*3600_000;
/** The provider's key comes with a limit of one query per second; requests are spaced a little wider. */
export const PROVIDER_GAP=1100;
export const pacing={wait:(ms:number)=>new Promise<void>(done=>setTimeout(done,ms))};
const initialized=new WeakSet<object>(),configs=new Map<string,Promise<MahjongConfig>>();
export function validateMahjongConfig(value:unknown):MahjongConfig {
 const c=value as MahjongConfig;
 if(!c||typeof c.enabled!=='boolean'||!Number.isSafeInteger(c.startedAt)||c.startedAt<=0||!Array.isArray(c.players)||!c.players.length||c.players.length>10||!Array.isArray(c.modes)||!c.modes.length||c.modes.some(m=>!MODES[m]))throw Error('invalid_mahjong_config');
 if(c.players.some(p=>!Number.isSafeInteger(p.id)||p.id<=0||typeof p.name!=='string'||!p.name.trim()||p.name.length>50)||new Set(c.players.map(p=>p.id)).size!==c.players.length)throw Error('invalid_mahjong_config');
 return c;
}
async function configuration(env:MahjongEnv){
 if(!env.KP_BOOTSTRAP_PRIVATE_KEY)return null;
 const key=env.KP_BOOTSTRAP_PRIVATE_KEY;
 if(!configs.has(key)){
  const job=decryptKpMapping(key,sealed).then(c=>validateMahjongConfig(c));configs.set(key,job);job.catch(()=>configs.delete(key));
 }
 return configs.get(key)!;
}
async function ensure(env:MahjongEnv){
 if(initialized.has(env.DB))return;
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS mahjong_watch_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)'),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS mahjong_watch_posts(id TEXT PRIMARY KEY,body TEXT NOT NULL,at INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0,lease INTEGER NOT NULL DEFAULT 0,message_id TEXT)"),
 ]);initialized.add(env.DB);
}
const clean=(s:string)=>s.replace(/[@`*_~<>|\r\n]/g,'');
function pick<T>(list:T[],key:string):T {let h=2166136261;for(const c of key)h=Math.imul(h^c.charCodeAt(0),16777619);h^=h>>>16;return list[(h>>>0)%list.length];}
export function mahjongRank(record:MahjongRecord,player:number){
 // The provider preserves seat order; an earlier seat wins a tied final score.
 const sorted=record.players.map((p,seat)=>({...p,seat})).sort((a,b)=>b.score-a.score||a.seat-b.seat);
 return sorted.findIndex(p=>p.accountId===player)+1;
}
export function mahjongRoast(record:MahjongRecord,player:number){
 const p=record.players.find(p=>p.accountId===player);if(!p)throw Error('mahjong_player_absent');
 const rank=mahjongRank(record,player);
 const group=p.score<0?'bust':rank===1?'first':rank===record.players.length?'last':rank===2?'second':'third';
 return pick(taunts[group],record._id+':'+player).join('\n');
}
export function parseMahjongRecords(value:unknown,player:number,modes:number[],since:number,now:number):MahjongRecord[]{
 if(!Array.isArray(value)||value.length>100)throw Error('invalid_mahjong_records');
 return value.map((r:MahjongRecord)=>{
  if(!r||typeof r._id!=='string'||!/^[a-zA-Z0-9_-]{1,160}$/.test(r._id)||!MODES[r.modeId]||!Number.isSafeInteger(r.startTime)||!Number.isSafeInteger(r.endTime)||r.startTime<=0||r.endTime<r.startTime||r.endTime*1000>now+60_000||!Array.isArray(r.players)||r.players.length!==(r.modeId<20?4:3)||r.players.some(p=>!Number.isSafeInteger(p.accountId)||p.accountId<=0||typeof p.nickname!=='string'||!Number.isSafeInteger(p.score)||p.score< -100000||p.score>500000)||new Set(r.players.map(p=>p.accountId)).size!==r.players.length||!r.players.some(p=>p.accountId===player))throw Error('invalid_mahjong_record');
  return r;
 }).filter(r=>modes.includes(r.modeId)&&r.startTime*1000>=since).sort((a,b)=>a.startTime-b.startTime||a._id.localeCompare(b._id));
}
export function mahjongMessage(record:MahjongRecord,player:number,name:string){
 const p=record.players.find(p=>p.accountId===player);if(!p)throw Error('mahjong_player_absent');
 const time=new Date(record.endTime*1000).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
 return [`🀄 **${clean(name)}｜${mahjongRank(record,player)}着／${record.players.length}人**`,`${MODES[record.modeId]}｜${p.score.toLocaleString('ja-JP')}点｜${time} 終了`,mahjongRoast(record,player),`戦績：<https://${record.modeId<20?'amae-koromo':'ikeda'}.sapk.ch/player/${player}/${record.modeId}>`].join('\n');
}
async function state(env:MahjongEnv,key:string){return (await env.DB.prepare('SELECT value FROM mahjong_watch_state WHERE key=?').bind(key).first<{value:string}>())?.value??'';}
async function save(env:MahjongEnv,key:string,value:string|number){await env.DB.prepare('INSERT INTO mahjong_watch_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,String(value)).run();}
function webhook(env:MahjongEnv){
 if(!env.DISCORD_WEBHOOK_URL)return null;
 const url=new URL(env.DISCORD_WEBHOOK_URL);
 if(url.protocol!=='https:'||url.hostname!=='discord.com'||!/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/.test(url.pathname))throw Error('invalid_mahjong_webhook');
 return url;
}
export async function flushMahjongPosts(env:MahjongEnv,now=Date.now(),request:typeof fetch=fetch){
 const url=webhook(env);if(!url)return 0;await ensure(env);
 const rows=(await env.DB.prepare('SELECT id,body FROM mahjong_watch_posts WHERE sent=0 AND lease<=? ORDER BY at,id LIMIT 4').bind(now).all<{id:string;body:string}>()).results;
 let sent=0;
 for(const row of rows){
  const lease=now+120_000;
  const claimed=await env.DB.prepare('UPDATE mahjong_watch_posts SET lease=? WHERE id=? AND sent=0 AND lease<=?').bind(lease,row.id,now).run();
  if(!claimed.meta.changes)continue;
  try{
   const target=new URL(url);target.searchParams.set('wait','true');
   const response=await request(target,{method:'POST',headers:{'Content-Type':'application/json'},body:row.body,signal:AbortSignal.timeout(10_000)});
   if(!response.ok){
    const retry=Math.min(3600_000,Math.max(120_000,Number(response.headers.get('Retry-After'))*1000||0));
    await env.DB.prepare('UPDATE mahjong_watch_posts SET lease=? WHERE id=? AND lease=?').bind(now+retry,row.id,lease).run();await save(env,'delivery_error','discord_http_'+response.status);break;
   }
   const body=await response.json() as {id?:unknown};
   if(typeof body.id!=='string'||!/^\d{15,22}$/.test(body.id))throw Error('invalid_mahjong_discord_response');
   await env.DB.prepare('UPDATE mahjong_watch_posts SET sent=1,message_id=? WHERE id=? AND lease=?').bind(body.id,row.id,lease).run();sent++;
   await save(env,'last_sent_at',now);await save(env,'delivery_error','');
  }catch{
   // Delivery may have succeeded before an interruption: postpone, do not immediately resend.
   await env.DB.prepare('UPDATE mahjong_watch_posts SET lease=? WHERE id=? AND sent=0 AND lease=?').bind(now+15*60_000,row.id,lease).run();await save(env,'delivery_error','delivery_unconfirmed');break;
  }
 }
 return sent;
}
export async function monitorMahjong(env:MahjongEnv,now=Date.now(),override?:MahjongConfig,request:typeof fetch=fetch){
 const config=override?validateMahjongConfig(override):await configuration(env);
 if(!config?.enabled||!webhook(env))return;
 await ensure(env);
 const lease=now+4*60_000;
 const lock=await env.DB.prepare("INSERT INTO mahjong_watch_state(key,value) VALUES('lock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(mahjong_watch_state.value AS INTEGER)<=?").bind(String(lease),now).run();
 if(!lock.meta.changes)return;
 try{
  // Notifications retry independently, including when the data provider is unavailable.
  await flushMahjongPosts(env,now,request);
  if(Number(await state(env,'next_poll_at'))>now)return;
  await save(env,'next_poll_at',now+INTERVAL);await save(env,'last_attempt_at',now);
  const since=Math.max(config.startedAt,now-LOOKBACK),to=Math.ceil(now/INTERVAL)*INTERVAL;
  const headers:Record<string,string>=env.AMAE_KOROMO_TOKEN?{Authorization:'Bearer '+env.AMAE_KOROMO_TOKEN}:{};
  let first=true;
  for(const p of config.players){
   for(const table of ['pl4','pl3']){
    const modes=config.modes.filter(m=>(m<20)===(table==='pl4'));if(!modes.length)continue;
    const url=new URL(API+table+'/player_records/'+p.id+'/'+to+'/'+since);url.searchParams.set('mode',modes.join(','));url.searchParams.set('limit','100');url.searchParams.set('descending','true');
    if(!first)await pacing.wait(PROVIDER_GAP);first=false;
    const response=await request(url,{headers,signal:AbortSignal.timeout(12_000)});
    if(!response.ok){
     const reason='provider_http_'+response.status;await save(env,'error',reason);
     // Back off globally. Never rotate mirrors, bypass challenges or busy-poll 429s.
     const delay=response.status===429?Math.max(3600_000,Number(response.headers.get('Retry-After'))*1000||0):15*60_000;
     await save(env,'next_poll_at',now+Math.min(24*3600_000,delay));return;
    }
    const records=parseMahjongRecords(await response.json(),p.id,modes,since,now);
    for(const record of records){
     const id='mahjong:'+p.id+':'+record._id;
     await env.DB.prepare('INSERT OR IGNORE INTO mahjong_watch_posts(id,body,at) VALUES(?,?,?)').bind(id,JSON.stringify({content:mahjongMessage(record,p.id,p.name),allowed_mentions:{parse:[]}}),record.endTime*1000).run();
    }
   }
  }
  await save(env,'last_success_at',now);await save(env,'error','');
  await flushMahjongPosts(env,now,request);
 }catch{
  await save(env,'error','provider_or_data_unavailable');await save(env,'next_poll_at',now+15*60_000);
 }finally{
  await env.DB.prepare("DELETE FROM mahjong_watch_state WHERE key='lock' AND value=?").bind(String(lease)).run();
 }
}
export async function mahjongStatus(env:MahjongEnv){
 const config=await configuration(env);if(!config?.enabled)return {enabled:false};
 await ensure(env);
 const rows=(await env.DB.prepare("SELECT key,value FROM mahjong_watch_state WHERE key IN ('last_attempt_at','last_success_at','last_sent_at','next_poll_at','error','delivery_error')").all<{key:string;value:string}>()).results;
 const values=Object.fromEntries(rows.map(r=>[r.key,r.value]));
 const counts=await env.DB.prepare('SELECT COUNT(*) AS total,SUM(sent) AS sent FROM mahjong_watch_posts').first<{total:number;sent:number|null}>();
 return {enabled:true,authenticated:Boolean(env.AMAE_KOROMO_TOKEN),registered:config.players.length,modes:config.modes.map(m=>MODES[m]),startsAt:config.startedAt,intervalMinutes:5,lastAttemptAt:Number(values.last_attempt_at||0),lastSuccessAt:Number(values.last_success_at||0),lastSentAt:Number(values.last_sent_at||0),nextPollAt:Number(values.next_poll_at||0),error:values.error||null,deliveryError:values.delivery_error||null,pending:(counts?.total??0)-(counts?.sent??0),sent:counts?.sent??0};
}
