// Exact release text approved in chat on 2026-11-11. One delivery attempt only.
// The existing earnings webhook stays in Cloudflare. No arbitrary posting API is exposed.
import {earningsWebhook} from './racing-posts.ts';
type Env={DB:D1Database;KP_EARNINGS_WEBHOOK_URL?:string};
export const ESCA_PRESS_ID='approved-escalation-press:2026-11-11:rank-shields-v1';
export const ESCA_PRESS_START=Date.parse('2026-11-11T00:00:00Z');
export const ESCA_PRESS_END=Date.parse('2026-11-12T00:00:00Z');
export const escaPressActive=(now:number)=>now>=ESCA_PRESS_START&&now<ESCA_PRESS_END;
export const ESCA_PRESS_BODY=[
 '@everyone',
 '🏆 **エスカレーションもコンペ方式のランク戦に！**',
 '',
 '最初の3試合でランク認定！',
 'その後は毎試合、勝敗と個人成績でRRが上下。**100 RRで1段階昇格や！**',
 '',
 '🛡️ **ランクシールドも2枚！**',
 'ブロンズ〜イモータルのⅠでは、**0 RRで負けても2回まで降格を防ぐ！**',
 '使い切ったら次が踏ん張りどころ。勝っただけでは補充されへんで！',
 '',
 '📱 `/esca rank` → 自分のランク・シールド',
 '🏆 `/esca ranking` → エスカレーションの順位',
 '',
 '所持KPや遺物倍率はランク評価に関係なし。',
 '**誰が一番上まで登れるんか、決めよか！**',
 '',
 '※KESO独自のランク評価です。KP報酬は引き続きあります。',
].join('\n');
const seen=new WeakSet<object>();
const hash=async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ESCA_PRESS_BODY))),n=>n.toString(16).padStart(2,'0')).join('');
type Receipt={state:'claimed'|'posted'|'unknown'|'rejected';at:number;bodyHash:string;httpStatus?:number;messageId?:string;channelId?:string;mentionEveryone?:boolean;contentVerified?:boolean};
export async function approvedEscalationPress(env:Env,now=Date.now(),request:typeof fetch=fetch){
 if(!escaPressActive(now)||seen.has(env.DB))return false;
 const url=earningsWebhook(env);if(!url)return false;
 const receipt:Receipt={state:'claimed',at:now,bodyHash:await hash()};
 // Claim BEFORE sending: an unknown network outcome or DB failure must never ping everyone twice.
 const claim=await env.DB.prepare('INSERT OR IGNORE INTO monitor_state(key,value) VALUES(?,?)').bind(ESCA_PRESS_ID,JSON.stringify(receipt)).run();
 seen.add(env.DB);if(!claim.meta.changes)return false;
 url.searchParams.set('wait','true');
 try{
  const response=await request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:ESCA_PRESS_BODY,allowed_mentions:{parse:['everyone']}}),signal:AbortSignal.timeout(15000)});
  receipt.httpStatus=response.status;
  if(response.ok){
   const message=await response.json() as {id?:unknown;channel_id?:unknown;content?:unknown;mention_everyone?:unknown;webhook_id?:unknown};
   const valid=(s:unknown):s is string=>typeof s==='string'&&/^\d{15,22}$/.test(s);
   if(!valid(message.id)||!valid(message.channel_id)||message.webhook_id!==url.pathname.split('/')[3])throw Error('Unconfirmed Discord receipt');
   receipt.state='posted';receipt.messageId=message.id;receipt.channelId=message.channel_id;
   receipt.mentionEveryone=message.mention_everyone===true;receipt.contentVerified=message.content===ESCA_PRESS_BODY;
  }else receipt.state=response.status>=400&&response.status<500?'rejected':'unknown';
 }catch{receipt.state='unknown';}
 await env.DB.prepare('UPDATE monitor_state SET value=? WHERE key=?').bind(JSON.stringify(receipt),ESCA_PRESS_ID).run();
 return receipt.state==='posted'&&receipt.mentionEveryone===true&&receipt.contentVerified===true;
}
export async function escalationPressStatus(env:Env){
 const row=await env.DB.prepare('SELECT value FROM monitor_state WHERE key=?').bind(ESCA_PRESS_ID).first<{value:string}>();
 const receipt:Receipt|undefined=row?JSON.parse(row.value):undefined;
 // Never publish the webhook, channel IDs or full private delivery receipt.
 return {release:ESCA_PRESS_ID,configured:Boolean(earningsWebhook(env)),state:receipt?.state??'not-started',posted:receipt?.state==='posted',mentionEveryone:receipt?.mentionEveryone===true,contentVerified:receipt?.contentVerified===true,bodyHash:receipt?.bodyHash??await hash()};
}
