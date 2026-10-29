import discord from '../discord-config.json' with { type: 'json' };
import {kpHash,kpRandom} from './kp.ts';
// あかんbot's results with buttons (スカーミッシュの受取／続行): Discord only lets a webhook owned by the application send
// interactive buttons, and the 速報 webhook was made by hand. An administrator creates one owned webhook once through
// Discord's own consent screen (scope webhook.incoming), choosing the 速報 channel; the Worker keeps it in D1 and posts
// with あかんbot's name and icon. Only a webhook for this guild and the 速報 channel is accepted.
export interface AppWebhookEnv {DB:D1Database;DISCORD_WEBHOOK_URL:string;DISCORD_CLIENT_SECRET?:string}
export interface AppWebhook {url:URL;username?:string;avatarUrl?:string}
const ready=new WeakSet<object>();
async function ensure(env:AppWebhookEnv){
 if(ready.has(env.DB))return;
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS app_webhooks(name TEXT PRIMARY KEY,data TEXT NOT NULL,at INTEGER NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS app_webhook_states(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL)'),
 ]);
 ready.add(env.DB);
}
const page=(status:number,text:string)=>new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>あかんbot</title><body style="font-family:sans-serif;padding:24px;line-height:1.7"><p>${text}</p></body>`,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
const callbackUrl=(request:Request)=>new URL(request.url).origin+'/api/discord/app-webhook/callback';
export async function appWebhookApi(request:Request,env:AppWebhookEnv,fetcher:typeof fetch=fetch):Promise<Response>{
 if(request.method!=='GET')return new Response('Method Not Allowed',{status:405});
 if(!env.DISCORD_CLIENT_SECRET)return page(503,'Discordアプリの設定（Client Secret）がまだありません。');
 await ensure(env);
 const url=new URL(request.url);
 if(url.pathname==='/api/discord/app-webhook/start'){
  const state=kpRandom(),now=Date.now();
  await env.DB.batch([
   env.DB.prepare('DELETE FROM app_webhook_states WHERE expires<?').bind(now),
   env.DB.prepare('INSERT INTO app_webhook_states VALUES(?,?)').bind(await kpHash(state),now+10*60000),
  ]);
  const authorize=new URL('https://discord.com/oauth2/authorize');
  for(const [k,v] of Object.entries({client_id:discord.applicationId,response_type:'code',scope:'webhook.incoming',redirect_uri:callbackUrl(request),state,guild_id:discord.guildId,disable_guild_select:'true'}))authorize.searchParams.set(k,v);
  return Response.redirect(authorize.toString(),302);
 }
 if(url.pathname!=='/api/discord/app-webhook/callback')return new Response('Not Found',{status:404});
 const state=url.searchParams.get('state')??'',code=url.searchParams.get('code')??'';
 if(!/^[a-f0-9]{48}$/.test(state)||!code||code.length>2048)return page(400,'Discordの画面からやり直してください。');
 const valid=await env.DB.prepare('DELETE FROM app_webhook_states WHERE hash=? AND expires>? RETURNING hash').bind(await kpHash(state),Date.now()).first();
 if(!valid)return page(400,'期限切れか使用済みのリンクです。もう一度はじめから開いてください。');
 try{
  const current=await (await fetcher(env.DISCORD_WEBHOOK_URL,{signal:AbortSignal.timeout(10000)})).json() as {id?:string;name?:string;avatar?:string|null;channel_id?:string;guild_id?:string};
  const token=await fetcher('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(10000),
   body:new URLSearchParams({client_id:discord.applicationId,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:callbackUrl(request)})});
  if(!token.ok)return page(400,'Discordの承認を確認できませんでした。もう一度はじめから開いてください。');
  const hook=(await token.json() as {webhook?:{id?:string;token?:string;guild_id?:string;channel_id?:string;application_id?:string}}).webhook;
  if(!hook?.id||!/^\d+$/.test(hook.id)||!hook.token||hook.application_id!==discord.applicationId)return page(400,'Webhookを作れませんでした。もう一度はじめから開いてください。');
  if(hook.guild_id!==discord.guildId||!current.channel_id||hook.channel_id!==current.channel_id)return page(400,'あかんbotと同じ「速報」チャンネルを選んでください。');
  const data={url:`https://discord.com/api/webhooks/${hook.id}/${hook.token}`,username:current.name,avatarUrl:current.id&&current.avatar?`https://cdn.discordapp.com/avatars/${current.id}/${current.avatar}.png`:undefined};
  await env.DB.prepare("INSERT INTO app_webhooks VALUES('akan',?,?) ON CONFLICT(name) DO UPDATE SET data=excluded.data,at=excluded.at").bind(JSON.stringify(data),Date.now()).run();
  return page(200,'設定しました。次のスカーミッシュの勝利から、あかんbotの速報に受取／続行のボタンが付きます。このページは閉じて大丈夫です。');
 }catch{console.warn('app_webhook_setup_failed');return page(502,'Discordに接続できませんでした。少し待ってもう一度お試しください。');}
}
export async function appWebhook(env:AppWebhookEnv):Promise<AppWebhook|null>{
 await ensure(env);
 const row=await env.DB.prepare("SELECT data FROM app_webhooks WHERE name='akan'").first<{data:string}>();
 if(!row)return null;
 try{const d=JSON.parse(row.data) as {url:string;username?:string;avatarUrl?:string};const url=new URL(d.url);if(url.hostname!=='discord.com'||!url.pathname.startsWith('/api/webhooks/'))return null;return {url,username:d.username,avatarUrl:d.avatarUrl};}catch{return null;}
}
/** The owned webhook was deleted in Discord: forget it and go back to the plain 速報 webhook. */
export async function forgetAppWebhook(env:AppWebhookEnv){await ensure(env);await env.DB.prepare("DELETE FROM app_webhooks WHERE name='akan'").run();}
