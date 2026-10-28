// Owned horses: bought from boxes, entered at random into races of their class, paid prizes by
// finishing place, retired after RETIRE_RACES and sellable for 10-20% of the price.
// Buying and selling ride on the wallet operation insert (one transaction with the KP change).
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { BOXES, CLASSES, MAX_OWNED, RETIRE_RACES, RUN_MS, conditionFromActivity, drawHorse, horseNickname, prizeFor, raceCard, raceClass, raceOdds, raceResult, sellValue, validHorseName } from '../../../js/racing.js';
import { crownFor, ensureCrowns } from './racing-crowns.ts';
import configuredPlayers from '../players.json' with { type: 'json' };
import { kpRandom } from './kp.ts';
import type { KpEnv, KpMapping } from './kp.ts';
export interface Entry { horseId:string; name:string; ability:number; style:number; owner:string; ownerName:string; nickname?:string|null; person?:boolean; condition?:number }
export interface Horse { id:string; owner:string; name:string; grade:number; ability:number; style:number; box:string; price:number; created_at:number; races:number; wins:number; seconds:number; thirds:number; earnings:number; retired_at:number|null; sold_at:number|null; last_race:number|null }
export const ENTRY_CHANCE=.4,REST=60*60000,CONSOLATION_RATE=.05;
const initialized=new WeakSet<object>();
export async function ensureHorses(env:KpEnv){
 if(initialized.has(env.DB))return;
 await env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_horses(id TEXT PRIMARY KEY,guild TEXT NOT NULL,owner TEXT NOT NULL,name TEXT NOT NULL,grade INTEGER NOT NULL,ability REAL NOT NULL,style INTEGER NOT NULL,box TEXT NOT NULL,price INTEGER NOT NULL,created_at INTEGER NOT NULL,races INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,seconds INTEGER NOT NULL DEFAULT 0,thirds INTEGER NOT NULL DEFAULT 0,earnings INTEGER NOT NULL DEFAULT 0,retired_at INTEGER,sold_at INTEGER,last_race INTEGER)`),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_race_fields(guild TEXT NOT NULL,race INTEGER NOT NULL,decided_at INTEGER NOT NULL,PRIMARY KEY(guild,race))'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_race_entries(guild TEXT NOT NULL,race INTEGER NOT NULL,gate_order INTEGER NOT NULL,horse TEXT NOT NULL,PRIMARY KEY(guild,race,horse))'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_entry_conditions(guild TEXT NOT NULL,race INTEGER NOT NULL,horse TEXT NOT NULL,condition INTEGER NOT NULL,PRIMARY KEY(guild,race,horse))'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_horse_runs(id TEXT PRIMARY KEY,guild TEXT NOT NULL,race INTEGER NOT NULL,horse TEXT NOT NULL,rank INTEGER NOT NULL,win_odds INTEGER NOT NULL,favourite INTEGER NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_horse_results(id TEXT PRIMARY KEY,guild TEXT NOT NULL,race INTEGER NOT NULL,horse TEXT NOT NULL,owner TEXT NOT NULL,rank INTEGER NOT NULL,prize INTEGER NOT NULL CHECK(typeof(prize)=\'integer\' AND prize>=0),at INTEGER NOT NULL,UNIQUE(guild,race,horse))'),
  // A prize credits the owner's wallet and updates the record in the same statement.
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_horse_result_apply AFTER INSERT ON kp_horse_results BEGIN
   INSERT INTO kp_ledger(id,guild,user,delta,kind,at) SELECT 'prize:'||NEW.id,NEW.guild,NEW.owner,NEW.prize,'prize',NEW.at WHERE NEW.prize>0;
   UPDATE kp_horses SET races=races+1,wins=wins+(NEW.rank=1),seconds=seconds+(NEW.rank=2),thirds=thirds+(NEW.rank=3),earnings=earnings+NEW.prize,last_race=NEW.race,retired_at=CASE WHEN retired_at IS NULL AND races+1>=${RETIRE_RACES} THEN NEW.at ELSE retired_at END WHERE id=NEW.horse;
  END`),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_horse_buy_apply AFTER INSERT ON kp_operations WHEN json_extract(NEW.response,'$.result.horse.id') IS NOT NULL BEGIN
   INSERT INTO kp_horses(id,guild,owner,name,grade,ability,style,box,price,created_at) VALUES(json_extract(NEW.response,'$.result.horse.id'),NEW.guild,NEW.user,json_extract(NEW.response,'$.result.horse.name'),json_extract(NEW.response,'$.result.horse.grade'),json_extract(NEW.response,'$.result.horse.ability'),json_extract(NEW.response,'$.result.horse.style'),json_extract(NEW.response,'$.result.horse.box'),json_extract(NEW.response,'$.result.horse.price'),NEW.at);
   SELECT CASE WHEN (SELECT COUNT(*) FROM kp_horses WHERE guild=NEW.guild AND owner=NEW.user AND sold_at IS NULL AND retired_at IS NULL)>${MAX_OWNED} THEN RAISE(ABORT,'kp_horse_limit') END;
  END`),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_horse_sell_apply AFTER INSERT ON kp_operations WHEN json_extract(NEW.response,'$.result.sold.id') IS NOT NULL BEGIN
   UPDATE kp_horses SET sold_at=NEW.at WHERE id=json_extract(NEW.response,'$.result.sold.id') AND guild=NEW.guild AND owner=NEW.user AND sold_at IS NULL AND retired_at IS NULL;
   SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'kp_horse_not_sellable') END;
  END`),
 ]);
 initialized.add(env.DB);
}
const memberName=(mapping:KpMapping,user:string)=>{const a=mapping.accounts.find(a=>a.discordUserId===user);return a?(configuredPlayers.find(p=>p.riotId.toLowerCase()===a.riotId.toLowerCase())?.name??a.riotId.split('#')[0]):'メンバー';};
const cryptoRng=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;

