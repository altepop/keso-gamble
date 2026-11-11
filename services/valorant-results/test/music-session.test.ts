import test from 'node:test';
import assert from 'node:assert/strict';
import {MusicSession,musicKeepalive,musicStateApi,queueMusicRecovery,validMusicHost} from '../src/music-session.ts';
import discord from '../discord-config.json' with {type:'json'};
const guild=discord.guildId;
const secret='z'.repeat(64);
const host='https://keso-music-voice.onrender.com';
function fixture(){
 const records=new Map<string,unknown>();let alarm=0;
 const storage={
  async get(key:string){return records.get(key);},
  async put(key:string,value:unknown){records.set(key,value);},
  async delete(key:string){records.delete(key);},
  async list({prefix=''}:{prefix?:string}={}){return new Map([...records].filter(([key])=>key.startsWith(prefix)));},
  async setAlarm(at:number){alarm=at;},
 };
 const session=new MusicSession({storage} as unknown as DurableObjectState,{} as never);
 return {session,storage,records,getAlarm:()=>alarm};
}
test('keepalive only uses a bounded authenticated GET and never touches DB',async()=>{
 let calls=0;
 const request=async(url:RequestInfo|URL,init?:RequestInit)=>{
  calls++;assert.equal(String(url),host+'/health');
  assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+secret);
  return Response.json({status:'ready'});
 };
 assert.equal(await musicKeepalive({MUSIC_VOICE_URL:host,MUSIC_BRIDGE_TOKEN:secret} as never,
   'https://keso.example.workers.dev',request as typeof fetch),true);
 assert.equal(calls,1);
 assert.equal(await musicKeepalive({MUSIC_VOICE_URL:'http://127.0.0.1:8000',MUSIC_BRIDGE_TOKEN:secret} as never,
   undefined,request as typeof fetch),false);
 assert.equal(calls,1);
 assert.ok(validMusicHost(host));
});
test('checkpoint accepts catalog-only bounded state, rejects oversized or invalid entries',async()=>{
 const {session}=fixture(),user='100000000000000101',channelId='100000000000000102';
 const state={guildId:guild,savedAt:Date.now(),snapshot:{
  guildId:guild,channelId,current:{id:'mou',requester:user},upcoming:[],
  volume:20,loop:'off',paused:false,mode:'manual',cycle:0,radioCatalog:[],radioRequester:''}};
 const posted=await session.fetch(new Request('https://music.internal/checkpoint',
   {method:'POST',body:JSON.stringify(state)}));
 assert.equal(posted.status,200);
 const stored=await session.fetch(new Request('https://music.internal/checkpoint'));
 assert.deepEqual((await stored.json() as {snapshot:unknown}).snapshot,state.snapshot);
 const bad={...state,snapshot:{...state.snapshot,upcoming:new Array(31).fill({id:'mou',requester:user})}};
 assert.equal((await session.fetch(new Request('https://music.internal/checkpoint',
   {method:'POST',body:JSON.stringify(bad)}))).status,400);
 const stopped={...state,savedAt:state.savedAt+1,snapshot:null};
 assert.equal((await session.fetch(new Request('https://music.internal/checkpoint',
   {method:'POST',body:JSON.stringify(stopped)}))).status,200);
 // A delayed old write cannot resurrect a queue after stop/leave.
 const stale=await session.fetch(new Request('https://music.internal/checkpoint',
   {method:'POST',body:JSON.stringify(state)}));
 assert.deepEqual(await stale.json(),{saved:false,stale:true});
 assert.equal((await (await session.fetch(new Request('https://music.internal/checkpoint'))).json() as {snapshot:unknown}).snapshot,null);
});
test('external state API has bearer and guild gates independent of KP or D1',async()=>{
 let calls=0;
 const stub={fetch:async()=>{calls++;return Response.json({snapshot:null});}};
 const env={MUSIC_BRIDGE_TOKEN:secret,MUSIC_SESSION:{idFromName:()=>({}),get:()=>stub}};
 const url='https://example.workers.dev/api/discord/music/state?guild='+guild;
 assert.equal((await musicStateApi(new Request(url),env as never)).status,401);
 assert.equal(calls,0);
 assert.equal((await musicStateApi(new Request(url.replace(guild,'123'),{
  headers:{Authorization:'Bearer '+secret}}),env as never)).status,403);
 assert.equal(calls,0);
 assert.equal((await musicStateApi(new Request(url,{
  headers:{Authorization:'Bearer '+secret}}),env as never)).status,200);
 assert.equal(calls,1);
});
test('only signed caller data can enqueue a deferred music command',async()=>{
 const {session,getAlarm}=fixture();
 const interaction={id:'100000000000000109',guild_id:guild,
  member:{user:{id:'100000000000000101'}},
  data:{name:'music',options:[{type:1,name:'play',options:[{name:'song',value:'mou'}]}]}};
 const pending={interaction,token:'temporary-discord-token',origin:'https://keso.example.workers.dev',
  applicationId:discord.applicationId,expiresAt:Date.now()+120000};
 const res=await session.fetch(new Request('https://music.internal/enqueue',
  {method:'POST',body:JSON.stringify(pending)}));
 assert.equal(res.status,200);assert.ok(getAlarm()>0);
 assert.equal((await session.fetch(new Request('https://music.internal/enqueue',{
  method:'POST',body:JSON.stringify({...pending,origin:'http://localhost:8080'})}))).status,400);
});
