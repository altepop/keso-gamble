import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,publicEncrypt,sign,constants} from 'node:crypto';
import {VoiceGateway} from '../src/voice-gateway.ts';
import {voiceControl} from '../src/voice-api.ts';
import type {VoiceEnv} from '../src/voice-gateway.ts';
import discord from '../discord-config.json' with {type:'json'};
class Memory {
 data=new Map<string,unknown>();alarm=0;
 async get<T>(key:string){return structuredClone(this.data.get(key)) as T|undefined;}
 async put(key:string,value:unknown){this.data.set(key,structuredClone(value));}
 async delete(key:string){return this.data.delete(key);}
 async list<T>({prefix}:{prefix:string}){return new Map([...this.data].filter(([key])=>key.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v) as T]));}
 async setAlarm(at:number){this.alarm=at;}
}
class Socket extends EventTarget {
 readyState=1;sent:any[]=[];
 accept(){}
 send(text:string){this.sent.push(JSON.parse(text));}
 close(){this.readyState=3;}
 packet(packet:unknown){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(packet)}));}
 closeFromServer(code:number){const event=new Event('close');Object.defineProperty(event,'code',{value:code});this.dispatchEvent(event);}
}
const user='100000000000000101',bot='100000000000000102';
const noopDB={prepare:()=>({bind(){return this;},async run(){return {meta:{changes:1}};}}),async batch(){return [];}} as unknown as D1Database;
test('Gateway identifies with voice-only metadata intents, tracks humans, resumes, and never joins audio',async()=>{
 const rsa=generateKeyPairSync('rsa',{modulusLength:2048}),token='fixture.voice.token';
 const env:VoiceEnv={DB:noopDB,KP_BOOTSTRAP_PRIVATE_KEY:rsa.privateKey.export({type:'pkcs8',format:'pem'}).toString()};
 const storage=new Memory(),ctx={storage,blockConcurrencyWhile:(fn:()=>Promise<void>)=>fn()} as unknown as DurableObjectState;
 const originalFetch=globalThis.fetch,originalNow=Date.now,originalRandom=Math.random;let now=Date.parse('2026-10-27T01:00:00Z');const sockets:Socket[]=[];
 Date.now=()=>now;Math.random=()=>0;
 globalThis.fetch=async(url,init)=>{
  const path=String(url);
  if(path.includes('/users/@me'))return Response.json({id:bot,bot:true});
  if(path.includes('/guilds/'))return Response.json({id:discord.guildId});
  if(path.includes('/gateway/bot'))return Response.json({url:'wss://gateway.discord.gg',shards:1,session_start_limit:{remaining:1000}});
  if(path.startsWith('https://gateway.discord.gg')){assert.equal(new Headers(init?.headers).get('Upgrade'),'websocket');const socket=new Socket();sockets.push(socket);return {webSocket:socket} as unknown as Response;}
  throw Error('Unexpected network request');
 };
 try{
  const gateway=new VoiceGateway(ctx,env);
  const cipher=publicEncrypt({key:rsa.publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(token)).toString('base64');
  assert.equal((await gateway.fetch(new Request('https://voice/configure',{method:'POST',body:JSON.stringify({guildId:discord.guildId,encryptedToken:cipher})}))).status,200);
  assert.equal(JSON.stringify([...storage.data.values()]).includes(token),false);
  await gateway.alarm();const socket=sockets[0]!;
  socket.packet({op:10,d:{heartbeat_interval:1000}});await gateway.fetch(new Request('https://voice/status'));await new Promise(r=>setTimeout(r,5));
  assert.equal(socket.sent.find(p=>p.op===2).d.intents,129);
  socket.packet({op:11});socket.packet({op:0,s:1,t:'READY',d:{session_id:'fixture-session',resume_gateway_url:'wss://gateway.discord.gg'}});
  socket.packet({op:0,s:2,t:'GUILD_CREATE',d:{id:discord.guildId,afk_channel_id:'afk',channels:[{id:'normal',type:2},{id:'afk',type:2},{id:'stage',type:13}],members:[{user:{id:user}},{user:{id:bot,bot:true}}],voice_states:[{user_id:user,channel_id:'normal'},{user_id:bot,channel_id:'normal'}]}});
  let status=await (await gateway.fetch(new Request('https://voice/status'))).json() as {connected:boolean;tracked:number};assert.equal(status.connected,true);assert.equal(status.tracked,1);
  socket.packet({op:0,s:3,t:'VOICE_STATE_UPDATE',d:{guild_id:discord.guildId,user_id:user,channel_id:null,member:{user:{id:user}}}});
  status=await (await gateway.fetch(new Request('https://voice/status'))).json() as typeof status;assert.equal(status.tracked,0);
  socket.packet({op:7});await gateway.fetch(new Request('https://voice/status'));now+=91000;await gateway.alarm();const resumed=sockets[1]!;
  resumed.packet({op:10,d:{heartbeat_interval:1000}});await gateway.fetch(new Request('https://voice/status'));assert.equal(resumed.sent.find(p=>p.op===6).d.session_id,'fixture-session');
  assert.ok(sockets.every(s=>s.sent.every(p=>[1,2,6].includes(p.op))));
  resumed.closeFromServer(4004);assert.equal((await (await gateway.fetch(new Request('https://voice/status'))).json() as {enabled:boolean}).enabled,false);
 }finally{for(const socket of sockets)socket.closeFromServer(4004);globalThis.fetch=originalFetch;Date.now=originalNow;Math.random=originalRandom;}
});
test('voice bootstrap requires a fresh valid signature and the configured guild before forwarding',async()=>{
 const keys=generateKeyPairSync('ed25519'),pub=keys.publicKey.export({type:'spki',format:'der'}).toString('base64');let forwards=0;
 const env:VoiceEnv={DB:noopDB,VOICE_GATEWAY:{idFromName:()=>({}),get:()=>({fetch:async()=>{forwards++;return Response.json({accepted:true});}})} as unknown as DurableObjectNamespace};
 const request=(body:unknown,valid=true)=>{const text=JSON.stringify(body),at=String(Date.now());return new Request('https://worker/api/kp/voice/configure',{method:'POST',headers:{'X-Quiz-Time':at,'X-Quiz-Signature':valid?sign(null,Buffer.from(at+'.'+text),keys.privateKey).toString('base64'):'A'.repeat(86)+'=='},body:text});};
 const body={kind:'voice.gateway.configure',version:1,guildId:discord.guildId,encryptedToken:'A'.repeat(342)+'=='};
 assert.equal((await voiceControl(request(body,false),env,pub)).status,401);
 assert.equal((await voiceControl(request({...body,guildId:'100000000000000199'}),env,pub)).status,400);assert.equal(forwards,0);
 assert.equal((await voiceControl(request(body),env,pub)).status,200);assert.equal(forwards,1);
});
