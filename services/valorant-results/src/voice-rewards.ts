import {ensureQuizKp} from './quiz-kp.ts';
import {newKpState} from './kp.ts';
import type {KpEnv} from './kp.ts';
/** Each 5-minute slot pays 15 KP: the 5 KP event plus a 10 KP bonus. */
export const VOICE_BONUS=10;
export const voicePolicy={intervalMs:300000,amount:5+VOICE_BONUS,dailyCap:48*(5+VOICE_BONUS),slots:48};
export function voiceSlices(from:number,to:number){
 const slices:Array<{day:string;ms:number}>=[];
 if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||to<from)return slices;
 for(let cursor=from;cursor<to;){const end=Math.min(to,(Math.floor(cursor/86400000)+1)*86400000);slices.push({day:new Date(cursor).toISOString().slice(0,10),ms:end-cursor});cursor=end;}
 return slices;
}
export const voiceRewardHistoryIndex='CREATE INDEX IF NOT EXISTS kp_voice_events_member_latest ON kp_voice_events(guild,user,at DESC)';
const ready=new WeakSet<object>();
export async function ensureVoiceLedger(env:KpEnv){if(ready.has(env.DB))return;await env.DB.batch([
 env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_voice_events(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,day TEXT NOT NULL,slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 48),amount INTEGER NOT NULL CHECK(amount=5),at INTEGER NOT NULL,UNIQUE(guild,user,day,slot))`),
 env.DB.prepare(voiceRewardHistoryIndex),
 env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_voice_apply AFTER INSERT ON kp_voice_events BEGIN INSERT INTO kp_ledger(id,guild,user,delta,kind,at) VALUES(NEW.id,NEW.guild,NEW.user,NEW.amount,'voice',NEW.at); END`),
 // The stored events keep their original 5 KP (a CHECK in the live table); each slot now adds a 10 KP bonus row.
 env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_voice_bonus_v2 AFTER INSERT ON kp_voice_events BEGIN INSERT OR IGNORE INTO kp_ledger(id,guild,user,delta,kind,at) VALUES('bonus:'||NEW.id,NEW.guild,NEW.user,${VOICE_BONUS},'voice',NEW.at); END`),
]);ready.add(env.DB);}
export async function creditVoiceSlot(env:KpEnv,guild:string,user:string,day:string,slot:number,at:number){
 if(!/^\d{15,22}$/.test(user)||!/^\d{15,22}$/.test(guild)||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isInteger(slot)||slot<1||slot>48)throw Error('Invalid voice slot');
 await ensureQuizKp(env);await ensureVoiceLedger(env);
 // Participant/wallet/state and credit are one atomic D1 batch, including new members.
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO kp_participants VALUES(?,?)').bind(guild,user),
  env.DB.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').bind(guild,user),
  env.DB.prepare('INSERT OR IGNORE INTO kp_state(guild,user,data) VALUES(?,?,?)').bind(guild,user,JSON.stringify(newKpState())),
  env.DB.prepare('INSERT INTO kp_voice_events VALUES(?,?,?,?,?,5,?) ON CONFLICT DO NOTHING').bind('voice:'+guild+':'+user+':'+day+':'+slot,guild,user,day,slot,at),
 ]);
}
export interface VoiceRewardEntry {id:string;day:string;slot:number;amount:number;at:number}
/** A member's last 100 voice rewards don't change unless a new ledger row
 * is added. Every ledger INSERT advances kp_wallets.version, including
 * voice slots and bonuses. Use that version plus a 2-minute safety TTL
 * to reuse an expensive 100-row/subquery history across Activity refreshes.
 * Entries are scoped to the D1 binding and user; only eight are retained. */
const voiceHistoryCache=new WeakMap<object,Map<string,{version:number;at:number;promise:Promise<VoiceRewardEntry[]>}>>();
const VOICE_HISTORY_TTL=120_000;
export async function voiceRewardHistory(env:KpEnv,guild:string,user:string,walletVersion:number,now=Date.now()){
 await ensureVoiceLedger(env);
 let entries=voiceHistoryCache.get(env.DB);
 if(!entries){entries=new Map();voiceHistoryCache.set(env.DB,entries);}
 const key=guild+':'+user,cached=entries.get(key);
 if(cached&&cached.version===walletVersion&&now>=cached.at&&now-cached.at<VOICE_HISTORY_TTL)return cached.promise;
 // D1 returns a Promise; the in-memory SQL fixtures return an object directly.
 const promise=Promise.resolve(env.DB.prepare("SELECT e.id,e.day,e.slot,e.amount+COALESCE((SELECT delta FROM kp_ledger WHERE id='bonus:'||e.id),0) AS amount,e.at FROM kp_voice_events e WHERE e.guild=? AND e.user=? ORDER BY e.at DESC LIMIT 100")
  .bind(guild,user).all<VoiceRewardEntry>()).then(row=>row.results);
 entries.set(key,{version:walletVersion,at:now,promise});
 if(entries.size>8)entries.delete(entries.keys().next().value!);
 try{return await promise;}catch(error){if(entries.get(key)?.promise===promise)entries.delete(key);throw error;}
}
export interface VoiceRecord {user:string;day:string;ms:number;paid:number}
export interface VoiceStore {get<T>(key:string):Promise<T|undefined>;put<T>(key:string,value:T):Promise<void>;list<T>(options:{prefix:string}):Promise<Map<string,T>>;delete(key:string):Promise<unknown>}
export class VoiceClock {
 private at:number;
 private store:VoiceStore;private credit:(r:VoiceRecord,slot:number,at:number)=>Promise<void>;
 constructor(store:VoiceStore,credit:(r:VoiceRecord,slot:number,at:number)=>Promise<void>,now:number){this.store=store;this.credit=credit;this.at=now;}
 async checkpoint(now:number,active:Iterable<string>,confirmed:boolean){
  const from=this.at;this.at=Math.max(from,now);
  // Never guess time across a stalled/isolate restart or an unconfirmed connection.
  if(confirmed&&now>=from&&now-from<=120000){
   for(const user of active)for(const part of voiceSlices(from,now)){
    const key='voice:'+part.day+':'+user,r=await this.store.get<VoiceRecord>(key)??{user,day:part.day,ms:0,paid:0};
    r.ms=Math.min(voicePolicy.intervalMs*48,r.ms+part.ms);await this.store.put(key,r);
   }
  }
  await this.drain(now);
 }
 async drain(now:number){
  const records=await this.store.list<VoiceRecord>({prefix:'voice:'});
  for(const [key,r] of records){
   const earned=Math.min(48,Math.floor(r.ms/voicePolicy.intervalMs));
   for(let slot=r.paid+1;slot<=earned;slot++){
    try{await this.credit(r,slot,now);r.paid=slot;await this.store.put(key,r);}catch{console.warn('voice_credit_pending');break;}
   }
   if(r.day<new Date(now).toISOString().slice(0,10)&&r.paid>=earned)await this.store.delete(key);
  }
 }
 async progress(user:string,now:number){return await this.store.get<VoiceRecord>('voice:'+new Date(now).toISOString().slice(0,10)+':'+user)??{user,day:new Date(now).toISOString().slice(0,10),ms:0,paid:0};}
}
export function eligibleVoice(user:string,channel:string|null,channels:Map<string,number>,bots:Map<string,boolean>,afk:string|null){return /^\d{15,22}$/.test(user)&&channel!==null&&channel!==afk&&channels.get(channel)===2&&bots.get(user)===false;}
