// Horse racing (demo). Pure logic with no DOM or clock reads, so the Worker can reuse it later.
// The finishing order and the odds come from the same race model: the odds are counted from
// many simulated runs, and the real run is one more draw of that model.
export const RACE_INTERVAL=15*60000, CLOSE_BEFORE=60000, RUN_MS=50000, COURSE_M=1600;
export const ODDS_TRIALS=50000, WEEKLY_LIMIT=50000, MIN_BET=100, BET_STEP=100;
export const PUBLIC_SALT='keso-play-demo-racing-v1';
export const BET_TYPES={win:{label:'1着当て',formal:'単勝'},place:{label:'3着以内当て',formal:'複勝'}};
export const STYLES=[{label:'最初から飛ばす',curve:.08},{label:'前の方につける',curve:.03},{label:'後半に追い上げる',curve:-.03},{label:'最後に一気',curve:-.08}];
export const CONDITIONS=[{label:'絶不調',value:-1},{label:'不調',value:-.5},{label:'普通',value:0},{label:'好調',value:.5},{label:'絶好調',value:1}];
export const GOINGS=[{label:'走りやすい',noise:1},{label:'ややぬかるみ',noise:1.15},{label:'ぬかるんでいる',noise:1.3}];
// Fictional names only. Real members' names need their consent (docs/RACING_PLAN.md).
export const HORSE_NAMES=['ゲートニキヅカナイ','エイムガブレール','キャリーマチ','ランクダケヒクイ','ヨフカシオー','エーティーエム','ニバンテボーイ','ムテキノイイワケ','アンレタイショウ','デスマッチノオウ','フルバイノユメ','エコラウンド','ハナサノマジュツシ','ニンキサギ','キマグレノアクマ','ネオチダービー','ワンタップドリーム','クラッチミス','スモークツカイ','ラストアワー','ゼロキルクイーン','ヤケクソラン','ゴールデンマンジュウ','コタツデネムル','ザンネンカイチョウ','シンヤサンジ','オヤツタイム','カブヲトカシタ','リセットボタン','バクチウチ','ゲンジツトウヒ','ハラペコジョッキー','ウワサノダークホース','オクレテキタヒーロー','イイワケハアトデ','ミチクサオー','タダノウマ','ジツハツヨイ','ガチャハズレ','マタマケタ'];
const JST=9*3600000;
const WEEKDAY_BIG={0:'日付またぎレース',480:'出勤前レース',750:'昼休みレース',1260:'メインレース'};
const WEEKEND_BIG={0:'日付またぎレース',600:'朝寝坊レース',720:'昼休みレース',840:'昼下がりレース',960:'おやつレース',1080:'夕方レース',1260:'メインレース'};

// cyrb128 + sfc32: small, fast and identical in browsers and Workers.
function hash(text){let h1=1779033703,h2=3144134277,h3=1013904242,h4=2773480762;for(let i=0;i<text.length;i++){const k=text.charCodeAt(i);h1=h2^Math.imul(h1^k,597399067);h2=h3^Math.imul(h2^k,2869860233);h3=h4^Math.imul(h3^k,951274213);h4=h1^Math.imul(h4^k,2716044179);}h1=Math.imul(h3^(h1>>>18),597399067);h2=Math.imul(h4^(h2>>>22),2869860233);h3=Math.imul(h1^(h3>>>17),951274213);h4=Math.imul(h2^(h4>>>19),2716044179);return [(h1^h2^h3^h4)>>>0,(h2^h1)>>>0,(h3^h1)>>>0,(h4^h1)>>>0];}
export function rngFrom(text){let [a,b,c,d]=hash(text);const next=()=>{a>>>=0;b>>>=0;c>>>=0;d>>>=0;let t=(a+b)|0;a=b^(b>>>9);b=(c+(c<<3))|0;c=(c<<21)|(c>>>11);d=(d+1)|0;t=(t+d)|0;c=(c+t)|0;return (t>>>0)/4294967296;};for(let i=0;i<12;i++)next();return next;}
function normal(rng){let u=0;while(u===0)u=rng();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rng());}
function pickWeighted(rng,weights){let r=rng()*weights.reduce((a,b)=>a+b,0);for(let i=0;i<weights.length;i++){r-=weights[i];if(r<0)return i;}return weights.length-1;}

