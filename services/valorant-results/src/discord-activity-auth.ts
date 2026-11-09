import {isKpParticipant} from './quiz-kp.ts';
import discord from '../discord-config.json' with { type: 'json' };
import type { KpEnv, KpMapping } from './kp.ts';
import { createKpSession, kpHash, kpRandom, kpSession } from './kp.ts';

const initialized = new WeakSet<object>();
async function ensureSchema(env:KpEnv) {
 if(initialized.has(env.DB))return;
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_activity_challenges(hash TEXT PRIMARY KEY,challenge TEXT NOT NULL,expires INTEGER NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_activity_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL)'),
 ]);
 initialized.add(env.DB);
}
export const activityAuthAvailable=(env:KpEnv)=>typeof env.DISCORD_CLIENT_SECRET==='string'&&env.DISCORD_CLIENT_SECRET.length>0;
export async function pkceChallenge(verifier:string) {
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
 return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
async function rateLimit(env:KpEnv,ip:string,kind:string) {
 await ensureSchema(env);
 const now=Date.now(),key=await kpHash(ip)+':'+kind+':'+Math.floor(now/60000);
 const bucket=await env.DB.prepare('INSERT INTO kp_activity_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+120000).first<{count:number}>();
 if(!bucket||bucket.count>30)throw Error('接続が混み合っています。1分ほど待って、もう一度お試しください。');
 await env.DB.batch([
  env.DB.prepare('DELETE FROM kp_activity_limits WHERE expires<?').bind(now),
  env.DB.prepare('DELETE FROM kp_activity_challenges WHERE expires<?').bind(now),
 ]);
}
export async function createActivityChallenge(env:KpEnv,challenge:string,ip:string) {
 if(!activityAuthAvailable(env))throw Error('Discordの自動接続は設定待ちです。接続コードでも入れます。');
 if(typeof challenge!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(challenge))throw Error('接続情報が不正です。Activityを開き直してください。');
 await rateLimit(env,ip,'challenge');
 const nonce=kpRandom();await env.DB.prepare('INSERT INTO kp_activity_challenges VALUES(?,?,?)').bind(await kpHash(nonce),challenge,Date.now()+5*60000).run();
 return {nonce,applicationId:discord.applicationId};
}
async function discordJson(url:string,init:RequestInit) {
 let response:Response;
 try{response=await fetch('https://discord.com/api/v10'+url,{...init,signal:AbortSignal.timeout(10000)});}catch{throw Error('Discordへの接続を確認できません。もう一度お試しください。');}
 if(!response.ok)throw Error('Discordの本人確認が完了しませんでした。もう一度お試しください。');
 try{return await response.json() as Record<string,unknown>;}catch{throw Error('Discordの応答を確認できません。もう一度お試しください。');}
}
export async function authenticateActivity(env:KpEnv,mapping:KpMapping,input:Record<string,unknown>,ip:string,previousToken?:string) {
 if(!activityAuthAvailable(env))throw Error('Discordの自動接続は設定待ちです。接続コードでも入れます。');
 const {nonce,code,codeVerifier}=input;
 if(typeof nonce!=='string'||!/^[a-f0-9]{48}$/.test(nonce)||typeof code!=='string'||code.length<1||code.length>2048||/[\x00-\x20]/.test(code)||typeof codeVerifier!=='string'||!/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier))throw Error('接続情報が不正です。Activityを開き直してください。');
 await rateLimit(env,ip,'auth');
 const pending=await env.DB.prepare('DELETE FROM kp_activity_challenges WHERE hash=? AND challenge=? AND expires>? RETURNING hash').bind(await kpHash(nonce),await pkceChallenge(codeVerifier),Date.now()).first();
 if(!pending)throw Error('接続情報が期限切れか使用済みです。もう一度お試しください。');
 const token=await discordJson('/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:discord.applicationId,client_secret:env.DISCORD_CLIENT_SECRET!,grant_type:'authorization_code',code,code_verifier:codeVerifier})});
 if(typeof token.access_token!=='string'||!token.access_token||token.access_token.length>4096||typeof token.token_type!=='string'||token.token_type.toLowerCase()!=='bearer')throw Error('Discordの本人確認が完了しませんでした。');
 const headers={Authorization:'Bearer '+token.access_token};
 const authorization=await discordJson('/oauth2/@me',{headers});
 const app=authorization.application as {id?:unknown}|undefined;
 if(app?.id!==discord.applicationId||!Array.isArray(authorization.scopes)||!authorization.scopes.includes('identify'))throw Error('このActivityの本人確認をやり直してください。');
 const user=await discordJson('/users/@me',{headers});
 if(typeof user.id!=='string'||!await isKpParticipant(env,mapping,user.id))throw Error('このDiscordアカウントのKP口座は登録されていません。');
 const previous=previousToken?await kpSession(env,previousToken):null;
 const session=previous?.guild===mapping.guildId&&previous.user===user.id?previousToken!:await createKpSession(env,mapping.guildId,user.id);
 // The Discord access token is used only in memory to authenticate the SDK, never stored in D1.
 return {token:session,userId:user.id,accessToken:token.access_token};
}
