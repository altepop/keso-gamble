import discord from '../discord-config.json' with {type:'json'};
import {MUSIC_COMMAND,MUSIC_COMMAND_VERSION} from './music-command.ts';

// One indexed D1 read per existing 10-minute registration check; a single write after
// successful Discord confirmation. The marker changes when the catalog changes.
export const MUSIC_REGISTRATION_KEY='music:discord:registered:v1';
export const MUSIC_REGISTRATION_VERSION=MUSIC_COMMAND_VERSION+':'+
 MUSIC_COMMAND.options[0].options[0].choices.map(t=>t.value).join(',');
export interface MusicRegistrationEnv {DB:D1Database;DISCORD_CLIENT_SECRET?:string}

export async function musicCommandStatus(db:D1Database){
 const row=await db.prepare('SELECT value FROM monitor_state WHERE key=?')
  .bind(MUSIC_REGISTRATION_KEY).first<{value:string}>();
 return {registered:row?.value===MUSIC_REGISTRATION_VERSION,
  version:MUSIC_REGISTRATION_VERSION,
  tracks:MUSIC_COMMAND.options[0].options[0].choices.length};
}

// Only upsert the /music guild command, never bulk-replace other commands or
// request a new Bot token. Uses the same scoped OAuth Client Secret as /predict.
export async function ensureMusicCommand(env:MusicRegistrationEnv,request:typeof fetch=fetch){
 if((await musicCommandStatus(env.DB)).registered)return true;
 if(!env.DISCORD_CLIENT_SECRET)return false;
 if(!/^\d{15,22}$/.test(discord.applicationId)||!/^\d{15,22}$/.test(discord.guildId))
  throw Error('Music Discord configuration unavailable');
 const tokenResponse=await request('https://discord.com/api/v10/oauth2/token',{
  method:'POST',
  headers:{Authorization:'Basic '+btoa(discord.applicationId+':'+env.DISCORD_CLIENT_SECRET),
    'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'client_credentials',scope:'applications.commands.update'}),
  signal:AbortSignal.timeout(15_000),
 });
 if(!tokenResponse.ok)throw Error('Music OAuth rejected ('+tokenResponse.status+')');
 const auth=await tokenResponse.json() as {access_token?:unknown;token_type?:unknown};
 if(auth.token_type!=='Bearer'||typeof auth.access_token!=='string'||!auth.access_token)
  throw Error('Music OAuth token unavailable');
 const endpoint='https://discord.com/api/v10/applications/'+discord.applicationId+
  '/guilds/'+discord.guildId+'/commands';
 const response=await request(endpoint,{
  method:'POST',
  headers:{Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},
  body:JSON.stringify(MUSIC_COMMAND),signal:AbortSignal.timeout(15_000),
 });
 if(!response.ok)throw Error('Music command registration rejected ('+response.status+')');
 const saved=await response.json() as {id?:unknown;application_id?:unknown;guild_id?:unknown;
   name?:unknown;type?:unknown;options?:unknown};
 const options=Array.isArray(saved.options)?saved.options:[];
 const play=options.find((o:unknown)=>!!o&&typeof o==='object'&&'name' in o&&o.name==='play') as
  {options?:Array<{name?:string;choices?:Array<{name?:string;value?:string}>}>}|undefined;
 const choices=play?.options?.find(o=>o.name==='song')?.choices;
 if(typeof saved.id!=='string'||!/^\d{15,22}$/.test(saved.id)||
    saved.application_id!==discord.applicationId||saved.guild_id!==discord.guildId||
    saved.name!=='music'||saved.type!==1||
    !Array.isArray(choices)||choices.length!==MUSIC_COMMAND.options[0].options[0].choices.length||
    !choices.some(t=>t.name==='負け怖'&&t.value==='makekowa'))
  throw Error('Music command nine-song registration unconfirmed');
 await env.DB.prepare('INSERT INTO monitor_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  .bind(MUSIC_REGISTRATION_KEY,MUSIC_REGISTRATION_VERSION).run();
 return true;
}
