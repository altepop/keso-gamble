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
type Receipt={state:'claimed'|'posted'|'unknown'|'rejected';at:number;httpStatus?:number;channelId?:string;messageId?:string;content?:string};
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
type Session={date:string|null;map:string;agent:string;topic?:string;lesson:{practice:{name:string};track:string;nextGame?:string};followUp?:{title?:string;status?:string};metrics:Metric[]};
type Daily={warmup:{title:string}|null;study:{map:string;theme:string;origin?:'match'|'daily'}|null};
// Advice inventory (feedback-advice-patterns). Only patterns whose trigger is
// detectable from the saved session, the observed swing, the local hour or the
// same-day match count are embedded here. Selection never invents wording;
// unmatched cases fall back to the verified match-feedback curriculum below.
type AdvicePattern={advice:string;warmup:string|null;closing:string};
const ADVICE_PATTERNS={
 advantageLost:{advice:'人数有利のラウンドは、こちらから仕掛けなければほぼ勝てます。次戦は有利な場面で「先にピークしない」を1つだけ意識してください。',warmup:'デスマッチで、キルした直後に一度引いて位置を取り直す動きを繰り返す（10分）',closing:'次のコンペでは、有利な場面で「先にピークしない」ことだけを意識して試してください。'},
 cover:{advice:'味方と離れた場所で倒される場面がありました。次戦は、味方の近くで動く場面を1つだけ作ってみてください。',warmup:'デスマッチで他のプレイヤーの後ろについて動き、カバーに入るタイミングを見る（10分）',closing:'次のコンペでは、味方の近くで動く場面を1つ作ることだけを意識して試してください。'},
 deaths:{advice:'今日はデスが多めです。一度お水を飲んで、画面から少し離れてから次に行きましょう。立て直しも実力のうちです。',warmup:'デスマッチを「死なない」テーマで1本。無理なピークをせず、遮蔽物のある位置だけで撃ち合う（10分）',closing:'次のコンペの前に、お水を飲んで少し離れてから入りましょう。それが今回の1つです。'},
 conversion:{advice:'撃ち負けが目立ちます。まずはデスマッチをしてみましょう。勝敗ではなく、止まって撃てているかだけを見てください。',warmup:'デスマッチ1本。ストレイフ→停止→バーストの順序を崩さない（15分）',closing:'次のコンペでは、止まってから撃つ順序だけを意識して試してください。'},
 stalled:{advice:'今日は噛み合わない日でした。こういう日は無理に取り返そうとせず、一度休んで仕切り直すのが一番の近道です。',warmup:'今日はここまでにする選択も含め、次にやるときのアップを1つだけ決めておく',closing:'今日はここまでにして、仕切り直しましょう。それが今回の1つです。'},
 improving:{advice:'前回意識した点が、数字に出ています。その調子です。同じ意識でもう一試合どうぞ。',warmup:null,closing:'次のコンペも、同じ意識のまま行きましょう。それが今回の1つです。'},
 sleepy:{advice:'眠気が出ています。今日はここまでにして、明日に回しましょう。寝不足の1戦は、だいたい高くつきます。',warmup:null,closing:'今日はここまでにしましょう。それが今回の1つです。'},
 flow:{advice:'流れが来ています。もう一試合、普通に行きましょう。考えすぎないのが一番の好調キープです。',warmup:null,closing:'もう一試合、普通に行きましょう。それが今回の1つです。'},
 longSession:{advice:'長くやっています。一度立ち上がって伸びをして、水を飲んでください。それだけで次の試合が変わります。',warmup:'5分の休憩（立って伸びをして、水を飲む）',closing:'次に行く前に、5分の休憩を挟みましょう。それが今回の1つです。'},
 lateNight:{advice:'深夜帯です。あと1戦で区切るのがおすすめです。勝っても負けても、そこで終われる形にしましょう。',warmup:null,closing:'あと1戦で区切りましょう。それが今回の1つです。'},
 steady:{advice:'大きな崩れはありませんでした。もう一試合普通に行って、今日の感覚を確かめましょう。',warmup:'レンジで3分だけ、照準の高さを確認する',closing:'もう一試合普通に行って、今日の感覚を確かめましょう。それが今回の1つです。'}
} satisfies Record<string,AdvicePattern>;
function metricWorsened(session:Session,key:string,lowerIsBetter:boolean):boolean{
 const m=session.metrics.find(x=>x.key===key);
 if(!m||!Number.isFinite(m.current?.value)||!m.baseline||m.baseline.matches<2||!Number.isFinite(m.baseline.value))return false;
 // Same 0.1/R boundary and float guard as the curriculum's lesson selection.
 const delta=Number((m.current!.value-m.baseline.value).toFixed(9));
 return lowerIsBetter?delta>=0.1:delta<=-0.1;
}
export function selectAdvicePattern(input:{outcome:'win'|'loss'|'draw';swing:{description:string};
 session:Session;endedAt?:number;matchesToday?:number}):AdvicePattern|null{
 const {outcome,swing,session}=input;
 const hour=typeof input.endedAt==='number'&&Number.isFinite(input.endedAt)
  ?new Date(input.endedAt+9*3600_000).getUTCHours():null;
 const deepNight=hour!==null&&hour<5,lateNight=hour!==null&&(hour>=23||hour<5);
 // The turning point itself comes first, then this match's diagnosed weakness.
 if(swing.description.startsWith('人数有利から敗れた'))return ADVICE_PATTERNS.advantageLost;
 if(session.topic==='cover')return ADVICE_PATTERNS.cover;
 if(session.topic==='pressure'||metricWorsened(session,'dpr',true))return ADVICE_PATTERNS.deaths;
 if(session.topic==='conversion')return ADVICE_PATTERNS.conversion;
 if(metricWorsened(session,'kpr',false)&&metricWorsened(session,'dpr',true))return ADVICE_PATTERNS.stalled;
 if(session.followUp?.status==='improving')return ADVICE_PATTERNS.improving;
 if(deepNight&&outcome==='loss')return ADVICE_PATTERNS.sleepy;
 if(outcome==='win'&&(session.topic==='repeat'||swing.description.startsWith('人数不利から逆転した')))return ADVICE_PATTERNS.flow;
 if((input.matchesToday??0)>=4)return ADVICE_PATTERNS.longSession;
 if(lateNight)return ADVICE_PATTERNS.lateNight;
 if(session.topic==='timing')return ADVICE_PATTERNS.steady;
 return null;
}
function swingViewpoint(description:string):string|null{
 if(description.startsWith('人数有利から敗れた'))
  return '見るべきポイントは、有利ができてから最初に倒れた場面です。先に仕掛けたのは誰か、その時に味方が取り返せる位置にいたかをご確認ください。';
 if(description.startsWith('人数不利から逆転した'))
  return '見るべきポイントは、不利になってから最初に取り返したキルです。誰のカバーで生まれたかをご確認ください。再現できる形が見えてきます。';
 return null;
}
export function formatPersonalFeedback(input:{
 user:string;name:string;map:string;outcome:'win'|'loss'|'draw';swing:{round:number;description:string};
 session:Session;daily:Daily;endedAt?:number;matchesToday?:number
}):string|null{
 const {user,name,map,outcome,swing,session,daily}=input;
 if(!/^\d{15,22}$/.test(user))return null;
 if(!Number.isSafeInteger(swing.round)||swing.round<1||swing.round>61)return null;
 const study=daily.study;if(!study?.theme)return null;
 const pattern=selectAdvicePattern({outcome,swing,session,endedAt:input.endedAt,matchesToday:input.matchesToday});
 if(!pattern&&!daily.warmup?.title)return null;
 const metric=session.metrics.find(m=>m.key===session.lesson.track&&Number.isFinite(m.current?.value));
 const metricLine=metric?(text(metric.label,26)+'：今回 '+metric.current!.value.toFixed(2)+
   (metric.baseline&&metric.baseline.matches>=2&&Number.isFinite(metric.baseline.value)
    ?'／比較 '+metric.baseline.value.toFixed(2)+'（'+metric.baseline.matches+'試合）':'（比較資料は不足）')):
   '対象指標は未取得です。次の試合で確認しましょう。';
 const point=swingViewpoint(swing.description);
 const lines=[
  '<@'+user+'> 🎯 **KESO COACH｜個別フィードバック**',
  'これは、直近の試合へのコーチからの個別フィードバックです。今回の気づきと、次に試すことをお届けします。',
  '🕹️ '+text(name,32)+'さん｜'+text(map,24)+'｜'+({win:'勝利',loss:'敗北',draw:'引き分け'}[outcome]),
  '🔎 **今回の分かれ目**：第'+swing.round+'ラウンド・'+text(swing.description,75)+'。'+(point?point+' ':'')+'VODの該当ラウンドをご確認ください（再生時刻は未取得）。',
  '📊 **重点指標**：'+metricLine+' ※1試合の変化だけで改善・悪化を断定しません。'
 ];
 if(pattern)lines.push('💡 **コーチから**：'+text(pattern.advice,120));
 if(pattern?.warmup)lines.push('🔥 **次のアップ**：'+text(pattern.warmup,120));
 else if(!pattern)lines.push('🔥 **次のアップ**：'+text(daily.warmup!.title,85));
 lines.push(study.origin==='match'
  ?'📚 **今回のマップの座学**：'+text(study.map,24)+'・'+text(study.theme,85)
  :'📚 **本日の座学（日替わり）**：'+text(study.map,24)+'・'+text(study.theme,85));
 lines.push(pattern?pattern.closing
  :(session.lesson.nextGame?text(session.lesson.nextGame,160):'次のコンペでは、まず1つだけ意識して試してください。'));
 return lines.join('\n');
}
type MuseTop={chooseToday:(input:{date:string;presets:Record<string,unknown>})=>{map:string|null;study:{theme:string;sourceStatus:string}|null};
 canonical?:(map:string)=>string|null;
 validatePreset?:(map:string,entry:unknown)=>{study:{theme:string;sourceStatus:string}|null}|null};