async function nicknames(env:KpEnv,horses:Array<{id:string;wins:number;seconds:number}>){
 const out=new Map<string,string|null>();
 for(const h of horses){
  const runs=(await env.DB.prepare('SELECT rank,win_odds AS winOdds,favourite FROM kp_horse_runs WHERE horse=? ORDER BY race DESC LIMIT 20').bind(h.id).all<{rank:number;winOdds:number;favourite:number}>()).results;
  out.set(h.id,horseNickname(h,runs.map(r=>({...r,favourite:r.favourite===1}))));
 }
 return out;
}
/** A crown race named after someone runs a horse named after them: weak, and closing late. */
export function personEntry(mapping:KpMapping,race:number,user:string):Entry{
 const name=memberName(mapping,user);
 return {horseId:'person-'+user,name:name+'号',ability:CLASSES[raceClass(race)].mean-.3,style:3,owner:user,ownerName:name,person:true};
}
/** Play in the last 24 hours (each match or quiz reward is 1; each hour in a call is 1) and whether
 * the person played at all in the last 3 days. Voice is counted per 60 KP so calls do not dominate. */
export async function activityConditions(env:KpEnv,guild:string,users:string[],now:number){
 const out=new Map<string,number>();
 for(const user of new Set(users)){
  const r=await env.DB.prepare(`SELECT SUM(CASE WHEN at>? AND kind IN ('match','quiz') THEN 1 ELSE 0 END) AS plays,SUM(CASE WHEN at>? AND kind='voice' THEN delta ELSE 0 END) AS voice,SUM(CASE WHEN kind IN ('match','quiz','voice') THEN 1 ELSE 0 END) AS any3 FROM kp_ledger WHERE guild=? AND user=? AND at>? AND at<=?`).bind(now-86400000,now-86400000,guild,user,now-3*86400000,now).first<{plays:number|null;voice:number|null;any3:number|null}>();
  out.set(user,conditionFromActivity((r?.plays??0)+Math.floor((r?.voice??0)/60),(r?.any3??0)>0));
 }
 return out;
}
export async function raceEntries(env:KpEnv,mapping:KpMapping,race:number):Promise<Entry[]>{
 await ensureHorses(env);
 const rows=(await env.DB.prepare('SELECT h.id,h.name,h.ability,h.style,h.owner,h.wins,h.seconds FROM kp_race_entries e JOIN kp_horses h ON h.id=e.horse WHERE e.guild=? AND e.race=? ORDER BY e.gate_order').bind(mapping.guildId,race).all<{id:string;name:string;ability:number;style:number;owner:string;wins:number;seconds:number}>()).results;
 const nick=await nicknames(env,rows),crown=await crownFor(env,mapping.guildId,race);
 // Conditions were fixed when the race opened; races decided before that rule keep the card's own.
 const fixed=new Map((await env.DB.prepare('SELECT horse,condition FROM kp_entry_conditions WHERE guild=? AND race=?').bind(mapping.guildId,race).all<{horse:string;condition:number}>()).results.map(r=>[r.horse,r.condition]));
 const owned:Entry[]=rows.map(h=>({horseId:h.id,name:h.name,ability:h.ability,style:h.style,owner:h.owner,ownerName:memberName(mapping,h.owner),nickname:nick.get(h.id)??null}));
 const all=crown?[personEntry(mapping,race,crown.user),...owned]:owned;
 return all.map(e=>fixed.has(e.horseId)?{...e,condition:fixed.get(e.horseId)}:e);
}
/** Decides once which owned horses run in a race. Called when betting opens, before any bet. */
export async function decideEntries(env:KpEnv,mapping:KpMapping,race:number,now=Date.now(),chance=ENTRY_CHANCE){
 await ensureHorses(env);
 if(await env.DB.prepare('SELECT 1 FROM kp_race_fields WHERE guild=? AND race=?').bind(mapping.guildId,race).first())return raceEntries(env,mapping,race);
 const size=raceCard(race).size;
 const eligible=(await env.DB.prepare(`SELECT id FROM kp_horses h WHERE guild=? AND grade=? AND sold_at IS NULL AND retired_at IS NULL AND created_at<=?
  AND NOT EXISTS(SELECT 1 FROM kp_race_entries e WHERE e.guild=h.guild AND e.horse=h.id AND e.race>? AND e.race<?)`).bind(mapping.guildId,raceClass(race),now,race-REST,race+REST).all<{id:string}>()).results.map(r=>r.id);
 const picked=eligible.filter(()=>cryptoRng()<chance).map(id=>({id,order:cryptoRng()})).sort((a,b)=>a.order-b.order).slice(0,size);
 // Each runner's condition comes from its owner's (or namesake's) play, fixed now with the entries.
 const owners=new Map((picked.length?(await env.DB.prepare(`SELECT id,owner FROM kp_horses WHERE id IN (${picked.map(()=>'?').join(',')})`).bind(...picked.map(p=>p.id)).all<{id:string;owner:string}>()).results:[]).map(r=>[r.id,r.owner]));
 const crown=await crownFor(env,mapping.guildId,race);
 const runners=[...picked.map(p=>({horse:p.id,user:owners.get(p.id)!})),...(crown?[{horse:'person-'+crown.user,user:crown.user}]:[])];
 const conditions=await activityConditions(env,mapping.guildId,runners.map(r=>r.user),now);
 // Entries, conditions and the marker go in one transaction; a concurrent decision inserts nothing.
 await env.DB.batch([
  ...runners.map(r=>env.DB.prepare('INSERT INTO kp_entry_conditions(guild,race,horse,condition) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM kp_race_fields WHERE guild=? AND race=?)').bind(mapping.guildId,race,r.horse,conditions.get(r.user)!,mapping.guildId,race)),
  ...picked.map((p,i)=>env.DB.prepare('INSERT INTO kp_race_entries(guild,race,gate_order,horse) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM kp_race_fields WHERE guild=? AND race=?)').bind(mapping.guildId,race,i,p.id,mapping.guildId,race)),
  env.DB.prepare('INSERT OR IGNORE INTO kp_race_fields(guild,race,decided_at) VALUES(?,?,?)').bind(mapping.guildId,race,now),
 ]);
 return raceEntries(env,mapping,race);
}
/** Prizes for finished races with owned or person-named horses. Each horse is paid once per race.
 * A person-named horse also brings its namesake a consolation: 5% of what others bet on it. */