function jstParts(time){const d=new Date(time+JST);return {day:d.getUTCDay(),minutes:d.getUTCHours()*60+d.getUTCMinutes()};}
export const isRaceStart=start=>Number.isSafeInteger(start)&&start>0&&start%RACE_INTERVAL===0;
export function bigRaceName(start){const {day,minutes}=jstParts(start);return ((day===0||day===6)?WEEKEND_BIG:WEEKDAY_BIG)[minutes]??null;}
export function raceNumber(start){return jstParts(start).minutes/15+1;}
/** The race currently taking bets: its betting closes CLOSE_BEFORE ahead of the start. */
export function openRaceStart(now){return (Math.floor((now+CLOSE_BEFORE)/RACE_INTERVAL)+1)*RACE_INTERVAL;}
export function latestRaceStart(now){return Math.floor(now/RACE_INTERVAL)*RACE_INTERVAL;}
/** Monday 0:00 JST, matching `/valo week`. */
export function weekStart(now){const d=new Date(now+JST);const days=(d.getUTCDay()+6)%7;return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-days)-JST;}
export const placeSlots=size=>size>=8?3:2;

export function raceCard(start,salt=PUBLIC_SALT){
 if(!isRaceStart(start))throw Error('レースが見つかりません');
 const rng=rngFrom(`${salt}:card:${start}`);
 const big=bigRaceName(start),size=big?10:8;
 const names=[...HORSE_NAMES];
 for(let i=names.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[names[i],names[j]]=[names[j],names[i]];}
 const horses=names.slice(0,size).map((name,i)=>({number:i+1,name,ability:normal(rng)*.55,style:Math.floor(rng()*STYLES.length),condition:pickWeighted(rng,[1,2,4,2,1])}));
 return {id:start,start,closeAt:start-CLOSE_BEFORE,number:raceNumber(start),name:big??`第${raceNumber(start)}レース`,big:!!big,size,going:pickWeighted(rng,[5,3,2]),horses};
}

// The race model. Both the real run and every odds trial call runRace, so they share one distribution.
function raceModel(card){
 const front=card.horses.filter(h=>h.style<=1).length;
 return {
  paceBase:(front-card.size/2)/2,
  noise:GOINGS[card.going].noise,
  base:card.horses.map(h=>h.ability+CONDITIONS[h.condition].value*.35+(card.size/2-h.number)*.02),
  paceFit:card.horses.map(h=>(h.style-1.5)*.2),
 };
}
function runRace(model,rng,perf,late){
 const pace=model.paceBase+normal(rng)*.6; // > 0: a fast pace that favours the closers
 for(let i=0;i<model.base.length;i++){
  late[i]=rng()<.03?1:0;
  perf[i]=model.base[i]+model.paceFit[i]*pace+normal(rng)*model.noise-late[i];
 }
}
function finishOrder(perf){return Array.from(perf.keys()).sort((a,b)=>perf[b]-perf[a]);}

export function raceResult(card,salt=PUBLIC_SALT){
 const perf=new Float64Array(card.size),late=new Uint8Array(card.size);
 runRace(raceModel(card),rngFrom(`${salt}:run:${card.id}`),perf,late);
 const runs=finishOrder(perf).map(i=>({number:i+1,perf:perf[i],late:late[i]===1}));
 return {order:runs.map(r=>r.number),runs};
}

/** Odds in tenths (25 = 2.5x): floor(1 / probability), never below 1.0x. No house cut. */
export const oddsFromCount=(count,trials)=>Math.max(10,Math.floor(10*trials/Math.max(count,1)));
const oddsCache=new Map();
export function raceOdds(card,salt=PUBLIC_SALT,trials=ODDS_TRIALS){
 const key=`${salt}:${card.id}:${trials}`;
 if(oddsCache.has(key))return oddsCache.get(key);
 const rng=rngFrom(`${salt}:odds:${card.id}`),slots=placeSlots(card.size);
 const win=new Array(card.size+1).fill(0),place=new Array(card.size+1).fill(0);
 const model=raceModel(card),perf=new Float64Array(card.size),late=new Uint8Array(card.size),used=new Uint8Array(card.size);
 for(let i=0;i<trials;i++){
  runRace(model,rng,perf,late);
  used.fill(0);
  for(let k=0;k<slots;k++){ // partial selection of the top `slots`
   let best=-1;
   for(let j=0;j<perf.length;j++)if(!used[j]&&(best<0||perf[j]>perf[best]))best=j;
   used[best]=1;
   if(k===0)win[best+1]++;
   place[best+1]++;
  }
 }
 const odds={trials,win:{},place:{},winCount:{},placeCount:{}};
 for(const h of card.horses){odds.win[h.number]=oddsFromCount(win[h.number],trials);odds.place[h.number]=oddsFromCount(place[h.number],trials);odds.winCount[h.number]=win[h.number];odds.placeCount[h.number]=place[h.number];}
 if(oddsCache.size>16)oddsCache.delete(oddsCache.keys().next().value);
 oddsCache.set(key,odds);
 return odds;
}

