import sealed from '../member-names.encrypted.json' with {type:'json'};
import {decryptKpMapping} from './kp.ts';
import type {KpEnv} from './kp.ts';
export interface MemberNames {guildId:string;names:Array<{suffix?:string;userId?:string;name:string}>}
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
   const key=env.KP_BOOTSTRAP_PRIVATE_KEY;if(!key)return names;
   if(!configs.has(key))configs.set(key,decryptKpMapping(key,sealed).then(validate));
   config=await configs.get(key)!;
  }
 }catch{return names;}
 if(config.guildId!==guild)return names;
 for(const alias of config.names){
  if(alias.userId)continue;
  const suffix=alias.suffix!;
  const key='member-name:'+guild+':'+suffix;
  let saved=await env.DB.prepare('SELECT value FROM kp_settings WHERE key=?').bind(key).first<{value:string}>();
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
 return names;
}
