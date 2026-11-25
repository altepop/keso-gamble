// One-time, opt-in VDK rescue press. Only the designated Discord channel is accepted.
export const VDK_RESCUE_CHANNEL='1571645754903371899';
export const VDK_RESCUE_ID='vdk-rescue-press:2026-11-16:platinum2-mention-v2';
export const VDK_RESCUE_BODY=[
'<@822082339776495616>\n🗞️ **【緊急プレス】VDKを救いたい。**',
'**――かつてのダイヤモンド、プラチナ2へ転落。**',
'',
'KESOTOWNは、VALORANTプレイヤー「VDK（Dolly#SDGs）」の成績不振を受け、特別コーチング企画 **「VDKを救いたい」** の始動を発表する。',
'',
'最高到達ランクはダイヤモンド1。しかし現在のランクは **プラチナ2**。',
'直近に確認した現ACTの記録は **32勝40敗2分・勝率43.2%／K/D 0.88／ACS 186.1**。',
'Abyssは2勝8敗、Bindは2勝7敗、Havenは1勝4敗。苦戦は明白だ。',
'',
'だが、希望はある。**Cloveは13試合で勝率69.2%**。',
'勝てる力がないのではない。勝てる条件を再現できていないのだ。',
'',
'本企画では試合を分析し、エージェント選択、交戦判断、立ち回り、連携を見直す。',
'**目標はプラチナ2からの脱出。そしてダイヤモンドへの帰還。**',
'',
'KESOTOWNはVDKの復活を本気で目指す。',
'**VDKを救いたい。**',
'――これは、ひとりの男の再起を懸けた挑戦である。',
'-# 戦績は確認時点の記録。現在ランクは本人からの申告。',
].join('\n');
type Env={DB:D1Database;KESO_COACH_WEBHOOK_URL?:string};
type Receipt={state:'claimed'|'posted'|'unknown'|'rejected';at:number;channelId?:string;messageId?:string;httpStatus?:number};
const ready=new WeakSet<object>();
async function ensure(env:Env){
 if(ready.has(env.DB))return;
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS monitor_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)').run();
 ready.add(env.DB);
}
function webhook(env:Env){
 if(!env.KESO_COACH_WEBHOOK_URL)return null;
 const url=new URL(env.KESO_COACH_WEBHOOK_URL);
 if(url.protocol!=='https:'||url.hostname!=='discord.com'||!/^\/api\/webhooks\/\d{15,22}\/[A-Za-z0-9._-]+\/?$/.test(url.pathname))return null;
 return url;
}
export async function vdkRescuePress(env:Env,request:typeof fetch=fetch,now=Date.now()){
 const url=webhook(env);if(!url)return false;
 await ensure(env);
 // Verify the actual destination before claiming or posting. Never trust the configured name.
 let details:{channel_id?:string;id?:string};
 try{
  const check=await request(url,{signal:AbortSignal.timeout(12000)});
  if(!check.ok)return false;
  details=await check.json() as typeof details;
 }catch{return false;}
 if(details.channel_id!==VDK_RESCUE_CHANNEL||details.id!==url.pathname.split('/')[3])return false;
 const receipt:Receipt={state:'claimed',at:now};
 const claim=await env.DB.prepare('INSERT OR IGNORE INTO monitor_state(key,value) VALUES(?,?)').bind(VDK_RESCUE_ID,JSON.stringify(receipt)).run();
 if(!claim.meta.changes)return false;
 // Claim before send: a lost response is unknown and must never be automatically retried.
 url.searchParams.set('wait','true');
 try{
  const response=await request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:VDK_RESCUE_BODY,allowed_mentions:{parse:[],users:['822082339776495616']},username:'バチコーンbot'}),signal:AbortSignal.timeout(15000)});
  receipt.httpStatus=response.status;
  if(response.ok){
   const msg=await response.json() as {id?:string;channel_id?:string;content?:string};
   if(/^\d{15,22}$/.test(msg.id??'')&&msg.channel_id===VDK_RESCUE_CHANNEL&&msg.content===VDK_RESCUE_BODY){
    receipt.state='posted';receipt.channelId=msg.channel_id;receipt.messageId=msg.id;
   }else receipt.state='unknown';
  }else receipt.state=response.status>=400&&response.status<500?'rejected':'unknown';
 }catch{receipt.state='unknown';}
 await env.DB.prepare('UPDATE monitor_state SET value=? WHERE key=?').bind(JSON.stringify(receipt),VDK_RESCUE_ID).run();
 return receipt.state==='posted';
}
export async function vdkRescueStatus(env:Env){
 await ensure(env);
 const row=await env.DB.prepare('SELECT value FROM monitor_state WHERE key=?').bind(VDK_RESCUE_ID).first<{value:string}>();
 const receipt=row?JSON.parse(row.value) as Receipt:null;
 return {release:VDK_RESCUE_ID,configured:Boolean(webhook(env)),state:receipt?.state??'not-started',posted:receipt?.state==='posted',channelVerified:receipt?.channelId===VDK_RESCUE_CHANNEL,messageId:receipt?.messageId??null};
}
