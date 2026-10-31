// One-time, credential-preserving activation of the existing Discord Activity
// Primary Entry Point. Discord's OAuth client-credentials scope
// "applications.commands.update" does not require a Bot Token.
// Invoked separately from game cron work, with a durable D1 lease/backoff.
import type {Env} from './index.ts';
import discord from '../discord-config.json' with {type:'json'};
const KEY='discord:activity-entrypoint-handler:v1';
const HOUR=3600000,ATTEMPT_LEASE=10*60000;
const checked=new WeakSet<object>();
type Requester=typeof fetch;
async function safeJson(response:Response,stage:string){
 if(!response.ok)throw Error('Discord Activity '+stage+' was rejected');
 try{return await response.json() as Record<string,unknown>;}catch{throw Error('Discord Activity '+stage+' returned invalid JSON');}
}
export async function applySilentEntryWithOAuth(applicationId:string,clientSecret:string,request:Requester=fetch){
 if(!/^\d{15,22}$/.test(applicationId)||!clientSecret||clientSecret.length>2048||/[\r\n]/.test(clientSecret))
  throw Error('Invalid Discord Activity configuration');
 const creds=btoa(applicationId+':'+clientSecret);
 const oauth=await safeJson(await request('https://discord.com/api/v10/oauth2/token',{
  method:'POST',headers:{Authorization:'Basic '+creds,'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'client_credentials',scope:'applications.commands.update'}),
  signal:AbortSignal.timeout(12000)
 }),'authorization');
 if(typeof oauth.access_token!=='string'||!oauth.access_token||oauth.token_type!=='Bearer'
    ||typeof oauth.scope!=='string'||!oauth.scope.split(' ').includes('applications.commands.update'))
  throw Error('Discord did not grant command update scope');
 const base='https://discord.com/api/v10/applications/'+applicationId+'/commands';
 const headers={Authorization:'Bearer '+oauth.access_token,'Content-Type':'application/json'};
 const commandResult=await request(base,{headers,signal:AbortSignal.timeout(12000)});
 if(!commandResult.ok)throw Error('Discord Entry Point lookup was rejected');
 const commands=await commandResult.json() as unknown;
 if(!Array.isArray(commands))throw Error('Discord returned malformed commands');
 const items=commands.filter((x:unknown):x is {id:string;type:number;application_id:string;handler:number}=>Boolean(x&&typeof x==='object'&&(x as {type?:number}).type===4));
 if(items.length!==1||!/^\d{15,22}$/.test(items[0].id)||items[0].application_id!==applicationId||![1,2].includes(items[0].handler))
  throw Error('Ambiguous Discord Entry Point; no update was attempted');
 const current=items[0];
 if(current.handler===1)return {updated:false,handler:1};
 const endpoint=base+'/'+current.id;
 const updated=await safeJson(await request(endpoint,{method:'PATCH',headers,body:JSON.stringify({handler:1}),signal:AbortSignal.timeout(12000)}),'patch');
 if(updated.id!==current.id||updated.application_id!==applicationId||updated.type!==4||updated.handler!==1)
  throw Error('Discord Entry Point change could not be confirmed');
 const verified=await safeJson(await request(endpoint,{headers,signal:AbortSignal.timeout(12000)}),'verification');
 if(verified.id!==current.id||verified.application_id!==applicationId||verified.type!==4||verified.handler!==1)
  throw Error('Discord Entry Point confirmation failed');
 return {updated:true,handler:1};
}
export async function silentEntryStatus(env:Pick<Env,'DB'|'DISCORD_CLIENT_SECRET'>){
 const row=await env.DB.prepare('SELECT value FROM monitor_state WHERE key=?').bind(KEY).first<{value:string}>();
 return {handlerConfirmed:row?.value==='done',clientCredentialsConfigured:Boolean(env.DISCORD_CLIENT_SECRET)};
}
export async function migrateSilentEntryPoint(env:Pick<Env,'DB'|'DISCORD_CLIENT_SECRET'>,now=Date.now(),request:Requester=fetch){
 if(!env.DISCORD_CLIENT_SECRET||checked.has(env.DB))return 'unavailable';
 checked.add(env.DB); // one read per isolate, not one per cron minute
 const old=await env.DB.prepare('SELECT value FROM monitor_state WHERE key=?').bind(KEY).first<{value:string}>();
 if(old?.value==='done')return 'done';
 if(old&&Number(old.value)>now)return 'backoff';
 const lease=String(now+ATTEMPT_LEASE);
 const result=await env.DB.prepare(`INSERT INTO monitor_state(key,value) VALUES(?,?)
 ON CONFLICT(key) DO UPDATE SET value=excluded.value
 WHERE monitor_state.value!='done' AND CAST(monitor_state.value AS INTEGER)<=?`).bind(KEY,lease,now).run();
 if(!result.meta.changes)return 'locked';
 try{
  await applySilentEntryWithOAuth(discord.applicationId,env.DISCORD_CLIENT_SECRET,request);
  await env.DB.prepare('UPDATE monitor_state SET value=? WHERE key=? AND value=?').bind('done',KEY,lease).run();
  console.info('discord_activity_entrypoint_ready');
  return 'activated';
 }catch{
  await env.DB.prepare('UPDATE monitor_state SET value=? WHERE key=? AND value=?').bind(String(now+HOUR),KEY,lease).run();
  console.warn('discord_activity_entrypoint_retry_later');
  return 'pending';
 }
}