export function studyForFeedback(matchMap:string,now:number):Daily['study']{
 const root=globalThis as typeof globalThis & {
  KesoCoachMuseTop?:MuseTop;
  KesoCoachMusePresets?:{PRESETS:Record<string,unknown>}};
 const presets=root.KesoCoachMusePresets?.PRESETS??{};
 const top=root.KesoCoachMuseTop;
 // Prefer the played map's own verified preset, so the study matches the match
 // the member just played. Only verified registry entries are ever used.
 const canonical=top?.canonical?.(matchMap);
 if(canonical&&top?.validatePreset){
  const own=top.validatePreset(canonical,presets[canonical]);
  if(own?.study?.theme&&own.study.sourceStatus==='verified')
   return {map:canonical,theme:own.study.theme,origin:'match'};
 }
 const pick=top?.chooseToday({date:localDay(now),presets});
 return pick?.map&&pick.study?.theme&&pick.study.sourceStatus==='verified'
  ?{map:pick.map,theme:pick.study.theme,origin:'daily'}:null;
}
function dailyFromInventory(now:number,session:Session):Daily{
 // The verified match-feedback curriculum supplies the personal next drill.
 // Study is sourced only from the Muse approved registry, never generated.
 return {warmup:session.lesson.practice?.name?{title:session.lesson.practice.name}:null,
  study:studyForFeedback(session.map,now)};
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
 // Same-day count from the saved sessions (this match included) and the match
 // end time only feed the advice-pattern selection; they never gate sending.
 const today=localDay(endedAt);
 const matchesToday=report.matchFeedback.sessions.filter(s=>{
  const at=Date.parse(s.date??'');return Number.isFinite(at)&&localDay(at)===today;}).length;
 const content=formatPersonalFeedback({user:member.owner_user,name:identity.displayName,map:session.map,
  outcome:session.outcome as 'win'|'loss'|'draw',swing,session,daily,endedAt,matchesToday});
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
    receipt.state='posted';receipt.channelId=sent.channel_id;receipt.messageId=sent.id;receipt.content=content;
   }else receipt.state='unknown';
  }else receipt.state=response.status>=400&&response.status<500?'rejected':'unknown';
 }catch{receipt.state='unknown';}
 await env.DB.prepare('UPDATE monitor_state SET value=? WHERE key=? AND value=?')
  .bind(JSON.stringify(receipt),key,JSON.stringify({state:'claimed',at:now})).run();
 return receipt.state;
}
