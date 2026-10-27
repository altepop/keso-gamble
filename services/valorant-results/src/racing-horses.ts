// Owned horses: bought from boxes, entered at random into races of their class, paid prizes by
// finishing place, retired after RETIRE_RACES and sellable for 10-20% of the price.
// Buying and selling ride on the wallet operation insert (one transaction with the KP change).
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { BOXES, CLASSES, MAX_OWNED, RETIRE_RACES, RUN_MS, drawHorse, horseNickname, prizeFor, raceCard, raceClass, raceOdds, raceResult, sellValue, validHorseName } from '../../../js/racing.js';
import { crownFor, ensureCrowns } from './racing-crowns.ts';
import configuredPlayers from '../players.json' with { type: 'json' };
import { kpRandom } from './kp.ts';
import type { KpEnv, KpMapping } from './kp.ts';
export interface Entry { horseId:string; name:string; ability:number; style:number; owner:string; ownerName:string; nickname?:string|null; person?:boolean }
export interface Horse { id:string; owner:string; name:string; grade:number; ability:number; style:number; box:string; price:number; created_at:number; races:number; wins:number; seconds:number; thirds:number; earnings:number; retired_at:number|null; sold_at:number|null; last_race:number|null }
export const ENTRY_CHANCE=.4,REST=60*60000,CONSOLATION_RATE=.05;
const initialized=new WeakSet<object>();
export async function ensureHorses(env:KpEnv){
 if(initialized.has(env.DB))return;
 await env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_horses(id TEXT PRIMARY KEY,guild TEXT NOT NULL,owner TEXT NOT NULL,name TEXT NOT NULL,grade INTEGER NOT NULL,ability REAL NOT NULL,style INTEGER NOT NULL,box TEXT NOT NULL,price INTEGER NOT NULL,created_at INTEGER NOT NULL,races INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,seconds INTEGER NOT NULL DEFAULT 0,thirds INTEGER NOT NULL DEFAULT 0,earnings INTEGER NOT NULL DEFAULT 0,retired_at INTEGER,sold_at INTEGER,last_race INTEGER)`),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_race_fields(guild TEXT NOT NULL,race INTEGER NOT NULL,decided_at INTEGER NOT NULL,PRIMARY KEY(guild,race))'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_race_entries(guild TEXT NOT NULL,race INTEGER NOT NULL,gate_order INTEGER NOT NULL,horse TEXT NOT NULL,PRIMARY KEY(guild,race,horse))'),
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
export async function raceEntries(env:KpEnv,mapping:KpMapping,race:number):Promise<Entry[]>{
 await ensureHorses(env);
 const rows=(await env.DB.prepare('SELECT h.id,h.name,h.ability,h.style,h.owner,h.wins,h.seconds FROM kp_race_entries e JOIN kp_horses h ON h.id=e.horse WHERE e.guild=? AND e.race=? ORDER BY e.gate_order').bind(mapping.guildId,race).all<{id:string;name:string;ability:number;style:number;owner:string;wins:number;seconds:number}>()).results;
 const nick=await nicknames(env,rows),crown=await crownFor(env,mapping.guildId,race);
 const owned=rows.map(h=>({horseId:h.id,name:h.name,ability:h.ability,style:h.style,owner:h.owner,ownerName:memberName(mapping,h.owner),nickname:nick.get(h.id)??null}));
 return crown?[personEntry(mapping,race,crown.user),...owned]:owned;
}
/** Decides once which owned horses run in a race. Called when betting opens, before any bet. */
export async function decideEntries(env:KpEnv,mapping:KpMapping,race:number,now=Date.now(),chance=ENTRY_CHANCE){
 await ensureHorses(env);
 if(await env.DB.prepare('SELECT 1 FROM kp_race_fields WHERE guild=? AND race=?').bind(mapping.guildId,race).first())return raceEntries(env,mapping,race);
 const size=raceCard(race).size;
 const eligible=(await env.DB.prepare(`SELECT id FROM kp_horses h WHERE guild=? AND grade=? AND sold_at IS NULL AND retired_at IS NULL AND created_at<=?
  AND NOT EXISTS(SELECT 1 FROM kp_race_entries e WHERE e.guild=h.guild AND e.horse=h.id AND e.race>? AND e.race<?)`).bind(mapping.guildId,raceClass(race),now,race-REST,race+REST).all<{id:string}>()).results.map(r=>r.id);
 const picked=eligible.filter(()=>cryptoRng()<chance).map(id=>({id,order:cryptoRng()})).sort((a,b)=>a.order-b.order).slice(0,size);
 // Entries and the marker go in one transaction; a concurrent decision inserts nothing.
 await env.DB.batch([
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
