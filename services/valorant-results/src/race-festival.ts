import type {KpEnv} from './kp.ts';
import {kpHash,kpRandom} from './kp.ts';
// @ts-expect-error Shared pure browser rules.
import {festivalRace,festivalFactor,RUN_MS} from '../../../js/racing.js';
const ready=new WeakMap<object,Promise<void>>();
export async function ensureFestival(env:KpEnv){
 const previous=ready.get(env.DB);if(previous)return previous;
 const job=(async()=>{await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_festival_seeds(guild TEXT NOT NULL,race INTEGER NOT NULL,seed TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(guild,race))'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_festival_tickets(guild TEXT NOT NULL,race INTEGER NOT NULL,user TEXT NOT NULL,operation TEXT NOT NULL,PRIMARY KEY(guild,race,user))'),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_festival_ticket_apply AFTER INSERT ON kp_operations
   WHEN json_extract(NEW.response,'$.result.bet.festival')=1 BEGIN
   INSERT INTO kp_festival_tickets(guild,race,user,operation) VALUES(NEW.guild,json_extract(NEW.response,'$.result.bet.raceId'),NEW.user,NEW.id); END`),
 ]);})();
 ready.set(env.DB,job);try{await job;}catch(error){ready.delete(env.DB);throw error;}
}
const termsCache=new WeakMap<object,Map<string,Promise<{seed:string;hash:string;factor:number}>>>();
export async function festivalTerms(env:KpEnv,guild:string,race:number){
 if(!festivalRace(race))return null;
 let cache=termsCache.get(env.DB);if(!cache){cache=new Map();termsCache.set(env.DB,cache);}
 const key=guild+':'+race,existing=cache.get(key);if(existing)return existing;
 const job=(async()=>{await ensureFestival(env);
 const seed=kpRandom(),hash=await kpHash(seed);
 await env.DB.prepare('INSERT OR IGNORE INTO kp_festival_seeds(guild,race,seed,hash) VALUES(?,?,?,?)').bind(guild,race,seed,hash).run();
 const row=await env.DB.prepare('SELECT seed,hash FROM kp_festival_seeds WHERE guild=? AND race=?').bind(guild,race).first<{seed:string;hash:string}>();
 if(!row)throw Error('祭りの配当抽選を確認できません。');
 return {...row,factor:festivalFactor(row.seed)};})();
 cache.set(key,job);if(cache.size>16)cache.delete(cache.keys().next().value!);
 try{return await job;}catch(error){if(cache.get(key)===job)cache.delete(key);throw error;}
}
export async function publicFestival(env:KpEnv,guild:string,race:number,now:number){
 const terms=await festivalTerms(env,guild,race);if(!terms)return null;
 return {hash:terms.hash,...(now>=race+RUN_MS?{seed:terms.seed,factor:terms.factor}:{})};
}
// Redact the wire response, never the trusted persisted wallet used for settlement.
// This includes purchase/retry receipts and all nested bets in the state endpoint.
export function publicFestivalResponse(value:unknown,now=Date.now()):unknown{
 if(Array.isArray(value))return value.map(v=>publicFestivalResponse(v,now));
 if(!value||typeof value!=='object')return value;
 const obj=value as Record<string,unknown>;
 const hidden=obj.festival===true&&typeof obj.raceId==='number'&&now<obj.raceId+RUN_MS;
 return Object.fromEntries(Object.entries(obj).map(([key,v])=>[key,hidden&&key==='odds'?null:publicFestivalResponse(v,now)]));
}