export function betWins(type,horse,result,size){
 if(type==='win')return result.order[0]===horse;
 if(type==='place')return result.order.slice(0,placeSlots(size)).includes(horse);
 return false;
}
export const payoutFor=(amount,odds10)=>Math.floor(amount*odds10/10);

/** Finish times and pace curves for playback. The finish order is the result's order. */
export function raceTimeline(card,result,salt=PUBLIC_SALT){
 const rng=rngFrom(`${salt}:show:${card.id}`);
 const best=result.runs[0].perf;
 let last=0;
 const raw=result.runs.map((r,i)=>{const t=Math.max(i?last+60:0,(best-r.perf)*900);last=t;return t;});
 const scale=raw.at(-1)>3000?3000/raw.at(-1):1; // the field stays on screen and inside RUN_MS
 const horses={};
 result.runs.forEach((r,i)=>{
  const h=card.horses[r.number-1];
  const curve=Math.max(-.9,Math.min(.9,STYLES[h.style].curve+(r.late?-.06:0)+(rng()-.5)*.02));
  horses[r.number]={finish:44000+raw[i]*scale,curve,late:r.late,rank:i+1};
 });
 return {horses,photo:result.runs.length>1&&(raw[1]-raw[0])*scale<120};
}
/** Distance in metres at `t` ms after the start. Keeps moving a little past the post. */
export function distanceAt(timeline,number,t){
 const h=timeline.horses[number];
 if(t<=0)return 0;
 if(t>=h.finish)return COURSE_M+18*(1-Math.exp(-(t-h.finish)/1500));
 const u=t/h.finish;
 return COURSE_M*(u+h.curve*u*(1-u)); // |curve| <= 1 keeps the motion forward-only
}
export function leaderAt(timeline,t){let best=null,dist=-1;for(const n of Object.keys(timeline.horses)){const d=distanceAt(timeline,n,t);if(d>dist){dist=d;best=Number(n);}}return best;}

const ROAST_LAST=['これは作戦ではありません。実力です','持ち主の生き様を体現しています','エイムと同じで走るラインも定まらない','前の馬に完全にキャリーされています'];
const ROAST_BOTTOM=['堂々の最下位。お疲れさまでした','最下位。この馬に賭けるのはやめましょう','最下位。言い訳の準備はできています'];
/** Text commentary (the Activity plays no audio). */
export function raceCommentary(card,result,timeline,odds,salt=PUBLIC_SALT){
 const rng=rngFrom(`${salt}:talk:${card.id}`),pick=list=>list[Math.floor(rng()*list.length)];
 const name=n=>`${n}番 ${card.horses[n-1].name}`;
 const lead=timeline.horses[result.order[0]].finish,lines=[{t:0,text:`${card.name}、スタート！`}];
 for(const r of result.runs)if(r.late)lines.push({t:1500,text:`${name(r.number)}、ゲートが開いたことに気付いていません！`});
 lines.push({t:lead*.3,text:`先頭は${name(leaderAt(timeline,lead*.3))}`});
 const tail=Object.keys(timeline.horses).map(Number).sort((a,b)=>distanceAt(timeline,a,lead*.5)-distanceAt(timeline,b,lead*.5))[0];
 lines.push({t:lead*.5,text:`最後方は${name(tail)}。${pick(ROAST_LAST)}`});
 lines.push({t:lead*.68,text:`最後の直線！先頭は${name(leaderAt(timeline,lead*.68))}`});
 const late=leaderAt(timeline,lead*.85);
 if(late!==leaderAt(timeline,lead*.68))lines.push({t:lead*.85,text:`${name(late)}が外から一気！`});
 if(timeline.photo)lines.push({t:lead-200,text:'ほぼ同時にゴール！ビデオ判定です…'});
 const favourite=card.horses.map(h=>h.number).sort((a,b)=>odds.win[a]-odds.win[b])[0];
 const winner=result.order[0];
 lines.push({t:lead+(timeline.photo?1500:0),text:winner===favourite?`勝ったのは1番人気 ${name(winner)}！順当です`:`勝ったのは${name(winner)}！`});
 if(winner!==favourite&&result.order.indexOf(favourite)>=placeSlots(card.size))lines.push({t:lead+2500,text:`1番人気の${name(favourite)}は${result.order.indexOf(favourite)+1}着。人気を裏切りました`});
 lines.push({t:timeline.horses[result.order.at(-1)].finish,text:`${name(result.order.at(-1))}、${pick(ROAST_BOTTOM)}`});
 return lines.sort((a,b)=>a.t-b.t);
}

