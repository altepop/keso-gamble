import {activityLaunchComponents} from './activity-link.ts';
import type {KpEnv,KpMapping} from './kp.ts';
import {earningsWebhook} from './racing-posts.ts';
import type {PostEnv} from './racing-posts.ts';
import {raceSeed} from './racing-kp.ts';
import {raceEntries} from './racing-horses.ts';
import {crownFor} from './racing-crowns.ts';
// @ts-expect-error Shared deterministic race model.
import {RACE_INTERVAL,RUN_MS,COURSE_M,bigRaceName,fillerCrownName,raceCard,raceResult,raceTimeline,raceOdds,raceCommentary,distanceAt} from '../../../js/racing.js';
export type BroadcastEnv=PostEnv&{RACE_BROADCAST?:DurableObjectNamespace};
export interface RaceShow {card:any;timeline:any;order:number[];commentary:Array<{t:number;text:string}>;odds:any}
export interface BroadcastRow {guild:string;race:number;snapshot:string;message:string|null;channel:string|null;step:number;retry_at:number;video:string;lease:string|null;lease_until:number;video_message:string|null}
const ready=new WeakSet<object>();
export async function ensureBroadcast(env:KpEnv){
 if(ready.has(env.DB))return;
 await env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS race_broadcasts(guild TEXT NOT NULL,race INTEGER NOT NULL,snapshot TEXT NOT NULL,message TEXT,channel TEXT,step INTEGER NOT NULL DEFAULT -1,retry_at INTEGER NOT NULL DEFAULT 0,video TEXT NOT NULL DEFAULT 'pending',lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0,video_message TEXT,PRIMARY KEY(guild,race))`),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS race_broadcast_video ON race_broadcasts(video,race)'),
 ]);ready.add(env.DB);
}
export function raceShow(card:any,seed:string):RaceShow{
 const result=raceResult(card,seed),timeline=raceTimeline(card,result,seed);
 // Renderer receives no seed, owner IDs, account balances or private API credentials.
 return {card:{id:card.id,start:card.start,name:card.name,size:card.size,horses:card.horses.map((h:any)=>({number:h.number,name:h.name}))},timeline,order:result.order,commentary:raceCommentary(card,result,timeline,raceOdds(card),seed),odds:raceOdds(card)};
}
const clean=(s:string)=>s.replace(/[@`*_~<>|\r\n]/g,'').slice(0,65);
export const broadcastStep=(start:number,now:number)=>now<start?0:now>=start+RUN_MS?11:1+Math.floor((now-start)/5000);
export function liveRacePost(show:RaceShow,now:number){
 const {card,timeline,order}=show,t=Math.max(0,now-card.start),finished=t>=RUN_MS;
 const name=(n:number)=>clean(card.horses.find((h:any)=>h.number===n).name);
 const title=`${finished?'🏁':now<card.start?'🏇':'🔴'} **${clean(card.name)}**`;
 if(now<card.start)return {content:[title,`<t:${Math.floor(card.start/1000)}:t> 発走 · あと<t:${Math.floor(card.start/1000)}:R>`,`締切 <t:${Math.floor((card.start-60000)/1000)}:t>　\`/bet\` で購入`,...card.horses.map((h:any)=>`${h.number}番 ${name(h.number)}　${(show.odds.win[h.number]/10).toFixed(1)}倍`),'この投稿で実況します。Activityを開かなくても観戦できます。'].join('\n'),allowed_mentions:{parse:[]},components:activityLaunchComponents()};
 const ranked=[...order].sort((a,b)=>distanceAt(timeline,b,t)-distanceAt(timeline,a,t));
 const line=show.commentary.filter(c=>c.t<=t).at(-1)?.text??'スタート！';
 return {content:[title,finished?'**確定順位**':`発走から${Math.floor(t/1000)}秒 · 残り約${Math.max(0,Math.ceil((COURSE_M-distanceAt(timeline,ranked[0],t))/100))*100}m`,finished?order.slice(0,3).map((n,i)=>`${['🥇','🥈','🥉'][i]} ${i+1}着 ${n}番 **${name(n)}**`).join('\n'):'```\n'+card.horses.map((h:any)=>{const pos=Math.min(14,Math.floor(distanceAt(timeline,h.number,t)/COURSE_M*14));return `${String(h.number).padStart(2)} ${'━'.repeat(pos)}🐎${'─'.repeat(14-pos)} ${name(h.number)}`;}).join('\n')+'\n```',`💬 ${clean(line)}`,finished?'レースは確定しました。配当は既存の口座処理で精算します。':'約5秒ごとに更新します。'].join('\n').slice(0,1950),allowed_mentions:{parse:[]},components:activityLaunchComponents()};
}
/** Cron arms an alarm before the start; no viewer or Activity session is needed. */
export async function prepareRaceBroadcast(env:BroadcastEnv,mapping:KpMapping,now=Date.now()){
 if(!env.RACE_BROADCAST||!earningsWebhook(env))return;
 await ensureBroadcast(env);
 const latest=Math.floor(now/RACE_INTERVAL)*RACE_INTERVAL;
 for(const id of [latest,latest+RACE_INTERVAL]){
  if(now<id-180000||now>=id+RUN_MS)continue; // Never replay an old race as a live race.
  const crown=await crownFor(env,mapping.guildId,id),entries=await raceEntries(env,mapping,id);
  const bets=await env.DB.prepare("SELECT 1 FROM kp_state s,json_each(s.data,'$.raceBets') b WHERE s.guild=? AND json_extract(b.value,'$.raceId')=? LIMIT 1").bind(mapping.guildId,id).first();
  if(!bigRaceName(id)&&!fillerCrownName(id)&&!crown&&!entries.length&&!bets)continue;
  const card={...raceCard(id,undefined,entries),...(crown?{name:crown.name}:{})};
  const {seed}=await raceSeed(env,mapping.guildId,id);
  await env.DB.prepare('INSERT OR IGNORE INTO race_broadcasts(guild,race,snapshot) VALUES(?,?,?)').bind(mapping.guildId,id,JSON.stringify(raceShow(card,seed))).run();
 }
 await env.RACE_BROADCAST.get(env.RACE_BROADCAST.idFromName('guild:'+mapping.guildId)).fetch('https://race/ensure',{method:'POST',body:JSON.stringify({guild:mapping.guildId})});
}
export class RaceBroadcaster {
 private ctx:DurableObjectState;private env:BroadcastEnv;
 constructor(ctx:DurableObjectState,env:BroadcastEnv){this.ctx=ctx;this.env=env;}
 async fetch(request:Request){
  if(request.method!=='POST'||new URL(request.url).pathname!=='/ensure')return new Response('Not found',{status:404});
  const {guild}=await request.json() as {guild:string};if(!/^\d{15,22}$/.test(guild))return new Response('Invalid guild',{status:400});
  await this.ctx.storage.put('guild',guild);
  const alarm=await this.ctx.storage.getAlarm();if(!alarm||alarm>Date.now()+1000)await this.ctx.storage.setAlarm(Date.now()+1000);
  return Response.json({armed:true});
 }
 async alarm(){
  const guild=await this.ctx.storage.get<string>('guild');if(!guild)return;
  await ensureBroadcast(this.env);const now=Date.now();
  const row=await this.env.DB.prepare("SELECT * FROM race_broadcasts WHERE guild=? AND race>=? AND step<11 AND (message IS NULL OR message NOT IN ('creating','unknown','missing')) ORDER BY race LIMIT 1").bind(guild,now-6*3600000).first<BroadcastRow>();
  if(!row)return;
  if(row.retry_at>now){await this.ctx.storage.setAlarm(row.retry_at);return;}
  const step=broadcastStep(row.race,now),url=earningsWebhook(this.env);if(!url)return;url.searchParams.set('with_components','true');
  try{
   if(step>row.step){
    if(row.message==='creating'||row.message==='unknown')return; // Ambiguous creation is never blindly sent again.
    const creating=!row.message;
    if(creating){const claim=await this.env.DB.prepare("UPDATE race_broadcasts SET message='creating' WHERE guild=? AND race=? AND message IS NULL").bind(guild,row.race).run();if(!claim.meta.changes)return;url.searchParams.set('wait','true');}
    else url.pathname+='/messages/'+row.message;
    const response=await fetch(url,{method:creating?'POST':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(liveRacePost(JSON.parse(row.snapshot),now)),signal:AbortSignal.timeout(10000)});
    if(response.status===429){const body=await response.json() as {retry_after?:number};const retry=now+Math.max(1000,Number(body.retry_after??5)*1000);await this.env.DB.prepare('UPDATE race_broadcasts SET message=?,retry_at=? WHERE guild=? AND race=?').bind(creating?null:row.message,retry,guild,row.race).run();await this.ctx.storage.setAlarm(retry);return;}
    if(response.status===404&&!creating){await this.env.DB.prepare("UPDATE race_broadcasts SET message='missing' WHERE guild=? AND race=?").bind(guild,row.race).run();return;}
    if(!response.ok){if(creating&&response.status<500)await this.env.DB.prepare('UPDATE race_broadcasts SET message=NULL,retry_at=? WHERE guild=? AND race=?').bind(now+60000,guild,row.race).run();throw Error('discord_http');}
    const message=creating?await response.json() as {id:string;channel_id:string}:null;
    if(creating&&(!message||!/^\d{15,22}$/.test(message.id)))throw Error('discord_response');
    await this.env.DB.prepare('UPDATE race_broadcasts SET message=?,channel=COALESCE(?,channel),step=?,retry_at=0 WHERE guild=? AND race=?').bind(message?.id??row.message,message?.channel_id??null,step,guild,row.race).run();
   }
  }catch{
   await this.env.DB.prepare("UPDATE race_broadcasts SET message='unknown' WHERE guild=? AND race=? AND message='creating'").bind(guild,row.race).run();
   console.warn('race_broadcast_pending');
  }
  if(step<11)await this.ctx.storage.setAlarm(now<row.race?Math.min(row.race,now+30000):Date.now()+5000);
 }
}
