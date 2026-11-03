import sealed from '../member-names.encrypted.json' with {type:'json'};
import discord from '../discord-config.json' with {type:'json'};
import {decryptKpMapping} from './kp.ts';
import type {KpEnv} from './kp.ts';
export interface MemberNames {guildId:string;names:Array<{suffix?:string;userId?:string;name:string}>}
/** Display-only exact-ID aliases; never assign a name by matching four trailing digits. */
export const MEMBER_NAME_OVERRIDES:Readonly<Record<string,string>>={
 '827801943928995840':'小林',
};
function withExplicitAliases(names:Map<string,string>,guild:string){
 if(guild===discord.guildId)for(const [user,name] of Object.entries(MEMBER_NAME_OVERRIDES))names.set(user,name);
 return names;
}
const configs=new Map<string,Promise<MemberNames>>();
function validate(value:unknown):MemberNames{
 const config=value as MemberNames;
 if(!config||!/^\d{15,22}$/.test(config.guildId)||!Array.isArray(config.names)||config.names.length>50||config.names.some(n=>!n||!((typeof n.userId==='string'&&/^\d{15,22}$/.test(n.userId)&&n.suffix===undefined)||(typeof n.suffix==='string'&&/^\d{4}$/.test(n.suffix)&&n.userId===undefined))||typeof n.name!=='string'||!n.name.trim()||n.name.length>40)||new Set(config.names.map(n=>n.userId?'id:'+n.userId:'suffix:'+n.suffix)).size!==config.names.length)throw Error('Invalid member names');
 return config;
}
/** Resolve a short UI alias once to a full account ID. A later suffix collision must never move that name. */
export async function memberNames(env:KpEnv,guild:string,base:Map<string,string>,override?:MemberNames){
 const names=new Map(base);let config:MemberNames;
 try{
  if(override)config=validate(override);
  else{
   const key=env.KP_BOOTSTRAP_PRIVATE_KEY;if(!key)return withExplicitAliases(names,guild);
   if(!configs.has(key))configs.set(key,decryptKpMapping(key,sealed).then(validate));
   config=await configs.get(key)!;
  }
 }catch{return withExplicitAliases(names,guild);}
 if(config.guildId!==guild)return withExplicitAliases(names,guild);
 // A public feed is polled every 5 seconds. Resolve all persisted suffix
 // bindings in one indexed read rather than one SQL request per alias.
 // The fallback below still validates previously unseen suffixes and locks
 // each one to an exact wallet identity (including the collision rules).
 const suffixes=config.names.filter(n=>n.userId===undefined);
 const keys=suffixes.map(n=>'member-name:'+guild+':'+n.suffix);
 const existing=keys.length?(await env.DB.prepare('SELECT key,value FROM kp_settings WHERE key IN ('+keys.map(()=>'?').join(',')+')').bind(...keys).all<{key:string;value:string}>()).results:[];
 const bound=new Map(existing.map(row=>[row.key,row.value]));
 for(const alias of suffixes){
  const suffix=alias.suffix!;
  const key='member-name:'+guild+':'+suffix;
  let saved=bound.has(key)?{value:bound.get(key)!}:null;
  if(!saved){
   const matches=(await env.DB.prepare('SELECT user FROM kp_wallets WHERE guild=? AND substr(user,-4)=? ORDER BY user LIMIT 2').bind(guild,suffix).all<{user:string}>()).results;
   if(matches.length!==1)continue;
   await env.DB.prepare('INSERT OR IGNORE INTO kp_settings(key,value) VALUES(?,?)').bind(key,JSON.stringify({user:matches[0]!.user})).run();
   // Another request may have saved the binding first; always read the committed owner.
   saved=await env.DB.prepare('SELECT value FROM kp_settings WHERE key=?').bind(key).first<{value:string}>();
  }
  if(saved){const linked=JSON.parse(saved.value) as {user:string};if(/^\d{15,22}$/.test(linked.user)&&linked.user.endsWith(suffix))names.set(linked.user,alias.name.trim());}
 }
 // A supplied full ID is authoritative; never resolve it by its last four digits.
 for(const alias of config.names)if(alias.userId)names.set(alias.userId,alias.name.trim());
 return withExplicitAliases(names,guild);
}
