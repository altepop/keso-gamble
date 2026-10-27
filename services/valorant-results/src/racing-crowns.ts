// Crown races: a normal race renamed after something that just happened to a member (3 losses in a
// row, a broken win streak, a big KP loss...). How harsh the name is follows that person's roast level.
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { RACE_INTERVAL, crownSlotAllowed, openRaceStart } from '../../../js/racing.js';
import configuredPlayers from '../players.json' with { type: 'json' };
import type { KpEnv, KpMapping } from './kp.ts';
export type RoastLevel='mild'|'normal'|'full';
export const ROAST_LEVELS:RoastLevel[]=['mild','normal','full'];
export type CrownKind='streak3'|'streak5'|'streak10'|'stopped'|'night'|'back'|'melt';
const NAMES:Record<Exclude<RoastLevel,'mild'>,Record<CrownKind,(n:string)=>string>>={
 full:{streak3:n=>`${n}戦犯レース`,streak5:n=>`${n}をみんなで介護するレース`,streak10:n=>`${n}そろそろ引退しろレース`,stopped:n=>`${n}調子に乗った罰レース`,night:n=>`${n}もう寝ろレース`,back:n=>`${n}生きてた記念レース`,melt:n=>`${n}KP溶かし大会`},
 normal:{streak3:n=>`${n}おつかれレース`,streak5:n=>`${n}がんばれレース`,streak10:n=>`${n}ひと休みレース`,stopped:n=>`${n}連勝ストップ記念レース`,night:n=>`${n}夜ふかしレース`,back:n=>`${n}おかえりレース`,melt:n=>`${n}ドンマイ大会`},
};
const REASONS:Record<CrownKind,string>={streak3:'3連敗',streak5:'5連敗',streak10:'10連敗',stopped:'連勝ストップ',night:'深夜の連敗',back:'久しぶりの試合',melt:'競馬で大負け'};
export const MELT_LOSS=10000,BACK_GAP=7*86400000,FRESH=3*3600000;
/** Crowns need a name a person agreed to: members who registered banter get it in full; nobody is renamed at "mild". */
export function crownName(kind:CrownKind,level:RoastLevel,name:string){return level==='mild'?null:NAMES[level][kind](name.replace(/[@`*_~<>|]/g,''));}
export function defaultRoastLevel(mapping:KpMapping,user:string):RoastLevel{return mapping.accounts.some(a=>a.discordUserId===user)?'full':'mild';}
export const validRoastLevel=(value:unknown):value is RoastLevel=>ROAST_LEVELS.includes(value as RoastLevel);

const initialized=new WeakSet<object>();
export async function ensureCrowns(env:KpEnv){
 if(initialized.has(env.DB))return;
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_crowns(guild TEXT NOT NULL,race INTEGER NOT NULL,name TEXT NOT NULL,user TEXT NOT NULL,kind TEXT NOT NULL,source TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,PRIMARY KEY(guild,race))').run();
 initialized.add(env.DB);
}
export async function crownFor(env:KpEnv,guild:string,race:number){
 await ensureCrowns(env);
 return env.DB.prepare('SELECT name,user,kind FROM kp_crowns WHERE guild=? AND race=?').bind(guild,race).first<{name:string;user:string;kind:CrownKind}>();
}
async function roastLevels(env:KpEnv,mapping:KpMapping){
 const rows=(await env.DB.prepare("SELECT user,json_extract(data,'$.roastLevel') AS level FROM kp_state WHERE guild=?").bind(mapping.guildId).all<{user:string;level:string|null}>()).results;
 return (user:string):RoastLevel=>{const level=rows.find(r=>r.user===user)?.level;return validRoastLevel(level)?level:defaultRoastLevel(mapping,user);};
}
interface Event { kind:CrownKind; user:string; source:string; match?:string; riotId?:string }
/** Events from the latest recorded matches of each registered member, and from big race losses. */
export async function crownEvents(env:KpEnv,mapping:KpMapping,now:number):Promise<Event[]>{
 const events:Event[]=[];
 for(const account of mapping.accounts){
  const rows=(await env.DB.prepare("SELECT match_id,outcome,ended_at FROM notifications WHERE riot_id=? AND outcome IN ('win','loss') ORDER BY ended_at DESC,match_id DESC LIMIT 40").bind(account.riotId).all<{match_id:string;outcome:string;ended_at:number}>()).results;
  const latest=rows[0];if(!latest||latest.ended_at<now-FRESH)continue;
  const at=(kind:CrownKind,source=`${kind}:${account.riotId}:${latest.match_id}`)=>events.push({kind,user:account.discordUserId,source,match:latest.match_id,riotId:account.riotId});
  if(rows[1]&&latest.ended_at-rows[1].ended_at>=BACK_GAP)at('back');
  if(latest.outcome!=='loss')continue;
  let losses=0;while(losses<rows.length&&rows[losses].outcome==='loss')losses++;
  let wins=0;while(1+wins<rows.length&&rows[1+wins].outcome==='win')wins++;
  if(losses===3)at('streak3');else if(losses===5)at('streak5');else if(losses===10)at('streak10');
  else if(losses===1&&wins>=3)at('stopped');
  const jst=new Date(latest.ended_at+9*3600000);
  if(losses>=2&&jst.getUTCHours()<5)at('night',`night:${account.riotId}:${jst.toISOString().slice(0,10)}`);
 }
 const melts=(await env.DB.prepare("SELECT s.user,json_extract(b.value,'$.raceId') AS race,SUM(json_extract(b.value,'$.amount')) AS lost FROM kp_state s,json_each(s.data,'$.raceBets') b WHERE s.guild=? AND json_extract(b.value,'$.status')='lost' AND json_extract(b.value,'$.raceId')>? GROUP BY s.user,race HAVING lost>=?").bind(mapping.guildId,now-FRESH,MELT_LOSS).all<{user:string;race:number;lost:number}>()).results;
 for(const m of melts)events.push({kind:'melt',user:m.user,source:`melt:${m.user}:${m.race}`});
 return events;
}
/** The first free slot whose betting has not opened yet, inside the allowed hours. */
export async function nextCrownSlot(env:KpEnv,guild:string,now:number){
 const taken=new Set((await env.DB.prepare('SELECT race FROM kp_crowns WHERE guild=? AND race>?').bind(guild,now).all<{race:number}>()).results.map(r=>r.race));
 for(let race=openRaceStart(now)+RACE_INTERVAL,i=0;i<400;race+=RACE_INTERVAL,i++)if(crownSlotAllowed(race)&&!taken.has(race))return race;
 return null;
}
const memberName=(mapping:KpMapping,user:string)=>{const a=mapping.accounts.find(a=>a.discordUserId===user);return a?(configuredPlayers.find(p=>p.riotId.toLowerCase()===a.riotId.toLowerCase())?.name??a.riotId.split('#')[0]):null;};
const clock=(time:number)=>new Date(time).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
export function crownNoticeLine(name:string,race:number){return `\n🏇 ${clock(race)}発走『${name}』開催決定`;}

/** Creates crowns for new events. Each event is used once (unique source); returns the new crowns. */
export async function scheduleCrowns(env:KpEnv,mapping:KpMapping,now=Date.now()){
 await ensureCrowns(env);
 const levelOf=await roastLevels(env,mapping),created:Array<{race:number;name:string;user:string;kind:CrownKind;match?:string;riotId?:string}>=[];
 for(const e of await crownEvents(env,mapping,now)){
  const person=memberName(mapping,e.user),name=person&&crownName(e.kind,levelOf(e.user),person);
  if(!name||await env.DB.prepare('SELECT 1 FROM kp_crowns WHERE source=?').bind(e.source).first())continue;
  for(let attempt=0;attempt<3;attempt++){
   const race=await nextCrownSlot(env,mapping.guildId,now);if(race===null)break;
   const inserted=await env.DB.prepare('INSERT INTO kp_crowns(guild,race,name,user,kind,source,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').bind(mapping.guildId,race,name,e.user,e.kind,e.source,now).run();
   if(inserted.meta.changes){created.push({race,name,user:e.user,kind:e.kind,match:e.match,riotId:e.riotId});break;}
   if(await env.DB.prepare('SELECT 1 FROM kp_crowns WHERE source=?').bind(e.source).first())break;
  }
 }
 // The match result post gets a one-line notice; an already sent post is edited.
 for(const c of created)if(c.match&&c.riotId){
  const notice=await env.DB.prepare('SELECT message FROM notifications WHERE riot_id=? AND match_id=?').bind(c.riotId,c.match).first<{message:string}>();
  if(!notice||notice.message.includes('開催決定'))continue;
  const split=notice.message.lastIndexOf('\n💬 '),line=crownNoticeLine(c.name,c.race);
  const message=split<0?notice.message+line:notice.message.slice(0,split)+line+notice.message.slice(split);
  await env.DB.prepare("UPDATE notifications SET message=?,sent=CASE WHEN mode='escalation' AND outcome='draw' THEN 1 ELSE 0 END WHERE riot_id=? AND match_id=?").bind(message,c.riotId,c.match).run();
 }
 return created.map(c=>({...c,reason:REASONS[c.kind]}));
}