export async function settleHorsePrizes(env:KpEnv,mapping:KpMapping,now=Date.now()){
 await ensureHorses(env);await ensureCrowns(env);
 const races=(await env.DB.prepare(`SELECT race FROM (SELECT e.race FROM kp_race_entries e WHERE e.guild=? AND NOT EXISTS(SELECT 1 FROM kp_horse_results r WHERE r.guild=e.guild AND r.race=e.race AND r.horse=e.horse)
  UNION SELECT c.race FROM kp_crowns c WHERE c.guild=? AND NOT EXISTS(SELECT 1 FROM kp_horse_results r WHERE r.guild=c.guild AND r.race=c.race AND r.horse='person-'||c.user)) WHERE race<=? ORDER BY race LIMIT 20`).bind(mapping.guildId,mapping.guildId,now-RUN_MS).all<{race:number}>()).results.map(r=>r.race);
 let paid=0;
 for(const race of races){
  const seed=await env.DB.prepare('SELECT seed FROM kp_races WHERE guild=? AND id=?').bind(mapping.guildId,race).first<{seed:string}>();
  if(!seed)continue;
  const entries=await raceEntries(env,mapping,race),card=raceCard(race,undefined,entries),order:number[]=raceResult(card,seed.seed).order;
  const sold=new Map((await env.DB.prepare('SELECT id,sold_at FROM kp_horses WHERE guild=? AND sold_at IS NOT NULL').bind(mapping.guildId).all<{id:string;sold_at:number}>()).results.map(r=>[r.id,r.sold_at]));
  const odds=raceOdds(card),favourite=card.horses.map((h:{number:number})=>h.number).sort((a:number,b:number)=>odds.winProb[b]-odds.winProb[a])[0];
  for(const h of card.horses.filter((h:{horseId?:string})=>h.horseId)){
   const rank=order.indexOf(h.number),soldAt=sold.get(h.horseId);
   let prize=soldAt!==undefined&&soldAt<race?0:prizeFor(card,rank);
   if(h.person){
    const others=await env.DB.prepare("SELECT COALESCE(SUM(json_extract(b.value,'$.amount')),0) AS n FROM kp_state s,json_each(s.data,'$.raceBets') b WHERE s.guild=? AND s.user!=? AND json_extract(b.value,'$.raceId')=? AND json_extract(b.value,'$.horse')=?").bind(mapping.guildId,h.owner,race,h.number).first<{n:number}>();
    prize+=Math.floor((others?.n??0)*CONSOLATION_RATE);
   }else await env.DB.prepare('INSERT OR IGNORE INTO kp_horse_runs(id,guild,race,horse,rank,win_odds,favourite) VALUES(?,?,?,?,?,?,?)').bind(`${race}:${h.horseId}`,mapping.guildId,race,h.horseId,rank+1,odds.win[h.number],h.number===favourite?1:0).run();
   const r=await env.DB.prepare('INSERT OR IGNORE INTO kp_horse_results(id,guild,race,horse,owner,rank,prize,at) VALUES(?,?,?,?,?,?,?,?)').bind(`${race}:${h.horseId}`,mapping.guildId,race,h.horseId,h.owner,rank+1,prize,now).run();
   if(r.meta.changes)paid+=prize;
  }
 }
 return paid;
}
export async function ownedHorses(env:KpEnv,mapping:KpMapping,user:string){
 await ensureHorses(env);
 const rows=(await env.DB.prepare('SELECT id,name,grade,ability,style,box,price,created_at,races,wins,seconds,thirds,earnings,retired_at FROM kp_horses WHERE guild=? AND owner=? AND sold_at IS NULL ORDER BY retired_at IS NOT NULL,created_at DESC LIMIT 30').bind(mapping.guildId,user).all<Horse>()).results;
 const nick=await nicknames(env,rows);
 return rows.map(h=>({...h,nickname:nick.get(h.id)??null,gradeLabel:CLASSES[h.grade].grade,sellValue:h.retired_at?0:sellValue(h.price,h.races),racesLeft:Math.max(0,RETIRE_RACES-h.races)}));
}
/** Wallet operation bodies. They change `state` and return the result the triggers apply. */
export async function buyHorse(env:KpEnv,mapping:KpMapping,user:string,state:{cash:number},args:Record<string,unknown>){
 await ensureHorses(env);
 const box=BOXES.find((b:{id:string})=>b.id===args.box);if(!box)throw Error('ボックスを選んでください。');
 const name=validHorseName(args.name);
 const active=await env.DB.prepare('SELECT COUNT(*) AS n FROM kp_horses WHERE guild=? AND owner=? AND sold_at IS NULL AND retired_at IS NULL').bind(mapping.guildId,user).first<{n:number}>();
 if((active?.n??0)>=MAX_OWNED)throw Error(`持てる馬は${MAX_OWNED}頭までです。売るか引退を待ってください。`);
 if(state.cash<box.price)throw Error('KPが足りません。');
 const horse={id:'horse-'+kpRandom(),name,...drawHorse(box.id,cryptoRng),box:box.id,price:box.price};
 state.cash-=box.price;
 return {horse:{...horse,gradeLabel:CLASSES[horse.grade].grade}};
}
export async function sellHorse(env:KpEnv,mapping:KpMapping,user:string,state:{cash:number},args:Record<string,unknown>){
 await ensureHorses(env);
 const h=await env.DB.prepare('SELECT id,price,races FROM kp_horses WHERE guild=? AND owner=? AND id=? AND sold_at IS NULL AND retired_at IS NULL').bind(mapping.guildId,user,String(args.horseId)).first<{id:string;price:number;races:number}>();
 if(!h)throw Error('売れる馬が見つかりません。');
 const refund=sellValue(h.price,h.races);state.cash+=refund;
 return {sold:{id:h.id,refund}};
}

