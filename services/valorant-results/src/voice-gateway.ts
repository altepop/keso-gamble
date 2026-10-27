import {KP_COMMAND_VERSION,registerKpCommands} from './kp-command.ts';
import discord from '../discord-config.json' with {type:'json'};
import {VoiceClock,eligibleVoice,creditVoiceSlot} from './voice-rewards.ts';
import type {KpEnv} from './kp.ts';
export interface VoiceEnv extends KpEnv {KP_BOOTSTRAP_PRIVATE_KEY?:string;VOICE_GATEWAY?:DurableObjectNamespace}
interface Packet {op:number;s?:number|null;t?:string;d?:any}
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function decryptVoiceToken(env:VoiceEnv,ciphertext:string){
 const pem=env.KP_BOOTSTRAP_PRIVATE_KEY;if(!pem)throw Error('Voice encryption unavailable');
 const raw=bytes(pem.replace(/-----[^-]+-----|\s/g,''));
 const key=await crypto.subtle.importKey('pkcs8',raw,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'RSA-OAEP'},key,bytes(ciphertext)));
}
export class VoiceGateway {
 private socket:WebSocket|null=null;private token='';private encrypted='';private guild=discord.guildId;
 private seq:number|null=null;private session='';private resumeUrl='';private ready=false;private lastAck=0;private interval=45000;private waitingAck=false;
 private heartbeatTimer:ReturnType<typeof setInterval>|undefined;private firstHeartbeat:ReturnType<typeof setTimeout>|undefined;
 private voices=new Map<string,string|null>();private bots=new Map<string,boolean>();private channels=new Map<string,number>();private afk:string|null=null;
 private commandsRegistered=false;private commandsAfter=0;private commandsError='';
 private apiAfter=0;private nextConnect=0;private error='unconfigured';private stopped=false;private tail:Promise<unknown>=Promise.resolve();private init:Promise<void>;private clock:VoiceClock;
 private ctx:DurableObjectState;private env:VoiceEnv;
 constructor(ctx:DurableObjectState,env:VoiceEnv){
  this.ctx=ctx;this.env=env;
  this.clock=new VoiceClock(ctx.storage,(r,slot,at)=>creditVoiceSlot(env,this.guild,r.user,r.day,slot,at),Date.now());
  this.init=ctx.blockConcurrencyWhile(async()=>{
   const config=await ctx.storage.get<{encryptedToken:string;guildId:string}>('config');
   if(config?.guildId===discord.guildId){try{this.token=await decryptVoiceToken(env,config.encryptedToken);this.encrypted=config.encryptedToken;this.error='connecting';}catch{this.error='configuration_error';}}
   if(this.token)await ctx.storage.setAlarm(Date.now()+1000);
  });
 }
 private serial<T>(work:()=>Promise<T>):Promise<T>{const run=this.tail.then(work,work);this.tail=run.catch(()=>{});return run;}
 private active(){return [...this.voices].filter(([u,c])=>eligibleVoice(u,c,this.channels,this.bots,this.afk)).map(([u])=>u);}
 private confirmed(){return this.ready&&this.lastAck>0&&Date.now()-this.lastAck<=this.interval*2;}
 private async checkpoint(at=Date.now()){await this.clock.checkpoint(at,this.active(),this.confirmed());}
 private send(data:unknown){if(this.socket?.readyState===1)this.socket.send(JSON.stringify(data));}
 private heartbeat(){if(this.waitingAck){this.disconnect('heartbeat_timeout');return;}this.waitingAck=true;this.send({op:1,d:this.seq});}
 private disconnect(reason:string){
  this.ready=false;this.lastAck=0;this.waitingAck=false;this.error=reason;
  if(this.heartbeatTimer)clearInterval(this.heartbeatTimer);if(this.firstHeartbeat)clearTimeout(this.firstHeartbeat);
  const socket=this.socket;this.socket=null;try{socket?.close(4000,'reconnect');}catch{}
  this.nextConnect=Math.max(this.nextConnect,Date.now()+5000);
 }
 private async api(path:string,token=this.token,method='GET',body?:unknown){
  if(Date.now()<this.apiAfter)throw Error('Discord cooldown');
  const response=await fetch('https://discord.com/api/v10'+path,{method,headers:{Authorization:'Bot '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
  if(response.status===429){const detail=await response.json().catch(()=>null) as {retry_after?:number}|null;const retry=Number(detail?.retry_after??response.headers.get('retry-after'));this.apiAfter=Date.now()+Math.max(1000,(Number.isFinite(retry)&&retry>0?retry:60)*1000);this.nextConnect=Math.max(this.nextConnect,this.apiAfter);throw Error('Discord rate limit');}
  if(!response.ok)throw Error('discord_http_'+response.status);return await response.json() as any;
 }
 private async connect(){
  if(this.socket||!this.token||this.stopped||Date.now()<this.nextConnect)return;
  try{
   let url=this.resumeUrl;
   let shards=1;
   if(!this.session){
    const gateway=await this.api('/gateway/bot');shards=Number(gateway.shards)||1;
    if(gateway.session_start_limit?.remaining===0){this.nextConnect=Date.now()+Math.max(60000,Number(gateway.session_start_limit.reset_after)||60000);this.error='session_limit';return;}
    url=gateway.url;this.nextConnect=Date.now()+90000;
   }
   const endpoint=new URL(url);if(endpoint.protocol!=='wss:'||!(endpoint.hostname==='gateway.discord.gg'||endpoint.hostname.endsWith('.discord.gg')))throw Error('Invalid Gateway endpoint');
   endpoint.protocol='https:';endpoint.search='?v=10&encoding=json';
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
   let response:Response;try{response=await fetch(endpoint,{headers:{Upgrade:'websocket'},signal:controller.signal});}finally{clearTimeout(timeout);}
   const socket=response.webSocket;if(!socket)throw Error('Gateway upgrade failed');
   this.socket=socket;this.ready=false;this.lastAck=0;this.waitingAck=false;this.error='connecting';socket.accept();
   socket.addEventListener('message',event=>{if(socket!==this.socket)return;const receivedAt=Date.now();let packet:Packet;try{packet=JSON.parse(String(event.data));}catch{return;}
    // ACK/heartbeat handling must not wait behind storage or a credit retry.
    if(packet.op===11){this.waitingAck=false;this.lastAck=receivedAt;return;}
    if(packet.op===1){this.send({op:1,d:this.seq});return;}
    void this.serial(async()=>{
    if(socket!==this.socket)return;
    if(typeof packet.s==='number')this.seq=packet.s;
    if(packet.op===10){
     this.interval=Number(packet.d?.heartbeat_interval)||45000;
     if(this.interval<1000||this.interval>120000){this.disconnect('invalid_heartbeat');return;}
     this.firstHeartbeat=setTimeout(()=>{this.heartbeat();this.heartbeatTimer=setInterval(()=>this.heartbeat(),this.interval);},Math.floor(Math.random()*this.interval));
     if(this.session)this.send({op:6,d:{token:this.token,session_id:this.session,seq:this.seq}});
     else this.send({op:2,d:{token:this.token,intents:129,properties:{os:'linux',browser:'keso-voice',device:'keso-voice'},...(shards>1?{shard:[Number((BigInt(this.guild)>>22n)%BigInt(shards)),shards]}:{})}});
     return;
    }
    if(packet.op===11){this.waitingAck=false;this.lastAck=receivedAt;return;}
    if(packet.op===1){this.send({op:1,d:this.seq});return;}
    if(packet.op===7){await this.checkpoint(receivedAt);this.disconnect('reconnecting');return;}
    if(packet.op===9){if(!packet.d){this.session='';this.seq=null;this.resumeUrl='';this.voices.clear();}this.disconnect('new_session');return;}
    if(packet.op!==0)return;
    if(packet.t==='READY'){this.session=packet.d.session_id;this.resumeUrl=packet.d.resume_gateway_url;return;}
    if(packet.t==='RESUMED'){this.ready=true;this.error='';await this.clock.checkpoint(receivedAt,[],false);return;}
    const data=packet.d;
    if(packet.t==='GUILD_CREATE'&&data?.id===this.guild&&!data.unavailable){
     await this.checkpoint(receivedAt);this.voices.clear();this.bots.clear();this.channels.clear();this.afk=data.afk_channel_id??null;
     for(const c of data.channels??[])this.channels.set(c.id,c.type);
     for(const m of data.members??[])if(m.user?.id)this.bots.set(m.user.id,Boolean(m.user.bot));
     for(const v of data.voice_states??[])this.voices.set(v.user_id,v.channel_id??null);
     this.ready=true;this.error='';await this.clock.checkpoint(receivedAt,[],false);return;
    }
    if(data?.guild_id!==this.guild&&data?.id!==this.guild)return;
    if(packet.t==='VOICE_STATE_UPDATE'){
     await this.checkpoint(receivedAt);
     if(data.member?.user?.id===data.user_id)this.bots.set(data.user_id,Boolean(data.member.user.bot));
     if(data.channel_id)this.voices.set(data.user_id,data.channel_id);else this.voices.delete(data.user_id);
    }else if(packet.t==='CHANNEL_CREATE'||packet.t==='CHANNEL_UPDATE'){await this.checkpoint(receivedAt);this.channels.set(data.id,data.type);}
    else if(packet.t==='CHANNEL_DELETE'){await this.checkpoint(receivedAt);this.channels.delete(data.id);}
    else if(packet.t==='GUILD_UPDATE'){await this.checkpoint(receivedAt);this.afk=data.afk_channel_id??null;}
    else if(packet.t==='GUILD_DELETE'){await this.checkpoint(receivedAt);this.ready=false;this.voices.clear();}
   }).catch(()=>{this.error='event_retry';console.warn('voice_event_pending');});});
   const closed=(code?:number)=>{if(socket!==this.socket)return;this.disconnect(code===4004?'bot_authentication_failed':'disconnected');if(code===4007||code===4009){this.session='';this.resumeUrl='';this.seq=null;this.voices.clear();}if(code===4008)this.nextConnect=Math.max(this.nextConnect,Date.now()+60000);if([4004,4010,4011,4012,4013,4014].includes(code??0)){this.stopped=true;this.error='bot_configuration_error';}};
   socket.addEventListener('close',e=>closed(e.code));socket.addEventListener('error',()=>closed());
  }catch(error){this.error=error instanceof Error&&/^discord_http_\d{3}$/.test(error.message)?'gateway_'+error.message:'connection_retry';console.warn('voice_connection_pending');this.nextConnect=Math.max(this.nextConnect,Date.now()+30000);}
 }
 async alarm(){await this.init;await this.serial(async()=>{
  try{
   await this.checkpoint();
   // Resolve human/bot metadata before counting anyone omitted from the guild snapshot.
   for(const user of [...this.voices.keys()].filter(u=>!this.bots.has(u)).slice(0,5)){
    try{const member=await this.api('/guilds/'+this.guild+'/members/'+user);if(member.user?.id===user)this.bots.set(user,Boolean(member.user.bot));}catch{break;}
   }
   await this.connect();
   if(this.token&&!this.stopped&&!this.commandsRegistered&&Date.now()>=this.commandsAfter){
    try{
     if(await this.ctx.storage.get('kp_command_version')!==KP_COMMAND_VERSION){await registerKpCommands(discord.applicationId,this.guild,(path,method,body)=>this.api(path,this.token,method,body));await this.ctx.storage.put('kp_command_version',KP_COMMAND_VERSION);}
     this.commandsRegistered=true;this.commandsError='';
    }catch{this.commandsError='registration_pending';this.commandsAfter=Date.now()+300000;console.warn('kp_commands_pending');}
   }
  }catch{console.warn('voice_checkpoint_pending');}
  finally{if(this.token)await this.ctx.storage.setAlarm(Date.now()+30000);}
 });}
 async fetch(request:Request){await this.init;return this.serial(async()=>{
  const url=new URL(request.url);
  if(url.pathname==='/configure'&&request.method==='POST'){
   const body=await request.json() as {encryptedToken?:string;guildId?:string};
   if(body.guildId!==this.guild||typeof body.encryptedToken!=='string'||body.encryptedToken.length>1024)return new Response('Invalid configuration',{status:400});
   let token:string;try{token=await decryptVoiceToken(this.env,body.encryptedToken);}catch{this.error='configuration_decrypt_failed';return new Response('Configuration pending',{status:503});}
   if(!token||token.length>256||/\s/.test(token))return new Response('Invalid token',{status:400});
   if(token!==this.token||this.stopped){
    let bot:any,guild:any;
    try{bot=await this.api('/users/@me',token);}catch(error){this.error=error instanceof Error&&/^discord_http_\d{3}$/.test(error.message)?'bot_'+error.message:'bot_check_pending';return new Response('Bot unavailable',{status:503});}
    try{guild=await this.api('/guilds/'+this.guild,token);}catch(error){this.error=error instanceof Error&&/^discord_http_\d{3}$/.test(error.message)?'guild_'+error.message:'guild_check_pending';return new Response('Guild unavailable',{status:503});}
    if(bot.bot!==true||guild.id!==this.guild){this.error='bot_or_guild_mismatch';return new Response('Bot unavailable',{status:400});}
    await this.checkpoint();this.disconnect('reconfiguring');this.session='';this.seq=null;this.resumeUrl='';this.voices.clear();
    this.token=token;this.stopped=false;this.nextConnect=0;
   }
   this.encrypted=body.encryptedToken;
   await this.ctx.storage.put('config',{encryptedToken:this.encrypted,guildId:this.guild});await this.ctx.storage.setAlarm(Date.now()+1000);
   return Response.json({accepted:true});
  }
  if(url.pathname==='/ensure'){await this.connect();if(this.token)await this.ctx.storage.setAlarm(Date.now()+30000);return Response.json(this.status());}
  if(url.pathname==='/progress'){
   const user=url.searchParams.get('user')??'';const record=await this.clock.progress(user,Date.now());
   return Response.json({...this.status(),observedMs:record.ms,eligible:this.active().includes(user)});
  }
  return Response.json(this.status());
 });}
 private status(){return {enabled:Boolean(this.token)&&!this.stopped,connected:this.confirmed(),tracked:this.active().length,lastConfirmedAt:this.lastAck,error:this.error,commandsRegistered:this.commandsRegistered,commandsError:this.commandsError};}
}
