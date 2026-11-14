// Crown races: a normal race renamed after something that just happened to a member (3 losses in a
// row, a broken win streak, a big KP loss...). How harsh the name is follows that person's roast level.
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { RACE_INTERVAL, bigRaceName, fillerCrownName, crownSlotAllowed, openRaceStart, raceEvent } from '../../../js/racing.js';
import configuredPlayers from '../players.json' with { type: 'json' };
import type { KpEnv, KpMapping } from './kp.ts';
export type RoastLevel='mild'|'normal'|'full';
export const ROAST_LEVELS:RoastLevel[]=['mild','normal','full'];
export type CrownKind='streak3'|'streak5'|'streak10'|'stopped'|'night'|'back'|'melt';
export type SpecialCrownKind='vdklastdeath'|'vdkseries';
const NAMES:Record<Exclude<RoastLevel,'mild'>,Record<CrownKind,(n:string)=>string>>={
 full:{streak3:n=>`${n}戦犯レース しばくぞ杯`,streak5:n=>`${n}をみんなで介護するレース あかんかったなぁ賞`,streak10:n=>`${n}そろそろ引退しろレース 了解お兄さん杯`,stopped:n=>`${n}調子に乗った罰レース 効いてて草賞`,night:n=>`${n}もう寝ろレース マイクロスリープ杯`,back:n=>`${n}生きてた記念レース うおw杯`,melt:n=>`${n}KP溶かし大会 5億マジかw杯`},
 normal:{streak3:n=>`${n}おつかれレース 一旦な杯`,streak5:n=>`${n}がんばれレース 大丈夫だよ杯`,streak10:n=>`${n}ひと休みレース 次のVTR賞`,stopped:n=>`${n}連勝ストップ記念レース 良かったこの距離で杯`,night:n=>`${n}夜ふかしレース 寝ないチャレンジではない賞`,back:n=>`${n}おかえりレース お祭り男か杯`,melt:n=>`${n}ドンマイ大会 3がある杯`},
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
 // Big race losses (melt crowns), written when a race settles, so crowns never scan every wallet's bets.
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_crown_melts(guild TEXT NOT NULL,race INTEGER NOT NULL,user TEXT NOT NULL,lost INTEGER NOT NULL,PRIMARY KEY(guild,race,user)) WITHOUT ROWID').run();
 initialized.add(env.DB);
}
/** After a race settles: a member who lost MELT_LOSS KP or more on one race gets a melt crown event. */
export async function recordMelts(env:KpEnv,guild:string,user:string,settled:Array<{raceId:number;amount:number;status:string}>){
 const lost=new Map<number,number>();
 for(const b of settled)if(b.status==='lost')lost.set(b.raceId,(lost.get(b.raceId)??0)+b.amount);
 const melts=[...lost].filter(([,n])=>n>=MELT_LOSS);if(!melts.length)return;
 await ensureCrowns(env);
 for(const [race,n] of melts)await env.DB.prepare('INSERT OR IGNORE INTO kp_crown_melts(guild,race,user,lost) VALUES(?,?,?,?)').bind(guild,race,user,n).run();
}
export async function crownFor(env:KpEnv,guild:string,race:number){
 await ensureCrowns(env);
 return env.DB.prepare('SELECT name,user,kind FROM kp_crowns WHERE guild=? AND race=?').bind(guild,race).first<{name:string;user:string;kind:CrownKind|SpecialCrownKind}>();
}
async function roastLevels(env:KpEnv,mapping:KpMapping){
 const rows=(await env.DB.prepare("SELECT user,json_extract(data,'$.roastLevel') AS level FROM kp_state WHERE guild=?").bind(mapping.guildId).all<{user:string;level:string|null}>()).results;
 return (user:string):RoastLevel=>{const level=rows.find(r=>r.user===user)?.level;return validRoastLevel(level)?level:defaultRoastLevel(mapping,user);};
}
interface Event { kind:CrownKind; user:string; source:string; match?:string; riotId?:string }
/** Events from the latest recorded matches of each registered member, and from big race losses. */
export async function crownEvents(env:KpEnv,mapping:KpMapping,now:number):Promise<Event[]>{
 await ensureCrowns(env);
 const events:Event[]=[];
 for(const account of mapping.accounts){
  // Ten straight losses is the largest threshold. An eleventh prior result
  // distinguishes exactly ten from eleven-plus, while 3 preceding wins fit.
  // Reading 40 matches per player every monitor run is unnecessary.
  const rows=(await env.DB.prepare("SELECT match_id,outcome,ended_at FROM notifications WHERE riot_id=? AND outcome IN ('win','loss') ORDER BY ended_at DESC,match_id DESC LIMIT 11").bind(account.riotId).all<{match_id:string;outcome:string;ended_at:number}>()).results;
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
 const melts=(await env.DB.prepare('SELECT user,race FROM kp_crown_melts WHERE guild=? AND race>?').bind(mapping.guildId,now-FRESH).all<{user:string;race:number}>()).results;
 for(const m of melts)events.push({kind:'melt',user:m.user,source:`melt:${m.user}:${m.race}`});
 return events;
}
/** The first free slot whose betting has not opened yet, inside the allowed hours. */
export async function nextCrownSlot(env:KpEnv,guild:string,now:number){
 const taken=new Set((await env.DB.prepare('SELECT race FROM kp_crowns WHERE guild=? AND race>?').bind(guild,now).all<{race:number}>()).results.map(r=>r.race));
 for(let race=openRaceStart(now)+RACE_INTERVAL,i=0;i<400;race+=RACE_INTERVAL,i++)if(crownSlotAllowed(race)&&!taken.has(race))return race;
 return null;
}
// One free community-only memorial race; never touches wallet or existing race outcomes.
export const VDK_SPECIAL_NAME='VDK 0デス完走目前・終了間際の1デス葬儀杯';
export const VDK_SPECIAL_SOURCE='special:vdk-0death-lastdeath:20261102';
// Four extra guaranteed-to-run crowns in otherwise optional 15-minute slots.
// No additional cron, new race physics, odds change, or owner-funded purchase.
export const VDK_SERIES_NAMES=[
 'VDK緊急戦犯査問杯',
 'VDK反省会・再履修ステークス',
 'VDK信頼回復チャレンジ杯',
 'VDK名誉挽回か再戦犯か最終決戦',
] as const;
export const VDK_SERIES_SOURCE_PREFIX='special:vdk-four-races:20261115:';
const VDK_SERIES_FROM=Date.parse('2026-11-15T02:30:00+09:00');
const VDK_SERIES_UNTIL=Date.parse('2026-11-15T22:00:00+09:00');
const VDK_SPECIAL_FROM=Date.parse('2026-11-02T00:00:00+09:00');
const VDK_SPECIAL_UNTIL=Date.parse('2026-11-02T18:00:00+09:00');
const memberName=(mapping:KpMapping,user:string)=>{const a=mapping.accounts.find(a=>a.discordUserId===user);return a?(configuredPlayers.find(p=>p.riotId.toLowerCase()===a.riotId.toLowerCase())?.name??a.riotId.split('#')[0]):null;};
const clock=(time:number)=>new Date(time).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
export function crownNoticeLine(name:string,race:number){return `\n🏇 ${clock(race)}発走『${name}』開催決定`;}

/** Creates crowns for new events. Each event is used once (unique source); returns the new crowns. */
export async function scheduleCrowns(env:KpEnv,mapping:KpMapping,now=Date.now()){
 await ensureCrowns(env);
 // Every wallet's roast level is read only when a crown is actually being named (not on every idle minute).
 let levels:Awaited<ReturnType<typeof roastLevels>>|null=null;
 const levelOf=async(user:string)=>(levels??=await roastLevels(env,mapping))(user);
 const created:Array<{race:number;name:string;user:string;kind:CrownKind|SpecialCrownKind;match?:string;riotId?:string;special?:boolean}>=[];
 // A one-off, time-limited story event. Choose an empty slot >=30 minutes out
 // without moving regular crown races or creating anything on later dates.
 if(now>=VDK_SPECIAL_FROM&&now<VDK_SPECIAL_UNTIL){
  const subject=mapping.accounts.find(a=>memberName(mapping,a.discordUserId)?.toLowerCase()==='vdk'||a.riotId.split('#')[0].toLowerCase()==='vdk');
  if((!subject||await levelOf(subject.discordUserId)!=='mild')&&
    !await env.DB.prepare('SELECT 1 FROM kp_crowns WHERE source=?').bind(VDK_SPECIAL_SOURCE).first()){
   const taken=new Set((await env.DB.prepare('SELECT race FROM kp_crowns WHERE guild=? AND race>?').bind(mapping.guildId,now).all<{race:number}>()).results.map(r=>r.race));
   const first=Math.ceil((now+30*60000)/RACE_INTERVAL)*RACE_INTERVAL;
   for(let race=first,i=0;i<12;i++,race+=RACE_INTERVAL){
    if(bigRaceName(race)||fillerCrownName(race)||taken.has(race))continue;
    const saved=await env.DB.prepare('INSERT INTO kp_crowns(guild,race,name,user,kind,source,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING')
      .bind(mapping.guildId,race,VDK_SPECIAL_NAME,'VDK','vdklastdeath',VDK_SPECIAL_SOURCE,now).run();
    if(saved.meta.changes){created.push({race,name:VDK_SPECIAL_NAME,user:'VDK',kind:'vdklastdeath',special:true});break;}
    if(await env.DB.prepare('SELECT 1 FROM kp_crowns WHERE source=?').bind(VDK_SPECIAL_SOURCE).first())break;
   }
  }
 }
 // One-day VDK four-race event. Claim empty slots at least 30 minutes ahead,
 // spaced 30 minutes apart, so the card/field is never changed after betting opens.
 // Unique source and (guild,race) constraints make cron retries idempotent.
 if(now>=VDK_SERIES_FROM&&now<VDK_SERIES_UNTIL){
  const sourcePrefix=VDK_SERIES_SOURCE_PREFIX+mapping.guildId+':';
  const scheduled=(await env.DB.prepare('SELECT source,race FROM kp_crowns WHERE guild=? AND source LIKE ?')
   .bind(mapping.guildId,sourcePrefix+'%').all<{source:string;race:number}>()).results;
  if(scheduled.length<VDK_SERIES_NAMES.length){
   const subject=mapping.accounts.find(a=>memberName(mapping,a.discordUserId)?.toLowerCase()==='vdk'||a.riotId.split('#')[0].toLowerCase()==='vdk');
   // A registered member who has opted out of roasting is never targeted.
   if(!subject||await levelOf(subject.discordUserId)!=='mild'){
    const taken=new Set((await env.DB.prepare('SELECT race FROM kp_crowns WHERE guild=? AND race>?')
     .bind(mapping.guildId,now).all<{race:number}>()).results.map(r=>r.race));
    let earliest=Math.ceil((now+30*60000)/RACE_INTERVAL)*RACE_INTERVAL;
    for(let i=0;i<VDK_SERIES_NAMES.length;i++){
     const source=sourcePrefix+i,previous=scheduled.find(c=>c.source===source);
     if(previous){earliest=Math.max(earliest,previous.race+30*60000);continue;}
     let claimed=false;
     for(let race=earliest,attempt=0;attempt<96&&race<VDK_SERIES_UNTIL;attempt++,race+=RACE_INTERVAL){
      if(bigRaceName(race)||fillerCrownName(race)||raceEvent(race)||taken.has(race))continue;
      const saved=await env.DB.prepare('INSERT INTO kp_crowns(guild,race,name,user,kind,source,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING')
       .bind(mapping.guildId,race,VDK_SERIES_NAMES[i],subject?.discordUserId??'VDK','vdkseries',source,now).run();
      if(saved.meta.changes){
       created.push({race,name:VDK_SERIES_NAMES[i],user:subject?.discordUserId??'VDK',kind:'vdkseries',special:true});
       taken.add(race);earliest=race+30*60000;claimed=true;break;
      }
      // Another cron may have inserted the same source while we were scheduling.
      const existing=await env.DB.prepare('SELECT race FROM kp_crowns WHERE source=?').bind(source).first<{race:number}>();
      if(existing){earliest=Math.max(earliest,existing.race+30*60000);claimed=true;break;}
      taken.add(race);
     }
     if(!claimed)break;
    }
   }
  }
 }
 for(const e of await crownEvents(env,mapping,now)){
  const person=memberName(mapping,e.user);
  if(!person||await env.DB.prepare('SELECT 1 FROM kp_crowns WHERE source=?').bind(e.source).first())continue;
  const name=crownName(e.kind,await levelOf(e.user),person);if(!name)continue;
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
 return created.map(c=>({...c,reason:c.kind==='vdklastdeath'?'0デスチャレンジ終了直前の1デス事件':c.kind==='vdkseries'?'VDK戦犯特別4連戦':REASONS[c.kind]}));
}
