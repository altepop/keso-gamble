import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {Client,GatewayIntentBits} from 'discord.js';
import {MusicController} from './player.mjs';

const DISCORD_BOT_TOKEN=process.env.DISCORD_BOT_TOKEN;
const MUSIC_BRIDGE_TOKEN=process.env.MUSIC_BRIDGE_TOKEN;
const MUSIC_GUILD_ID=process.env.MUSIC_GUILD_ID;
const PORT=Number(process.env.PORT??10000);
if(!DISCORD_BOT_TOKEN||!MUSIC_BRIDGE_TOKEN||MUSIC_BRIDGE_TOKEN.length<32
  ||!/^\d{15,22}$/.test(MUSIC_GUILD_ID??'')||!Number.isInteger(PORT)||PORT<1||PORT>65535){
 console.error('Music voice service configuration incomplete (token, bridge token, guild or port)');
 process.exit(1);
}
function equal(a,b){
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length && timingSafeEqual(x,y);
}
function reply(response,status,body){
 response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
 response.end(JSON.stringify(body));
}
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildVoiceStates]});
const music=new MusicController(client);
const receipts=new Map();
function pruneReceipts(now){
 if(receipts.size<200)return;
 for(const [id,entry] of receipts)if(entry.expiresAt<now)receipts.delete(id);
 while(receipts.size>600)receipts.delete(receipts.keys().next().value);
}
async function readBody(req){
 let size=0;const parts=[];
 for await(const chunk of req){
  size+=chunk.length;
  if(size>4096)throw Error('REQUEST_TOO_LARGE');
  parts.push(chunk);
 }
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
const server=createServer(async(req,res)=>{
 const path=new URL(req.url??'/', 'http://localhost').pathname;
 if(req.method==='GET'&&path==='/health'){
  return reply(res,200,{status:music.health().ready?'ready':'starting',active:music.health().active});
 }
 if(req.method!=='POST'||path!=='/v1/music')
  return reply(res,404,{ok:false,message:'Not found'});
 const token=String(req.headers.authorization??'').replace(/^Bearer /,'');
 if(!equal(token,MUSIC_BRIDGE_TOKEN))return reply(res,401,{ok:false,message:'Unauthorized'});
 try{
  const data=await readBody(req);
  const {guildId,userId,requestId,action,track,volume,loop}=data??{};
  if(guildId!==MUSIC_GUILD_ID||!/^\d{15,22}$/.test(userId??'')
    ||!/^\d{15,22}$/.test(requestId??'')||typeof action!=='string'||action.length>20)
    return reply(res,400,{ok:false,message:'Invalid music request'});
  pruneReceipts(Date.now());
  const existing=receipts.get(requestId);
  if(existing){
   if(existing.fingerprint!==JSON.stringify([guildId,userId,action,track,volume,loop]))
    return reply(res,409,{ok:false,message:'Interaction ID was already used'});
   const result=await existing.result;
   return reply(res,result.ok?200:400,result);
  }
  const fingerprint=JSON.stringify([guildId,userId,action,track,volume,loop]);
  const pending=music.request({guildId,userId,action,track,volume,loop})
   .then(message=>({ok:true,message}),error=>({
     ok:false,message:error instanceof Error&&/[\u3040-\u30ff\u4e00-\u9faf]/.test(error.message)
      ?error.message.slice(0,180):'音楽再生を処理できなかった。',
   }));
  receipts.set(requestId,{fingerprint,result:pending,expiresAt:Date.now()+15*60_000});
  const result=await pending;
  return reply(res,result.ok?200:400,result);
 }catch(error){
  return reply(res,error instanceof Error&&error.message==='REQUEST_TOO_LARGE'?413:400,
    {ok:false,message:'音楽コマンドの形式を確認してほしい。'});
 }
});
server.requestTimeout=30_000;
server.listen(PORT,'0.0.0.0',()=>console.info('music_voice_http_ready'));
client.once('clientReady',()=>console.info('music_voice_discord_ready'));
client.login(DISCORD_BOT_TOKEN).catch(()=>{
 console.error('music_voice_discord_login_failed');
 process.exitCode=1;server.close();client.destroy();
});
function shutdown(){
 server.close();client.destroy();
}
process.once('SIGTERM',shutdown);
process.once('SIGINT',shutdown);
