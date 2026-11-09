import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import discord from '../discord-config.json' with {type:'json'};
import {appWebhookApi,appWebhook} from '../src/app-webhook.ts';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 class Q{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...v:unknown[]){return new Q(this.text,v);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 return {DB:{prepare:(s:string)=>new Q(s),batch:(qs:Q[])=>qs.map(q=>q.run())} as unknown as D1Database,DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/plain',DISCORD_CLIENT_SECRET:'secret'};
}
const W='https://worker.example';
test('the owned webhook is set up once through Discord, only for this guild and the 速報 channel, and a state works once',async()=>{
 const env=fixture();
 const start=await appWebhookApi(new Request(W+'/api/discord/app-webhook/start'),env);
 assert.equal(start.status,302);const to=new URL(start.headers.get('Location')!);
 assert.equal(to.origin+to.pathname,'https://discord.com/oauth2/authorize');assert.equal(to.searchParams.get('scope'),'webhook.incoming');
 assert.equal(to.searchParams.get('redirect_uri'),W+'/api/discord/app-webhook/callback');assert.equal(to.searchParams.get('guild_id'),discord.guildId);
 const state=to.searchParams.get('state')!;
 const exchange=(channel:string,seen:string[]=[])=>(async(url:RequestInfo|URL,init?:RequestInit)=>{seen.push(String(url));
  if(String(url).endsWith('/123/plain'))return Response.json({id:'123',name:'アカンbot',avatar:'abc',channel_id:'speed',guild_id:discord.guildId});
  assert.equal(new URLSearchParams(String(init?.body)).get('redirect_uri'),W+'/api/discord/app-webhook/callback');
  return Response.json({webhook:{id:'77',token:'owned',guild_id:discord.guildId,channel_id:channel,application_id:discord.applicationId}});}) as typeof fetch;
 const wrong=await appWebhookApi(new Request(`${W}/api/discord/app-webhook/callback?code=c&state=${state}`),env,exchange('other'));
 assert.equal(wrong.status,400);assert.match(await wrong.text(),/速報/);assert.equal(await appWebhook(env),null);
 const again=await appWebhookApi(new Request(`${W}/api/discord/app-webhook/callback?code=c&state=${state}`),env,exchange('speed'));
 assert.equal(again.status,400,'a used state cannot be replayed');
 const fresh=new URL((await appWebhookApi(new Request(W+'/api/discord/app-webhook/start'),env)).headers.get('Location')!).searchParams.get('state')!;
 const ok=await appWebhookApi(new Request(`${W}/api/discord/app-webhook/callback?code=c&state=${fresh}`),env,exchange('speed'));
 assert.equal(ok.status,200);
 const hook=(await appWebhook(env))!;assert.equal(hook.url.toString(),'https://discord.com/api/webhooks/77/owned');
 assert.equal(hook.username,'アカンbot');assert.equal(hook.avatarUrl,'https://cdn.discordapp.com/avatars/123/abc.png');
 assert.doesNotMatch(await ok.text(),/owned/,'the token is never shown');
});
