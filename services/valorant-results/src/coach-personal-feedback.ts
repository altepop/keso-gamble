import type {KpMapping} from './kp.ts';
import {resolveCoachIdentity} from './coach-identity.ts';
import {COACH_TEAM_ID} from './coach-team-consent.ts';
import {readCoachMemberReport} from './coach-member-report.ts';
import {VDK_RESCUE_CHANNEL} from './vdk-rescue-press.ts';
// These are the same approved, read-only daily presets as the Muse home screen.
// @ts-ignore the original UI inventory is intentionally a plain JS module.
import '../../../coach/muse-top-config.js';
// @ts-ignore the original UI inventory is intentionally a plain JS module.
import '../../../coach/muse-presets.js';

type Env={DB:D1Database;KESO_COACH_WEBHOOK_URL?:string};
type Receipt={state:'claimed'|'posted'|'unknown'|'rejected';at:number;httpStatus?:number;channelId?:string;messageId?:string};
type Snapshot={owner_user:string;subject_id:string;person_key:string;display_name:string};
type Archive={ended_at:number;map:string|null;players_json:string;rounds_json:string|null;kills_json:string|null};
type Player={puuid:string;team_id:string};
type Round={r:number;winner:string};
type Kill={r:number;t:number;killer:string|null;victim:string};
const safeJson=(s:string|null):unknown=>{try{return s?JSON.parse(s):null;}catch{return null;}};
const validId=(x:unknown)=>typeof x==='string'&&x.length>0&&x.length<=128;
const text=(x:unknown,n=85)=>String(x??'').replace(/[\r\n@]/g,' ').replace(/<(?=@|#|:|!)/g,'‹').trim().slice(0,n);
const localDay=(time:number)=>new Date(time+9*3600_000).toISOString().slice(0,10);
const receiptKey=(subject:string,matchId:string)=>'coach_personal_feedback:v1:'+subject+':'+matchId;
export async function claimPersonalFeedbackReceipt(db:D1Database,key:string,now:number){
 const initial:Receipt={state:'claimed',at:now};
 const row=await db.prepare('INSERT OR IGNORE INTO monitor_state(key,value) VALUES(?,?)')
  .bind(key,JSON.stringify(initial)).run();
 return Boolean(row.meta.changes);
}

function webhook(raw:string|undefined){
 if(!raw)return null;
 try{const u=new URL(raw);
  return u.protocol==='https:'&&u.hostname==='discord.com'&&
   /^\/api\/webhooks\/\d{15,22}\/[A-Za-z0-9._-]+\/?$/.test(u.pathname)&&!u.username&&!u.password?u:null;
 }catch{return null;}
}
async function permission(db:D1Database,guild:string,puuid:string):Promise<Snapshot|null>{
 // No team channel/deliveryReady check: this is a personal notification controlled
 // solely by the member's own preference and verified coach identity.
 return db.prepare(`SELECT p.owner_user,p.subject_id,p.person_key,p.display_name
 FROM coach_profiles p
 JOIN coach_profile_accounts a ON a.guild=p.guild AND a.subject_id=p.subject_id
 JOIN coach_team_consents c ON c.guild=p.guild AND c.team_id=? AND c.subject_id=p.subject_id AND c.owner_user=p.owner_user
 JOIN coach_team_notice_preferences n ON n.guild=c.guild AND n.team_id=c.team_id
  AND n.subject_id=c.subject_id AND n.owner_user=c.owner_user
 WHERE p.guild=? AND a.puuid=? AND c.joined=1 AND n.enabled=1
 AND n.consent_version=c.version AND c.version>=1
 AND EXISTS(SELECT 1 FROM kp_accounts k WHERE k.guild=p.guild AND k.user=p.owner_user)
 LIMIT 2`).bind(COACH_TEAM_ID,guild,puuid).first<Snapshot>();
}
export function largestObservedSwing(row:Archive,puuid:string):{round:number;description:string}|null{
 const ps=safeJson(row.players_json),rounds=safeJson(row.rounds_json),kills=safeJson(row.kills_json);
 if(!Array.isArray(ps)||ps.length!==10||!Array.isArray(rounds)||!Array.isArray(kills))return null;
 const players=ps as Player[],me=players.find(p=>p.puuid===puuid);
 if(!me||!validId(me.team_id)||new Set(players.map(p=>p.puuid)).size!==10)return null;
 const teams=new Map(players.map(p=>[p.puuid,p.team_id]));
 if([...teams.values()].filter(t=>t===me.team_id).length!==5||new Set(teams.values()).size!==2)return null;
 let candidate:{round:number;description:string;score:number}|null=null;
 for(const raw of rounds as Round[]){
  if(!Number.isSafeInteger(raw.r)||raw.r<0||raw.r>60||!validId(raw.winner))continue;
  const events=(kills as Kill[]).filter(k=>k.r===raw.r).sort((a,b)=>a.t-b.t);
  if(!events.length||events.some(k=>!Number.isFinite(k.t)||k.t<0||!validId(k.victim)||!validId(k.killer)||!teams.has(k.victim)||!teams.has(k.killer!)))continue;
  let us=5,them=5,peakUs=0,peakThem=0;const dead=new Set<string>();
  let invalid=false;
  for(const k of events){
   if(dead.has(k.victim)||dead.has(k.killer!)||teams.get(k.victim)===teams.get(k.killer!)){invalid=true;break;}
   dead.add(k.victim);
   if(teams.get(k.victim)===me.team_id)us--;else them--;
   peakUs=Math.max(peakUs,us-them);peakThem=Math.max(peakThem,them-us);
  }
  if(invalid)continue;
  const won=raw.winner===me.team_id;
  const margin=won?peakThem:peakUs;
  if(margin<1)continue;
  const score=margin;
  if(!candidate||score>candidate.score)candidate={round:raw.r+1,description:won?
   '人数不利から逆転したラウンド（最大'+margin+'人差）':
   '人数有利から敗れたラウンド（最大'+margin+'人差）',score};
 }
 return candidate?{round:candidate.round,description:candidate.description}:null;
}
type Metric={key:string;label:string;current?:{value:number}|null;baseline?:{value:number;matches:number}|null};
type Session={date:string|null;map:string;agent:string;lesson:{practice:{name:string};track:string};followUp?:{title:string};metrics:Metric[]};
type Daily={warmup:{title:string}|null;study:{map:string;theme:string}|null};
export function formatPersonalFeedback(input:{
 user:string;name:string;map:string;outcome:'win'|'loss'|'draw';swing:{round:number;description:string};
 session:Session;daily:Daily
}):string|null{
 const {user,name,map,outcome,swing,session,daily}=input;
 if(!/^\d{15,22}$/.test(user)||!daily.warmup?.title||!daily.study?.theme||
  !Number.isSafeInteger(swing.round)||swing.round<1||swing.round>61)return null;
 const metric=session.metrics.find(m=>m.key===session.lesson.track&&Number.isFinite(m.current?.value));
 const metricLine=metric?(text(metric.label,26)+'：今回 '+metric.current!.value.toFixed(2)+
   (metric.baseline&&metric.baseline.matches>=2&&Number.isFinite(metric.baseline.value)
    ?'／比較 '+metric.baseline.value.toFixed(2)+'（'+metric.baseline.matches+'試合）':'（比較資料は不足）')):
   '対象指標は未取得です。次の試合で確認しましょう。';
 return [
  '<@'+user+'> 🎯 **KESO COACH｜個別フィードバック**',
  '🕹️ '+text(name,32)+'さん｜'+text(map,24)+'｜'+({win:'勝利',loss:'敗北',draw:'引き分け'}[outcome]),
  '🔎 **今回の分かれ目**：第'+swing.round+'ラウンド・'+text(swing.description,75)+'。VODの該当ラウンドをご確認ください（再生時刻は未取得）。',
  '📊 **重点指標**：'+metricLine+' ※1試合の変化だけで改善・悪化を断定しません。',
  '🔥 **次のアップ**：'+text(daily.warmup.title,85),
  '📚 **本日の座学**：'+text(daily.study.map,24)+'・'+text(daily.study.theme,85),
  '次のコンペでは、まず1つだけ意識して試してください。'
 ].join('\n');
}
function dailyFromInventory(now:number,session:Session):Daily{
 const root=globalThis as typeof globalThis & {
  KesoCoachMuseTop?:{chooseToday:(input:{date:string;presets:Record<string,unknown>})=>{map:string|null;study:{theme:string;sourceStatus:string}|null}};
  KesoCoachMusePresets?:{PRESETS:Record<string,unknown>}};
 const pick=root.KesoCoachMuseTop?.chooseToday({date:localDay(now),presets:root.KesoCoachMusePresets?.PRESETS??{}});
 // The verified match-feedback curriculum supplies the personal next drill.
 // Study is sourced only from the Muse approved registry, never generated.
 return {warmup:session.lesson.practice?.name?{title:session.lesson.practice.name}:null,
  study:pick?.map&&pick.study?.theme&&pick.study.sourceStatus==='verified'?{map:pick.map,theme:pick.study.theme}:null};
}
/**
 * Called only after a new competitive match was durably saved by the monitor.
 * Receipt is acquired BEFORE network POST. Any ambiguous HTTP outcome is final
 * ('unknown') and is never automatically retried, so a Cron retry cannot duplicate.
 */
export async function postCoachPersonalFeedback(env:Env,mapping:KpMapping,
 matchId:string,puuid:string,endedAt:number,request:typeof fetch=fetch,now=Date.now()){
 if(!validId(matchId)||!validId(puuid)||!Number.isFinite(endedAt))return 'skipped';
 const url=webhook(env.KESO_COACH_WEBHOOK_URL);if(!url)return 'unconfigured';
 const member=await permission(env.DB,mapping.guildId,puuid);
 if(!member)return 'suppressed';
 const identity=await resolveCoachIdentity(env.DB,mapping,member.owner_user);
 if(identity.status!=='linked'||identity.subjectId!==member.subject_id||!identity.accounts.some(a=>a.puuid===puuid))
  return 'suppressed';
 const row=await env.DB.prepare(`SELECT r.ended_at,r.map,r.players_json,e.rounds_json,e.kills_json
  FROM valorant_match_rosters r JOIN valorant_match_round_events e ON e.match_id=r.match_id
  WHERE r.match_id=?`).bind(matchId).first<Archive>();
 if(!row||row.ended_at!==endedAt)return 'incomplete';
 const swing=largestObservedSwing(row,puuid);if(!swing)return 'incomplete';
 const report=await readCoachMemberReport(env.DB,identity.person,undefined,identity.accounts);
 const sessions=report.matchFeedback.sessions.filter(s=>Date.parse(s.date??'')===endedAt);
 if(sessions.length!==1)return 'incomplete';
 const session=sessions[0];
 if(session.map!==row.map||!['win','loss','draw'].includes(session.outcome))return 'incomplete';
 const daily=dailyFromInventory(now,session);
 const content=formatPersonalFeedback({user:member.owner_user,name:identity.displayName,map:session.map,
  outcome:session.outcome as 'win'|'loss'|'draw',swing,session,daily});
 if(!content||content.length>2000)return 'incomplete';
 // Verify the pre-existing webhook destination, without creating a new webhook.
 let info:{channel_id?:string;id?:string};
 try{const res=await request(url,{signal:AbortSignal.timeout(12000)});if(!res.ok)return 'unconfigured';info=await res.json() as typeof info;}
 catch{return 'unconfigured';}
 if(info.channel_id!==VDK_RESCUE_CHANNEL||info.id!==url.pathname.split('/')[3])return 'wrong-channel';
 // Preferences may have been toggled OFF while the report was being calculated.
 const current=await permission(env.DB,mapping.guildId,puuid);
 if(!current||current.subject_id!==member.subject_id||current.owner_user!==member.owner_user)return 'suppressed';
 const key=receiptKey(member.subject_id,matchId);
 const receipt:Receipt={state:'claimed',at:now};
 if(!await claimPersonalFeedbackReceipt(env.DB,key,now))return 'duplicate';
 url.searchParams.set('wait','true');
 try{
  const response=await request(url,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({content,allowed_mentions:{parse:[],users:[member.owner_user]},username:'KESO COACH'}),
   signal:AbortSignal.timeout(15000)});
  receipt.httpStatus=response.status;
  if(response.ok){
   const sent=await response.json() as {id?:string;channel_id?:string;content?:string};
   if(/^\d{15,22}$/.test(sent.id??'')&&sent.channel_id===VDK_RESCUE_CHANNEL&&sent.content===content){
    receipt.state='posted';receipt.channelId=sent.channel_id;receipt.messageId=sent.id;
   }else receipt.state='unknown';
  }else receipt.state=response.status>=400&&response.status<500?'rejected':'unknown';
 }catch{receipt.state='unknown';}
 await env.DB.prepare('UPDATE monitor_state SET value=? WHERE key=? AND value=?')
  .bind(JSON.stringify(receipt),key,JSON.stringify({state:'claimed',at:now})).run();
 return receipt.state;
}
