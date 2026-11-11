import discord from '../discord-config.json' with {type:'json'};
import {GAME_CENTER_COMMANDS} from './game-center.ts';
export const GAME_COMMAND_KEY='game-center:commands:registered:v1';
export const GAME_COMMAND_VERSION='games-v1';
export interface GameRegistrationEnv {DB:D1Database;DISCORD_CLIENT_SECRET?:string}
export async function gameCommandStatus(db:D1Database){
 const value=await db.prepare('SELECT value FROM monitor_state WHERE key=?')
  .bind(GAME_COMMAND_KEY).first<{value:string}>();
 return {registered:value?.value===GAME_COMMAND_VERSION,version:GAME_COMMAND_VERSION,
  commands:GAME_CENTER_COMMANDS.map(c=>c.name)};
}
// Scoped application-token upsert. Never bulk replace unrelated commands.
export async function ensureGameCommands(env:GameRegistrationEnv,request:typeof fetch=fetch,
 pause=(ms:number)=>new Promise<void>(done=>setTimeout(done,ms))) {
 if((await gameCommandStatus(env.DB)).registered)return true;
 if(!env.DISCORD_CLIENT_SECRET)return false;
 if(!/^\d{15,22}$/.test(discord.applicationId)||!/^\d{15,22}$/.test(discord.guildId))
  throw Error('Game center Discord configuration unavailable');
 const reply=await request('https://discord.com/api/v10/oauth2/token',{
  method:'POST',headers:{Authorization:'Basic '+btoa(discord.applicationId+':'+env.DISCORD_CLIENT_SECRET),
   'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'client_credentials',scope:'applications.commands.update'}),
  signal:AbortSignal.timeout(15000),
 });
 if(!reply.ok)throw Error('Game center OAuth rejected '+reply.status);
 const oauth=await reply.json() as {access_token?:unknown;token_type?:unknown};
 if(oauth.token_type!=='Bearer'||typeof oauth.access_token!=='string'||!oauth.access_token)
  throw Error('Game center token unavailable');
 const endpoint='https://discord.com/api/v10/applications/'+discord.applicationId+
  '/guilds/'+discord.guildId+'/commands';
 for(const [i,command] of GAME_CENTER_COMMANDS.entries()){
  if(i)await pause(1500);
  const response=await request(endpoint,{
   method:'POST',headers:{Authorization:'Bearer '+oauth.access_token,'Content-Type':'application/json'},
   body:JSON.stringify(command),signal:AbortSignal.timeout(15000),
  });
  if(!response.ok)throw Error('Game center registration failed '+response.status);
  const saved=await response.json() as {id?:unknown;application_id?:unknown;guild_id?:unknown;name?:unknown;type?:unknown};
  if(typeof saved.id!=='string'||!/^\d{15,22}$/.test(saved.id)||
     saved.application_id!==discord.applicationId||saved.guild_id!==discord.guildId||
     saved.name!==command.name||saved.type!==1)throw Error('Game center registration unconfirmed');
 }
 await env.DB.prepare('INSERT INTO monitor_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  .bind(GAME_COMMAND_KEY,GAME_COMMAND_VERSION).run();
 return true;
}
