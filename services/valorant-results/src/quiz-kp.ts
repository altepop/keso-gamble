import policy from '../quiz-kp-policy.json' with { type: 'json' };
import {newKpState} from './kp.ts';
import type {KpEnv,KpMapping} from './kp.ts';
const initialized=new WeakSet<object>();
export async function ensureQuizKp(env:KpEnv){
 if(initialized.has(env.DB))return;
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_participants(guild TEXT NOT NULL,user TEXT NOT NULL,PRIMARY KEY(guild,user))'),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_quiz_events(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,mode TEXT NOT NULL,day TEXT NOT NULL,game TEXT NOT NULL,amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>=0),completed_at INTEGER NOT NULL,UNIQUE(guild,user,mode,day),UNIQUE(guild,user,game))`),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_quiz_apply AFTER INSERT ON kp_quiz_events BEGIN INSERT INTO kp_ledger(id,guild,user,delta,kind,at) VALUES(NEW.id,NEW.guild,NEW.user,NEW.amount,'quiz',NEW.completed_at); END`),
 ]);initialized.add(env.DB);
}
export async function isKpParticipant(env:KpEnv,mapping:KpMapping,user:string){
 if(mapping.accounts.some(a=>a.discordUserId===user))return true;
 await ensureQuizKp(env);
 return Boolean(await env.DB.prepare('SELECT user FROM kp_participants WHERE guild=? AND user=?').bind(mapping.guildId,user).first());
}
export async function receiveQuizKp(request:Request,env:KpEnv,mapping:KpMapping,publicKey=policy.publicKey){
 if(!policy.enabled)return Response.json({error:'Quiz rewards unavailable'},{status:503});
 const timestamp=request.headers.get('X-Quiz-Time')??'',signature=request.headers.get('X-Quiz-Signature')??'';
 if(!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>300000||! /^[A-Za-z0-9+/]{86}==$/.test(signature))return new Response('Unauthorized',{status:401});
 const body=await request.text();if(body.length>2048)return new Response('Too large',{status:413});
 try{
  const key=await crypto.subtle.importKey('spki',Uint8Array.from(atob(publicKey),c=>c.charCodeAt(0)),{name:'Ed25519'},false,['verify']);
  if(!await crypto.subtle.verify('Ed25519',key,Uint8Array.from(atob(signature),c=>c.charCodeAt(0)),new TextEncoder().encode(timestamp+'.'+body)))return new Response('Unauthorized',{status:401});
 }catch{return new Response('Unauthorized',{status:401});}
 let e;try{e=JSON.parse(body);}catch{return new Response('Invalid event',{status:400});}
 const valid=e&&e.kind==='quiz.daily.completed'&&e.version===1&&typeof e.discordUserId==='string'&&/^\d{15,22}$/.test(e.discordUserId)&&typeof e.gameId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(e.gameId)&&typeof e.mode==='string'&&Object.hasOwn(policy.rates,e.mode)&&Number.isSafeInteger(e.completedAt)&&e.completedAt>=0&&e.completedAt<=Date.now()+60000&&e.day===new Date(e.completedAt).toISOString().slice(0,10);
 if(!valid)return new Response('Invalid event',{status:400});
 await ensureQuizKp(env);
 const id='quiz:'+mapping.guildId+':'+e.discordUserId+':'+e.mode+':'+e.day;
 const amount=policy.rates[e.mode as keyof typeof policy.rates];
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO kp_participants VALUES(?,?)').bind(mapping.guildId,e.discordUserId),
  env.DB.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').bind(mapping.guildId,e.discordUserId),
  env.DB.prepare('INSERT OR IGNORE INTO kp_state(guild,user,data) VALUES(?,?,?)').bind(mapping.guildId,e.discordUserId,JSON.stringify(newKpState())),
  env.DB.prepare('INSERT INTO kp_quiz_events VALUES(?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').bind(id,mapping.guildId,e.discordUserId,e.mode,e.day,e.gameId,amount,e.completedAt),
 ]);
 return Response.json({accepted:true},{headers:{'Cache-Control':'no-store'}});
}
export const quizKpRates=policy.rates;
