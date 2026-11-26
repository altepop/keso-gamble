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
type Session={date:string|null;map:string;agent:string;topic?:string;lesson:{practice:{name:string;minutes?:number;steps?:string[]};track:string;nextGame?:string;meaning?:string;why?:string;alternatives?:string;selfCheck?:string};followUp?:{title?:string;status?:string;text?:string};metrics:Metric[];previousTopic?:string|null;evidence?:string[];eventVerified?:boolean};
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
// Presentation only. The selected pattern and its prescribed warmup stay unchanged.
// Wording only: reference equality maps the existing selected prescription to
// detailed coaching. No trigger, severity, receipt or delivery behaviour changes.
// A swing describes team state; it does not prove who personally made a peek.
function detailedPatternAdvice(pattern:AdvicePattern,swing:{round:number;description:string}):string{
 if(pattern===ADVICE_PATTERNS.advantageLost)return [
  '第'+swing.round+'ラウンド、人数有利を落とした。せっかくの数的優位を勝ちに変えられていない。',
  '有利な側が先に撃ち合いを作る必要はない。味方の配置がそろわないうちの勝負は、相手に逆転の入口を渡す。',
  '次戦は有利を取ったら一度止まる。味方とクロスを組み、相手が動いたところを一緒に処理する。'
 ].join('\n');
 if(pattern===ADVICE_PATTERNS.cover)return [
  '今回の課題はカバーの距離だ。味方と離れていると、倒されてもトレードできず人数差がそのまま残る。',
  '次戦は単独で勝負を始めない。味方が見ている角を確認し、撃ち合いが起きた瞬間にカバーできる位置を取る。'
 ].join('\n');
 if(pattern===ADVICE_PATTERNS.deaths)return [
  '今回はデスが多い。無理に取り返そうと飛び出すほど、次のラウンドにも悪い判断を持ち込む。',
  '一度席を離れて水を飲む。次戦は遮蔽物のないピークを減らし、退ける位置から撃ち合う。'
 ].join('\n');
 if(pattern===ADVICE_PATTERNS.conversion)return [
  '今回は撃ち合いの決め切りが課題だ。移動したまま撃つと、狙えていても弾がばらける。',
  '次戦は敵を見たら停止を先に作る。ストレイフ→停止→バーストを崩さず、初弾の精度を優先する。'
 ].join('\n');
 if(pattern===ADVICE_PATTERNS.stalled)return [
  'キルが減ってデスが増えている。焦って取り返す動きは、さらに不利な勝負を増やす。',
  '次は一度区切る。再開後は勝負の数を増やすより、味方と撃ち合う位置を1つ決めて実行する。'
 ].join('\n');
 if(pattern===ADVICE_PATTERNS.improving)return [
  '前回の課題は数字に改善が見える。ただし1試合で直ったとは言い切れない。',
  '次戦も新しいことを増やさず、改善した動きを意識して同じ条件で再現する。'
 ].join('\n');
 if(pattern===ADVICE_PATTERNS.sleepy)return [
  '深夜の敗戦だ。疲れた状態で続けると、見るべき情報も判断も雑になる。',
  '今日はここで切り上げる。次戦は休んでから入り、最初の数ラウンドは味方との連携を優先する。'
 ].join('\n');
 if(pattern===ADVICE_PATTERNS.flow)return [
  '第'+swing.round+'ラウンド、人数不利から逆転した。取り返せた場面を偶然で終わらせるのはもったいない。',
  '次戦も味方と距離を合わせ、先に倒された味方のカバーへ入れる位置を維持する。'
 ].join('\n');
 if(pattern===ADVICE_PATTERNS.longSession)return [
  '連戦で判断が雑になる前に区切れ。疲れたまま続けることは練習にならない。',
  '次の試合の前に5分休憩。水を飲み、今回の修正点を1つだけ決めてから戻る。'
 ].join('\n');
 if(pattern===ADVICE_PATTERNS.lateNight)return [
  '深夜に試合を重ねると、集中が切れても無理に続けがちだ。',
  '次戦を区切りにする。勝敗に関係なく切り上げ、翌日にプレーを見直す。'
 ].join('\n');
 return [
  '大きな崩れはないが、何となく続けても改善にはつながらない。',
  '次の1試合は照準の高さと味方との距離を確認し、同じ良い動きを再現する。'
 ].join('\n');
}
function detailedWarmup(pattern:AdvicePattern|null,fallback:string):string{
 if(pattern===ADVICE_PATTERNS.advantageLost)return [
  'アップ（10分）',
  'デスマッチで、キルした直後の動きだけに集中する。',
  'キルしたら追撃せず、まず遮蔽物の後ろへ引く。周囲を確認して位置を組み直し、それから次の角を見る。',
  '「キル→引く→組み直す」を10分繰り返す。連続キルを狙わず、引く判断を練習する。'
 ].join('\n');
 if(pattern===ADVICE_PATTERNS.cover)return [
  'アップ（10分）',
  'デスマッチで他プレイヤーの少し後ろを動き、同じ角へ同時に飛び出さない。',
  '先行する味方役が撃ち合ったら、逃げ道を残して一歩遅れて同じ相手へ照準を向ける。',
  '単独でキルを追わず、カバーへ入る距離とタイミングを10分反復する。'
 ].join('\n');
 if(pattern===ADVICE_PATTERNS.deaths)return [
  'アップ（10分）',
  'デスマッチで、最初に遮蔽物のある位置を選ぶ。',
  '角を一つずつ確認し、危ない撃ち合いになったら無理せず引く。射線が重なる場所に居座らない。',
  'キル数よりも「退ける位置から撃てたか」を基準に10分繰り返す。'
 ].join('\n');
 if(pattern===ADVICE_PATTERNS.conversion)return [
  'アップ（15分）',
  'デスマッチで、敵を見つけたらストレイフを止めてから撃つ。',
  '停止を確認して短くバースト。外したら一度動き直し、止まって次のバーストを撃つ。',
  '移動撃ちでごまかさず「動く→止まる→撃つ」を15分徹底する。'
 ].join('\n');
 if(pattern===ADVICE_PATTERNS.stalled)return [
  'アップ（再開前の準備）',
  'いったん休み、前の試合で不利な勝負をした場面を一つだけ振り返る。',
  '次にプレーするときは直す動きを一つに絞り、開始前に声に出して確認する。'
 ].join('\n');
 if(pattern===ADVICE_PATTERNS.longSession)return [
  'アップ（5分休憩）',
  'まず席を離れて体を伸ばし、水を飲む。画面から目を離す。',
  '戻ったら次の試合で気をつける動きを一つだけ確認して入る。'
 ].join('\n');
 if(pattern===ADVICE_PATTERNS.steady)return [
  'アップ（3分）',
  'レンジで敵の頭の高さに照準を合わせ、止まった状態で一発ずつ撃つ。',
  '高さがずれたら狙い直す。速度よりも同じ高さを維持することを優先する。'
 ].join('\n');
 return fallback?[
  'アップ',
  text(fallback,90)+'。',
  '最初はゆっくり正しい動きを確認する。形が崩れたらいったん止め、同じ順序でやり直す。'
 ].join('\n'):'';
}
// Compact Discord coaching, not a copy of the analytical report.
type CompactPlan={why:string;action:string;drills:readonly [string,string];repeat:readonly [readonly [string,string],readonly [string,string]]};
const COMPACT_PLANS:Record<string,CompactPlan>={
 pressure:{why:'交戦を増やすより、次のラウンドに有利を残せる生存を優先しましょう。',action:'最初の3交戦は、退路を決めてから角を一つずつ見ましょう。',drills:['退ける遮蔽を2つ確認','角を一つずつ開いて停止射撃を5回'],repeat:[['死亡した1交戦を振り返り、必要なカバーか別射線かを確認','次戦で先に見る角と退路を決める'],['同じ入口で引き直す動きを5回','射撃場で短い射撃→移動を左右10回']]},
 reset:{why:'取った人数差を手放さないことが大切です。',action:'最初の3キル後、残弾と味方を確認し、続行か撤退かを選びましょう。',drills:['キル後に遮蔽へ戻る動きを5回','残弾確認→再照準を5回'],repeat:[['キル直後の1交戦を振り返る','続行・撤退の条件を一つずつ決める'],['遮蔽へ退く経路を2通り試す','短いバースト→横移動を左右10回']]},
 cover:{why:'距離だけでなく、同じ敵へ撃てる射線を作りましょう。',action:'攻撃の最初の3Rは、カバーする味方を一人決めましょう。',drills:['同じ角を見られる位置を2つ確認','デュオなら先頭とカバーを5回交代。一人なら合図を決める'],repeat:[['取り返しがなかった1交戦を振り返る','壁・距離・別担当のどれかを確認'],['重ならない射線を2つ探す','味方の合図で同じ角へ出る動きを5回']]},
 conversion:{why:'削った敵を自分で追う必要はありません。味方の回収も活かしましょう。',action:'次戦は短い射撃で再照準し、削った敵の位置を伝えましょう。',drills:['射撃場で移動→停止→2〜3発を左右10回','削った敵を味方が回収したか1交戦確認'],repeat:[['倒し切れなかった1交戦を振り返る','削った敵の位置を伝える合図を決める'],['近距離・中距離の短いバースト各10回','外したら横移動→停止→再照準を10回']]},
 participation:{why:'キルを追うより、担当を守りながら味方の交戦に間に合わせましょう。',action:'最初の3Rで、担当位置を維持するか合流するかを意識して選びましょう。',drills:['味方が接敵した1Rを振り返る','担当位置から合流する経路を2つ歩く'],repeat:[['担当を守る条件と合流する条件を決める','合流の合図を味方に一言伝える準備'],['合流経路で武器を出す地点を確認','途中で見る角を2つ選んで5回歩く']]},
 timing:{why:'個人のキル数だけではラウンドを取り切れません。味方と動くタイミングを揃えましょう。',action:'最初の3Rで、仕掛ける合図を一つ決めて役割を実行しましょう。',drills:['先頭・カバー・スキルの順番を決める','入口で味方を待てる遮蔽を2つ確認'],repeat:[['味方に伝える合図を一つ決める','前の1Rで合図を出せたか振り返る'],['同じ入口で即合流・待機を各5回','準備が遅れた味方を待つ位置を2つ確認']]},
 repeat:{why:'良かった準備を言葉にして、再現できる形にしましょう。',action:'次戦の最初の3交戦で、良かった照準か位置取りを一つ再現しましょう。',drills:['良かった1交戦の照準・遮蔽をメモ','同じ角への入り方を5回再現'],repeat:[['前の成功場面から再現できる要素を選ぶ','次戦の確認項目を一つ決める'],['近い角と遠い角で同じ準備を各5回','位置・距離が変わった場合の違いを確認']]},
 foundation:{why:'まだ弱点を絞れません。まず動きの再現性を確認しましょう。',action:'最初の3交戦は、移動→停止→射撃の順序を意識しましょう。',drills:['射撃場で静止射撃を10回','左右移動→停止→短い射撃を各10回'],repeat:[['静止と移動後の射撃を各10回比較','初弾が安定する距離で成功回数を数える'],['距離を変えて停止射撃を左右10回','2〜3発ごとに横移動と再照準を挟む']]}
};
const ROLE_DRILLS:Record<string,string>={
 'センチネル':'裏・別入口の担当と退避・合流の条件を確認',
 'コントローラー':'スモーク設置→武器に戻す手順を5回',
 'イニシエーター':'索敵・妨害→武器に戻して味方へ追従する手順を5回',
 'デュエリスト':'味方の合図→進入→カバーが届く位置までの動きを5回'
};
const AGENT_ROLES:Record<string,string>={Cypher:'センチネル',Clove:'コントローラー',Sova:'イニシエーター'};
function compactFact(session:Session,older:Session|undefined):string{
 const metric=(s:Session|undefined,key:string)=>s?.metrics.find(m=>m.key===key);
 const delta=(key:string)=>{
  const m=metric(session,key);
  return m?.baseline&&m.baseline.matches>=2&&Number.isFinite(m.baseline.value)&&Number.isFinite(m.current?.value)
   ?Number((m.current!.value-m.baseline.value).toFixed(9)):null;
 };
 const k=delta('kpr'),d=delta('dpr');
 const currentK=metric(session,'kpr')?.current?.value,previousK=metric(older,'kpr')?.current?.value;
 const change=(n:number,label:string)=>label+'約'+Math.abs(n*10).toFixed(1)+'回'+(n>0?'増':'減');
 if(session.topic==='pressure'&&d!==null&&d>=0.1){
  const previousUp=Number.isFinite(currentK)&&Number.isFinite(previousK)&&currentK!>previousK!+0.000001;
  return (previousUp?'前回よりキルのペースは上がりましたが、':'')+'直近平均より10Rあたり'+change(d,'デス')+(k!==null&&k<=-0.1?'、'+change(k,'キル'):'')+'。';
 }
 if((session.topic==='conversion'||session.topic==='participation')&&k!==null&&k<=-0.1)
  return '直近平均より10Rあたり'+change(k,'キル')+'。'+(session.topic==='conversion'?'与ダメージは維持しています。':'');
 if(session.eventVerified){
  const evidence=session.evidence?.find(x=>x.startsWith('全10人K/D照合済み'))??'';
  const m=session.topic==='reset'?evidence.match(/敵キル(\d+)回、その各キルの後5秒以内に本人死亡(\d+)回/):session.topic==='cover'?evidence.match(/既知の敵による死亡(\d+)回、味方の5秒以内の取り返し(\d+)回/):null;
  if(m)return session.topic==='reset'?'敵を倒した'+m[1]+'回のうち、5秒以内の死亡が'+m[2]+'回。':'敵に倒された'+m[1]+'回のうち、味方の5秒以内の取り返しが'+m[2]+'回。';
 }
 const facts=session as Session & {kills?:number|null;deaths?:number|null};
 if(Number.isFinite(facts.kills)&&Number.isFinite(facts.deaths))return '今回は'+facts.kills+'K・'+facts.deaths+'D。';
 if(session.topic==='repeat'&&k!==null&&k>=0.1&&d!==null&&d<=-0.1)return '直近平均より10Rあたり'+change(k,'キル')+'、'+change(d,'デス')+'。';
 return session.topic==='foundation'?'今回の記録を比較の出発点にします。':'今回の記録では'+({pressure:'死亡した交戦',reset:'キル直後',cover:'味方の取り返し',conversion:'倒し切り',participation:'交戦への参加',timing:'味方とのタイミング',repeat:'良かった準備'}[session.topic as 'pressure']??'次戦の行動')+'を確認します。';
}
function adaptivePrescription(session:Session,history:readonly Session[]=[]):{advice:string;warmup:string}|null{
 const l=session.lesson,p=l.practice,plan=COMPACT_PLANS[session.topic??''];
 if(!plan||!l.meaning||!l.nextGame||!Array.isArray(p.steps)||p.steps.length<3||
  !Number.isFinite(p.minutes)||p.minutes!<1||p.minutes!>20)return null;
 const at=Date.parse(session.date??'');
 const earlier=Number.isFinite(at)?history.filter(s=>{const t=Date.parse(s.date??'');return Number.isFinite(t)&&t<at;})
  .sort((a,b)=>Date.parse(b.date!)-Date.parse(a.date!)).slice(0,10):[];
 const unique=earlier.filter((s,i)=>earlier.findIndex(x=>Date.parse(x.date!)===Date.parse(s.date!))===i&&
  earlier.filter(x=>Date.parse(x.date!)===Date.parse(s.date!)).length===1);
 let streak=0;
 for(const older of unique){if(older.topic!==session.topic)break;streak++;}
 if(!earlier.length&&session.topic&&session.previousTopic===session.topic)streak=1;
 const role=l.meaning.match(/（(センチネル|コントローラー|イニシエーター|デュエリスト)）/)?.[1]??AGENT_ROLES[session.agent];
 const agent=session.agent&&session.agent!=='不明'?text(session.agent,24):'';
 const mapName=session.map&&session.map!=='不明'?text(session.map,24):'';
 const repeat=streak>0;
 const focus=session.topic==='pressure'&&role==='センチネル'?(agent?agent+'は':'センチネルは')+'生存しながら守備の価値を残すことを優先しましょう。':plan.why;
 const follow=repeat?'同じ課題が続いているので練習方法を変えます。':session.followUp?.status==='improving'?'前回の確認指標は改善方向です。':'';
 const advice=[compactFact(session,unique[0]),focus,follow,plan.action].filter(Boolean).join('\n');
 const drills=repeat?plan.repeat[(streak-1)%2]:plan.drills;
 const roleDrill=ROLE_DRILLS[role]??'次戦で確認する動きを一つ決める';
 const warmup=['アップ（5分）',...(mapName?['マップ：'+mapName]:[]),
  '2分：'+drills[0],'2分：'+drills[1],'1分：'+roleDrill].join('\n');
 return {advice,warmup};
}
function shortSwing(swing:{round:number;description:string},outcome:'win'|'loss'|'draw'):string{
 if(swing.description.startsWith('人数有利から敗れた'))
  return '第'+swing.round+'ラウンド、人数有利を落とした。'+(outcome==='win'?'あれが取れていたら、もっと楽に勝てた試合です。':'勝てるラウンドを落としたのは痛い。');
 if(swing.description.startsWith('人数不利から逆転した'))
  return '第'+swing.round+'ラウンド、人数不利から逆転した。あのカバーは次も再現しよう。';
 return '第'+swing.round+'ラウンド、'+text(swing.description,66)+'。';
}
export function formatPersonalFeedback(input:{
 user:string;name:string;map:string;outcome:'win'|'loss'|'draw';swing:{round:number;description:string};
 session:Session;daily:Daily;endedAt?:number;matchesToday?:number;previousSessions?:readonly Session[]
}):string|null{
 const {user,name,map,outcome,swing,session,daily}=input;
 if(!/^\d{15,22}$/.test(user))return null;
 if(!Number.isSafeInteger(swing.round)||swing.round<1||swing.round>61)return null;
 const study=daily.study;if(!study?.theme)return null;
 const pattern=selectAdvicePattern({outcome,swing,session,endedAt:input.endedAt,matchesToday:input.matchesToday});
 const adaptive=adaptivePrescription(session,input.previousSessions);
 if(!adaptive&&!pattern&&!daily.warmup?.title)return null;
 const metric=session.metrics.find(m=>m.key===session.lesson.track&&Number.isFinite(m.current?.value));
 // Missing metrics simply omit this paragraph. Never expose acquisition state.
 const metricLine=metric?(()=>{
  const current=metric.current!.value.toFixed(2);
  const base=metric.baseline&&metric.baseline.matches>=2&&Number.isFinite(metric.baseline.value)
   ?metric.baseline:null;
  const title=metric.key==='kpr'?'KPR':metric.key==='dpr'?'DPR':text(metric.label,24);
  const difference=base?Number((metric.current!.value-base.value).toFixed(9)):null;
  const evaluation=adaptive?'。':metric.key==='kpr'&&difference!==null&&difference<=-0.1?'。キルにつながる動きが減っている。'
   :metric.key==='dpr'&&difference!==null&&difference>=0.1?'。倒されすぎだ。無理なピークを減らせ。':'。';
  return '📊 '+title+' '+current+(base?'（直近'+base.matches+'試合は'+base.value.toFixed(2)+'）':'')+evaluation;
 })():null;
 const warmup=adaptive?adaptive.warmup:pattern?.warmup?detailedWarmup(pattern,'')
  :!pattern&&daily.warmup?.title?detailedWarmup(null,daily.warmup.title):null;
 const blocks=[
  '<@'+user+'> 🎯 **KESO COACH｜個別フィードバック**\n🕹️ '+text(name,32)+'さん｜'+text(map,24)+'｜'+({win:'勝利',loss:'敗北',draw:'引き分け'}[outcome]),
  '🔎 '+shortSwing(swing,outcome),
  metricLine,
  adaptive?'💡 コーチから\n'+adaptive.advice:pattern?'💡 コーチから\n'+detailedPatternAdvice(pattern,swing)
   :(session.lesson.nextGame?'💡 コーチから\n次の試合では、'+text(session.lesson.nextGame,90)+'。結果だけ見て終わらず、この動きを実際に変える。':null),
  warmup?'🔥 '+warmup:null,
  '📚 座学：'+text(study.map,24)+'・'+text(study.theme,85)
 ];
 return blocks.filter((b):b is string=>Boolean(b)).join('\n\n');
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
  outcome:session.outcome as 'win'|'loss'|'draw',swing,session,daily,endedAt,matchesToday,previousSessions:report.matchFeedback.sessions});
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
