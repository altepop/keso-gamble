import discord from '../discord-config.json' with {type:'json'};
import policy from '../quiz-kp-policy.json' with {type:'json'};
import type {KpEnv} from './kp.ts';
import {voicePolicy} from './voice-rewards.ts';
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function voiceStub(env:KpEnv){return env.VOICE_GATEWAY?.get(env.VOICE_GATEWAY.idFromName('guild:'+discord.guildId));}
export async function voiceStatus(env:KpEnv,user?:string){
 try{const stub=voiceStub(env);if(stub){const response=await stub.fetch('https://voice/'+(user?'progress?user='+encodeURIComponent(user):'status'));if(response.ok)return await response.json() as {enabled:boolean;connected:boolean;eligible?:boolean;observedMs?:number;error?:string;tracked?:number;lastConfirmedAt?:number};}}catch{}
 return {enabled:false,connected:false,error:'not_configured',eligible:false,observedMs:0};
}
export async function ensureVoice(env:KpEnv){const stub=voiceStub(env);if(stub)await stub.fetch('https://voice/ensure');}
export async function voiceControl(request:Request,env:KpEnv,publicKey=policy.publicKey){
 const path=new URL(request.url).pathname;
 if(request.method==='GET'&&path.endsWith('/key'))return env.KP_BOOTSTRAP_PUBLIC_KEY?Response.json({publicKey:env.KP_BOOTSTRAP_PUBLIC_KEY},{headers:{'Cache-Control':'no-store'}}):new Response('Unavailable',{status:503});
 if(request.method==='GET'&&path.endsWith('/status'))return Response.json({...await voiceStatus(env),policy:voicePolicy},{headers:{'Cache-Control':'no-store'}});
 if(request.method!=='POST'||!path.endsWith('/configure'))return new Response('Not found',{status:404});
 const timestamp=request.headers.get('X-Quiz-Time')??'',signature=request.headers.get('X-Quiz-Signature')??'';
 if(!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>300000||! /^[A-Za-z0-9+/]{86}==$/.test(signature))return new Response('Unauthorized',{status:401});
 const text=await request.text();if(text.length>2048)return new Response('Too large',{status:413});
 try{
  const key=await crypto.subtle.importKey('spki',bytes(publicKey),{name:'Ed25519'},false,['verify']);
  if(!await crypto.subtle.verify('Ed25519',key,bytes(signature),new TextEncoder().encode(timestamp+'.'+text)))return new Response('Unauthorized',{status:401});
 }catch{return new Response('Unauthorized',{status:401});}
 let body;try{body=JSON.parse(text);}catch{return new Response('Invalid configuration',{status:400});}
 if(body?.kind!=='voice.gateway.configure'||body.version!==1||body.guildId!==discord.guildId||typeof body.encryptedToken!=='string'||! /^[A-Za-z0-9+/]{256,1024}={0,2}$/.test(body.encryptedToken))return new Response('Invalid configuration',{status:400});
 const stub=voiceStub(env);if(!stub)return new Response('Unavailable',{status:503});
 try{const result=await stub.fetch('https://voice/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({guildId:body.guildId,encryptedToken:body.encryptedToken})});return result.ok?Response.json({accepted:true}):new Response('Voice configuration pending',{status:503});}catch{return new Response('Voice configuration pending',{status:503});}
}