// A very rare gift: each race slot (every 15 minutes) has a GIFT_CHANCE draw, decided once per slot, that gives a
// random registered member with a free stable place a new horse at no cost (it sells for nothing).
export const GIFT_CHANCE=.002;
const GIFT_BOXES=[{id:'normal',weight:50},{id:'silver',weight:30},{id:'gold',weight:15},{id:'platinum',weight:4},{id:'legend',weight:1}];
/** A gift horse runs under this name until its new owner names it with /horsename. */
export const GIFT_PLACEHOLDER='ナナシ';
export async function maybeGiftHorse(env:KpEnv,mapping:KpMapping,slot:number,rng:()=>number=cryptoRng,now=Date.now()){
 await ensureHorses(env);
 await ensureGifts(env);
 // The draw for a slot happens once, even if several cron runs reach it.
 const claimed=await env.DB.prepare('INSERT OR IGNORE INTO kp_horse_gifts(guild,slot,at) VALUES(?,?,?)').bind(mapping.guildId,slot,now).run();
 if(!claimed.meta.changes||rng()>=GIFT_CHANCE)return null;
 const users=[];
 for(const a of mapping.accounts){
  const n=await env.DB.prepare('SELECT COUNT(*) AS n FROM kp_horses WHERE guild=? AND owner=? AND sold_at IS NULL AND retired_at IS NULL').bind(mapping.guildId,a.discordUserId).first<{n:number}>();
  if((n?.n??0)<MAX_OWNED)users.push(a.discordUserId);
 }
 if(!users.length)return null;
 const user=users[Math.floor(rng()*users.length)];
 let roll=rng()*100,box=GIFT_BOXES[0].id;for(const b of GIFT_BOXES){if(roll<b.weight){box=b.id;break;}roll-=b.weight;}
 const horse={id:'horse-'+kpRandom(),name:GIFT_PLACEHOLDER,...drawHorse(box,rng),box,price:0};
 await env.DB.batch([
  env.DB.prepare('INSERT INTO kp_horses(id,guild,owner,name,grade,ability,style,box,price,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(horse.id,mapping.guildId,user,horse.name,horse.grade,horse.ability,horse.style,box,0,now),
  env.DB.prepare('UPDATE kp_horse_gifts SET user=?,horse=? WHERE guild=? AND slot=?').bind(user,horse.id,mapping.guildId,slot),
 ]);
 const label=BOXES.find((b:{id:string})=>b.id===box)!.label;
 return {user,horse:{...horse,gradeLabel:CLASSES[horse.grade].grade},text:`🎁 **馬が空から降ってきた！** <@${user}> に${CLASSES[horse.grade].grade}の馬がプレゼントされました（${label}ボックス相当・この15分の当選確率 ${GIFT_CHANCE*100}%）\n名前はまだありません。\`/horsename\` で好きな名前を付けてください（付けるまでは「${GIFT_PLACEHOLDER}」で走ります）。\n-# 持ち馬に入ります。売っても0 KP、走れば賞金はもらえます。`};
}
async function ensureGifts(env:KpEnv){
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_horse_gifts(guild TEXT NOT NULL,slot INTEGER NOT NULL,user TEXT,horse TEXT,at INTEGER NOT NULL,named INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild,slot))'),
 ]);
}
/** The recipient names their gift horse once. Returns the reply, and the announcement when it was named. */
export async function nameGiftHorse(env:KpEnv,mapping:KpMapping,user:string,name:unknown):Promise<{reply:string;post?:string}>{
 await ensureHorses(env);await ensureGifts(env);
 let value:string;try{value=validHorseName(name);}catch(error){return {reply:(error as Error).message};}
 const gift=await env.DB.prepare('SELECT g.slot,g.horse FROM kp_horse_gifts g JOIN kp_horses h ON h.id=g.horse WHERE g.guild=? AND g.user=? AND g.named=0 AND h.sold_at IS NULL ORDER BY g.at LIMIT 1').bind(mapping.guildId,user).first<{slot:number;horse:string}>();
 if(!gift)return {reply:'名前を付けられるプレゼントの馬はいません。プレゼントの馬は、ごくまれに空から降ってきます。'};
 const done=await env.DB.batch([
  env.DB.prepare('UPDATE kp_horse_gifts SET named=1 WHERE guild=? AND slot=? AND named=0').bind(mapping.guildId,gift.slot),
  env.DB.prepare(`UPDATE kp_horses SET name=? WHERE id=? AND name='${GIFT_PLACEHOLDER}'`).bind(value,gift.horse),
 ]);
 if(!done[0].meta.changes)return {reply:'この馬にはもう名前が付いています。'};
 return {reply:`🐴 プレゼントの馬に「${value}」と名付けました。これから「${value}」として走ります。`,post:`🐴 <@${user}> がプレゼントの馬に「${value}」と名付けました。`};
}
