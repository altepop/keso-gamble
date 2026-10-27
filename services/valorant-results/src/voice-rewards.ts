import {ensureQuizKp} from './quiz-kp.ts';
import {newKpState} from './kp.ts';
import type {KpEnv} from './kp.ts';
export const voicePolicy={intervalMs:300000,amount:5,dailyCap:240,slots:48};
export function voiceSlices(from:number,to:number){
 const slices:Array<{day:string;ms:number}>=[];
 if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||to<from)return slices;
 for(let cursor=from;cursor<to;){const end=Math.min(to,(Math.floor(cursor/86400000)+1)*86400000);slices.push({day:new Date(cursor).toISOString().slice(0,10),ms:end-cursor});cursor=end;}
 return slices;
}
const ready=new WeakSet<object>();
export async function ensureVoiceLedger(env:KpEnv){if(ready.has(env.DB))return;await env.DB.batch([
 env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_voice_events(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,day TEXT NOT NULL,slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 48),amount INTEGER NOT NULL CHECK(amount=5),at INTEGER NOT NULL,UNIQUE(guild,user,day,slot))`),
 env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_voice_apply AFTER INSERT ON kp_voice_events BEGIN INSERT INTO kp_ledger(id,guild,user,delta,kind,at) VALUES(NEW.id,NEW.guild,NEW.user,NEW.amount,'voice',NEW.at); END`),
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