// Demo wallet state. The server will own these in production.
export function createRacing(){return {raceBets:[],raceWeek:{start:0,spent:0}};}
const validInt=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
function validBet(b){return b&&typeof b.id==='string'&&b.id.length<=40&&isRaceStart(b.raceId)&&Object.hasOwn(BET_TYPES,b.type)&&validInt(b.horse,1)&&b.horse<=10&&validInt(b.amount,MIN_BET)&&b.amount%BET_STEP===0&&validInt(b.odds,10)&&validInt(b.time)&&(b.status==='pending'?b.payout===0:['won','lost'].includes(b.status)&&validInt(b.payout)&&(b.status==='lost'?b.payout===0:b.payout===payoutFor(b.amount,b.odds)));}
export function hydrateRacing(raw){
 const racing=createRacing();
 if(Array.isArray(raw?.raceBets))racing.raceBets=raw.raceBets.filter(validBet).slice(0,60).map(b=>({id:b.id,raceId:b.raceId,type:b.type,horse:b.horse,amount:b.amount,odds:b.odds,status:b.status,payout:b.payout,time:b.time}));
 if(validInt(raw?.raceWeek?.start)&&validInt(raw.raceWeek.spent))racing.raceWeek={start:raw.raceWeek.start,spent:raw.raceWeek.spent};
 return racing;
}
export function weeklySpent(state,now){return state.raceWeek.start===weekStart(now)?state.raceWeek.spent:0;}
export function placeRaceBet(state,{raceId,type,horse,amount},now,salt=PUBLIC_SALT){
 if(raceId!==openRaceStart(now))throw Error('このレースの馬券は締め切りました');
 if(!Object.hasOwn(BET_TYPES,type))throw Error('券の種類を選んでください');
 const card=raceCard(raceId,salt);
 if(!Number.isInteger(horse)||horse<1||horse>card.size)throw Error('馬を選んでください');
 if(!validInt(amount,MIN_BET)||amount%BET_STEP!==0)throw Error(`金額は${MIN_BET} KP以上、${BET_STEP} KP単位です`);
 if(amount>state.cash)throw Error('KPが不足しています');
 const spent=weeklySpent(state,now);
 if(spent+amount>WEEKLY_LIMIT)throw Error(`1週間に買える馬券は${WEEKLY_LIMIT.toLocaleString('ja-JP')} KPまでです（残り${(WEEKLY_LIMIT-spent).toLocaleString('ja-JP')} KP）`);
 const odds=raceOdds(card,salt)[type][horse];
 const bet={id:`${now}-${state.raceBets.length}`,raceId,type,horse,amount,odds,status:'pending',payout:0,time:now};
 state.cash-=amount;
 state.raceWeek={start:weekStart(now),spent:spent+amount};
 state.raceBets.unshift(bet);
 const pending=state.raceBets.filter(b=>b.status==='pending');
 state.raceBets=[...pending,...state.raceBets.filter(b=>b.status!=='pending').slice(0,Math.max(0,60-pending.length))].sort((a,b)=>b.time-a.time);
 return bet;
}
/** Pays out every pending bet whose race has finished. Odds were fixed when the bet was bought. */
export function settleRaceBets(state,now,salt=PUBLIC_SALT){
 const settled=[];
 for(const bet of state.raceBets){
  if(bet.status!=='pending'||now<bet.raceId+RUN_MS)continue;
  const card=raceCard(bet.raceId,salt),won=betWins(bet.type,bet.horse,raceResult(card,salt),card.size);
  const payout=won?payoutFor(bet.amount,bet.odds):0;
  if(!validInt(state.cash+payout))throw Error('KPが上限を超えています');
  state.cash+=payout;bet.status=won?'won':'lost';bet.payout=payout;settled.push(bet);
 }
 return settled;
}
/** No-contest rule: a race runs only when someone bet on it (big races always run). */
export function raceRuns(card,state){return card.big||state.raceBets.some(b=>b.raceId===card.id);}
