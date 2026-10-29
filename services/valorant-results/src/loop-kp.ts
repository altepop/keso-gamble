import {ensureQuizKp} from './quiz-kp.ts';
import {newKpState} from './kp.ts';
import type {KpEnv,KpMapping} from './kp.ts';

// Deliberately unavailable until LOOP verifies identity and game progress on its server.
// Configuration belongs on the receiving Worker, never in the browser or event payload.
export interface LoopRewardConfig {enabled:boolean;startsAt:number;publicKey:string;rates:Record<string,number>}
const initialized=new WeakMap<object,Promise<void>>();
export function ensureLoopKp(env:KpEnv):Promise<void>{
 const existing=initialized.get(env.DB);if(existing)return existing;
 const job=env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_loop_events(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,milestone TEXT NOT NULL,evidence TEXT NOT NULL,amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>0),completed_at INTEGER NOT NULL,UNIQUE(guild,user,milestone))`),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_loop_apply AFTER INSERT ON kp_loop_events BEGIN INSERT INTO kp_ledger(id,guild,user,delta,kind,at) VALUES(NEW.id,NEW.guild,NEW.user,NEW.amount,'loop',NEW.completed_at); END`),
 ]).then(()=>{});initialized.set(env.DB,job);job.catch(()=>initialized.delete(env.DB));return job;
}
function configuration(raw:string|undefined):LoopRewardConfig|null{
 try{
  const c=JSON.parse(raw??'null');
  if(!c||c.enabled!==true||!Number.isSafeInteger(c.startsAt)||c.startsAt<=0||typeof c.publicKey!=='string'||!c.rates||typeof c.rates!=='object'||Array.isArray(c.rates))return null;
  const entries=Object.entries(c.rates);
  if(!entries.length||entries.length>200||entries.some(([key,value])=>! /^[a-z0-9][a-z0-9._-]{0,95}$/.test(key)||!Number.isSafeInteger(value)||(value as number)<=0||(value as number)>1000000))return null;
  return c;
 }catch{return null;}
}
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function receiveLoopKp(request:Request,env:KpEnv,mapping:KpMapping):Promise<Response>{
 const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 const config=configuration(env.KP_LOOP_REWARDS_CONFIG);
 if(!config)return response({error:'LOOP rewards unavailable'},503);
 const timestamp=request.headers.get('X-Loop-Time')??'',signature=request.headers.get('X-Loop-Signature')??'';
 if(!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>300000||! /^[A-Za-z0-9+/]{86}==$/.test(signature))return response({error:'Unauthorized'},401);
 // Limit streamed input as well as Content-Length; a forged length cannot force a huge allocation.
 const reader=request.body?.getReader();if(!reader)return response({error:'Invalid event'},400);
 const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>4096){await reader.cancel();return response({error:'Too large'},413);}chunks.push(next.value);}}catch{return response({error:'Invalid event'},400);}
 const raw=new Uint8Array(length);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.byteLength;}
 let body:string;
 try{body=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);}catch{return response({error:'Invalid event'},400);}
 try{
  const key=await crypto.subtle.importKey('spki',bytes(config.publicKey),{name:'Ed25519'},false,['verify']);
  if(!await crypto.subtle.verify('Ed25519',key,bytes(signature),new TextEncoder().encode(timestamp+'.'+body)))return response({error:'Unauthorized'},401);
 }catch{return response({error:'Unauthorized'},401);}
 let e;try{e=JSON.parse(body);}catch{return response({error:'Invalid event'},400);}
 if(!e||e.kind!=='loop.milestone.completed'||e.version!==1||e.guildId!==mapping.guildId||typeof e.discordUserId!=='string'||!/^\d{15,22}$/.test(e.discordUserId)||typeof e.milestone!=='string'||!Object.hasOwn(config.rates,e.milestone)||typeof e.evidenceId!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(e.evidenceId)||!Number.isSafeInteger(e.completedAt)||e.completedAt<config.startsAt||e.completedAt>Date.now()+60000)return response({error:'Invalid event'},400);
 // Only the receiver chooses the amount. No run ID, slot, rule version or reset in this stable key.
 const id='loop:'+mapping.guildId+':'+e.discordUserId+':'+e.milestone;
 await ensureQuizKp(env);await ensureLoopKp(env);
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO kp_participants(guild,user) VALUES(?,?)').bind(mapping.guildId,e.discordUserId),
  env.DB.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').bind(mapping.guildId,e.discordUserId),
  env.DB.prepare('INSERT OR IGNORE INTO kp_state(guild,user,data) VALUES(?,?,?)').bind(mapping.guildId,e.discordUserId,JSON.stringify(newKpState())),
  env.DB.prepare('INSERT INTO kp_loop_events VALUES(?,?,?,?,?,?,?) ON CONFLICT(guild,user,milestone) DO NOTHING').bind(id,mapping.guildId,e.discordUserId,e.milestone,e.evidenceId,config.rates[e.milestone],e.completedAt),
 ]);
 const saved=await env.DB.prepare('SELECT amount FROM kp_loop_events WHERE id=?').bind(id).first<{amount:number}>();
 return response({accepted:true,id,amount:saved!.amount});
}
