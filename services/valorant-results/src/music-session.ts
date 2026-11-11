import {musicPanel,runMusicDetails,parseMusic,MUSIC_COMMAND,type MusicInteraction,type MusicReply} from './music-command.ts';
import type {Env} from './index.ts';
import discord from '../discord-config.json' with {type:'json'};

// All state here belongs to the music service. No D1 wallet, voice-reward or
// existing KESO PLAY durable object is read or written.
interface DeferredMusic { interaction:MusicInteraction; token:string; origin:string;
  applicationId:string; expiresAt:number; reply?:MusicReply; }
interface SavedMusic {guildId:string; savedAt:number; snapshot:unknown}
const LIMIT_PENDING=12;
const catalogIds=new Set<string>(MUSIC_COMMAND.options[0].options[0].choices.map(track=>track.value));
const AGE_MS=3*60_000;
const RETRY_MS=6_000;
const allowedOrigin=(value:string)=>{
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password
   &&!url.search&&!url.hash&&url.pathname==='/'&&
   (url.hostname.endsWith('.workers.dev')||url.hostname.endsWith('.pages.dev'))?url.origin:null;}
 catch{return null;}
};
export const validMusicHost=(value?:string)=>{
 try{const url=new URL(value??'');return url.protocol==='https:'&&!url.username&&!url.password
   &&!url.search&&!url.hash&&url.pathname==='/'&&
   (url.hostname.endsWith('.onrender.com')||url.hostname.endsWith('.render.com'));}
 catch{return false;}
};
function isSavedMusic(input:any):input is SavedMusic{
 if(!input||input.guildId!==discord.guildId||!Number.isFinite(input.savedAt)
   ||Math.abs(Date.now()-input.savedAt)>15*60_000)return false;
 const s=input.snapshot;
 if(s===null)return true;
 if(!s||typeof s!=='object'||!/^\d{15,22}$/.test(s.channelId??'')
    ||!['radio','all','manual'].includes(s.mode)
    ||!['off','one','all'].includes(s.loop)
    ||!Number.isInteger(s.volume)||s.volume<1||s.volume>100
    ||!Array.isArray(s.upcoming)||s.upcoming.length>30
    ||!Array.isArray(s.radioCatalog)||s.radioCatalog.length>30)return false;
 const entry=(e:any)=>e&&typeof e.id==='string'&&catalogIds.has(e.id)
    &&/^\d{15,22}$/.test(e.requester??'');
 return (s.current===null||entry(s.current))
   &&s.upcoming.every(entry)&&s.radioCatalog.every((x:unknown)=>typeof x==='string'&&catalogIds.has(x))
   &&typeof s.paused==='boolean'&&typeof s.radioRequester==='string'
   &&(!s.guildId||s.guildId===discord.guildId);
}
export class MusicSession {
 private ctx:DurableObjectState;
 private env:Env;
 constructor(ctx:DurableObjectState,env:Env){this.ctx=ctx;this.env=env;}
 async fetch(request:Request):Promise<Response>{
  const path=new URL(request.url).pathname;
  if(path==='/enqueue'&&request.method==='POST'){
   const p=await request.json() as DeferredMusic;
   if(!p||p.applicationId!==discord.applicationId||p.interaction?.guild_id!==discord.guildId
      ||!/^\d{15,22}$/.test(p.interaction.id??'')||!/^\d{15,22}$/.test(p.interaction.member?.user?.id??'')
      ||typeof p.token!=='string'||p.token.length>4096||!p.token
      ||!allowedOrigin(p.origin)||!Number.isFinite(p.expiresAt)
      ||p.expiresAt<Date.now()||p.expiresAt>Date.now()+AGE_MS+3000)
      return new Response('Invalid deferred music request',{status:400});
   try{parseMusic(p.interaction);}catch{return new Response('Invalid music operation',{status:400});}
   const entries=await this.ctx.storage.list({prefix:'pending:'});
   if(entries.size>=LIMIT_PENDING&&!entries.has('pending:'+p.interaction.id))
      return new Response('Music queue temporarily busy',{status:429});
   await this.ctx.storage.put('pending:'+p.interaction.id,p);
   // Give the initial Discord deferred PATCH time to post "starting".
   // Otherwise a fast alarm could overwrite the completed playback card.
   await this.ctx.storage.setAlarm(Date.now()+4000);
   return Response.json({queued:true});
  }
  if(path==='/checkpoint'){
   if(request.method==='GET'){
    const saved=await this.ctx.storage.get<SavedMusic>('checkpoint');
    return Response.json({snapshot:saved&&Date.now()-saved.savedAt<15*60_000?saved.snapshot:null});
   }
   if(request.method==='POST'){
    const data=await request.text();if(data.length>12_000)return new Response('too large',{status:413});
    let value:unknown;try{value=JSON.parse(data);}catch{return new Response('bad json',{status:400});}
    if(!isSavedMusic(value))return new Response('invalid checkpoint',{status:400});
    const previous=await this.ctx.storage.get<SavedMusic>('checkpoint');
    if(previous&&previous.savedAt>value.savedAt)return Response.json({saved:false,stale:true});
    // Keep a null tombstone so a slower old checkpoint cannot resurrect a
    // queue after /music stop, leave, or an empty VC.
    await this.ctx.storage.put('checkpoint',value);
    return Response.json({saved:true});
   }
  }
  return new Response('Not found',{status:404});
 }
 private async reply(p:DeferredMusic,reply:MusicReply):Promise<boolean>{
  try{
   const response=await fetch('https://discord.com/api/v10/webhooks/'+p.applicationId+'/'+encodeURIComponent(p.token)+'/messages/@original',{
    method:'PATCH',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...musicPanel(reply),allowed_mentions:{parse:[]}}),
    signal:AbortSignal.timeout(8_000)});
   if(!response.ok)console.warn('music_deferred_reply_error',{status:response.status});
   return response.ok||response.status===401||response.status===404;
  }catch{console.warn('music_deferred_reply_retry');return false;}
 }
 async alarm():Promise<void>{
  const pending=await this.ctx.storage.list<DeferredMusic>({prefix:'pending:'});
  if(!pending.size)return;
  const now=Date.now();
  for(const [key,p] of [...pending].slice(0,1)){
   if(now>p.expiresAt+10*60_000){await this.ctx.storage.delete(key);continue;}
   const expired=now>p.expiresAt;
   if(!p.reply&&!expired){
    // Retrying an unknown POST result would risk adding a track twice. The
    // music bridge's own retry receipt still owns idempotency for a single call.
    try{
     const result=await runMusicDetails(this.env,p.interaction,fetch,p.origin);
     if(!result.pending)p.reply=result;
    }catch{console.warn('music_recovery_request_failed');}
   }
   if(expired&&!p.reply)p.reply={message:'音楽Botの起動に時間がかかったため再生できなかった。/music queue で状態を確認してほしい。'};
   if(p.reply){
    if(await this.reply(p,p.reply)){await this.ctx.storage.delete(key);continue;}
    await this.ctx.storage.put(key,p);
   }
  }
  if((await this.ctx.storage.list({prefix:'pending:'})).size)
   await this.ctx.storage.setAlarm(Date.now()+RETRY_MS);
 }
}
function musicStub(env:Env){return env.MUSIC_SESSION?.get(env.MUSIC_SESSION.idFromName('guild:'+discord.guildId));}
export async function queueMusicRecovery(env:Env,interaction:MusicInteraction,token:string,origin:string):Promise<boolean>{
 const stub=musicStub(env);
 if(!stub||!allowedOrigin(origin)||!token)return false;
 try{
  const response=await stub.fetch('https://music.internal/enqueue',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({interaction,token,origin,applicationId:discord.applicationId,expiresAt:Date.now()+AGE_MS})});
  return response.ok;
 }catch{console.warn('music_recovery_enqueue_failed');return false;}
}
export async function musicStateApi(request:Request,env:Env):Promise<Response>{
 if(!env.MUSIC_SESSION||!env.MUSIC_BRIDGE_TOKEN||env.MUSIC_BRIDGE_TOKEN.length<32)
  return new Response('Not configured',{status:503});
 if(request.headers.get('Authorization')!=='Bearer '+env.MUSIC_BRIDGE_TOKEN)
  return new Response('Unauthorized',{status:401});
 const guild=new URL(request.url).searchParams.get('guild');
 if(guild!==discord.guildId)return new Response('Forbidden',{status:403});
 if(!['GET','POST'].includes(request.method))return new Response('Method not allowed',{status:405});
 const stub=musicStub(env)!;
 return stub.fetch('https://music.internal/checkpoint',{method:request.method,
   ...(request.method==='POST'?{body:await request.text(),headers:{'Content-Type':'application/json'}}:{})});
}
// Reuse the existing once-a-minute Cron. A read-only health request every
// five minutes has no D1 reads or writes and protects the separate free host.
export async function musicKeepalive(env:Env,origin?:string,request:typeof fetch=fetch):Promise<boolean>{
 if(!validMusicHost(env.MUSIC_VOICE_URL)||!env.MUSIC_BRIDGE_TOKEN||env.MUSIC_BRIDGE_TOKEN.length<32)
  return false;
 try{
  const headers:Record<string,string>={Authorization:'Bearer '+env.MUSIC_BRIDGE_TOKEN};
  if(origin){
   try{const candidate=new URL(origin).origin;
    if(allowedOrigin(candidate))headers['X-Keso-Music-State-URL']=candidate;
   }catch{ /* Omit an invalid URL hint. */ }
  }
  const res=await request(new URL('/health',env.MUSIC_VOICE_URL),{
   headers,signal:AbortSignal.timeout(8_000)});
  if(!res.ok)return false;
  return (await res.json() as {status?:string}).status==='ready';
 }catch{return false;}
}
