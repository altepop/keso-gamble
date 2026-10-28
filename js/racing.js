// Horse racing. Pure logic with no DOM or clock reads, shared by the browser and the Worker.
// Cards and odds are public (PUBLIC_SALT). The run uses a per-race seed: the demo uses the public
// salt, while the Worker keeps a random seed secret until the start and publishes its hash first.
export const RACE_INTERVAL=15*60000, CLOSE_BEFORE=60000, RUN_MS=50000, COURSE_M=1600;
export const WEEKLY_LIMIT=50000, MIN_BET=100, BET_STEP=100;
export const PUBLIC_SALT='keso-play-demo-racing-v1';
export const BET_TYPES={win:{label:'1着当て',formal:'単勝'},place:{label:'3着以内当て',formal:'複勝'}};
export const STYLES=[{label:'最初から飛ばす',curve:.08},{label:'前の方につける',curve:.03},{label:'後半に追い上げる',curve:-.03},{label:'最後に一気',curve:-.08}];
export const CONDITIONS=[{label:'絶不調',value:-1},{label:'不調',value:-.5},{label:'普通',value:0},{label:'好調',value:.5},{label:'絶好調',value:1}];
export const GOINGS=[{label:'走りやすい',noise:1},{label:'ややぬかるみ',noise:1.15},{label:'ぬかるんでいる',noise:1.3}];
// Fictional names only. Real members' names need their consent (docs/RACING_PLAN.md).
export const HORSE_NAMES=['ゲートニキヅカナイ','エイムガブレール','キャリーマチ','ランクダケヒクイ','ヨフカシオー','エーティーエム','ニバンテボーイ','ムテキノイイワケ','アンレタイショウ','デスマッチノオウ','フルバイノユメ','エコラウンド','ハナサノマジュツシ','ニンキサギ','キマグレノアクマ','ネオチダービー','ワンタップドリーム','クラッチミス','スモークツカイ','ラストアワー','ゼロキルクイーン','ヤケクソラン','ゴールデンマンジュウ','コタツデネムル','ザンネンカイチョウ','シンヤサンジ','オヤツタイム','カブヲトカシタ','リセットボタン','バクチウチ','ゲンジツトウヒ','ハラペコジョッキー','ウワサノダークホース','オクレテキタヒーロー','イイワケハアトデ','ミチクサオー','タダノウマ','ジツハツヨイ','ガチャハズレ','マタマケタ'];
const JST=9*3600000;
const WEEKDAY_BIG={0:'日付またぎレース',480:'出勤前レース',750:'昼休みレース',1200:'ゴールデンタイム記念',1260:'メインレース',1320:'夜ふかし記念',1380:'最終レース'};
const WEEKEND_BIG={0:'日付またぎレース',600:'朝寝坊レース',720:'昼休みレース',840:'昼下がりレース',960:'おやつレース',1080:'夕方レース',1200:'ゴールデンタイム記念',1260:'メインレース',1320:'夜ふかし記念',1380:'最終レース'};

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
// Crown races with no person in the name, at :30: every night 19:30-0:30, and weekends from 10:30 (docs/RACING_PLAN.md §3).
// Races named after someone's bad day come from the Worker (src/racing-crowns.ts) and override the name.
export const FILLER_CROWNS=['ATMレース','マタマケタ記念レース','ガチャハズレ大会','言い訳選手権','KP溶かし予選','人気詐欺レース','永遠の二番手レース','気まぐれの悪魔レース','反面教師レース','夜ふかし予備軍レース','キャリー待ちレース','現実逃避レース','おやつ抜きレース','寝不足レース','ラストデス記念','寝落ち記念','深夜テンション記念','明日も仕事記念'];
export function fillerCrownName(start){const {day,minutes}=jstParts(start);return minutes%60===30&&(minutes>=1170||minutes<=30||((day===0||day===6)&&minutes>=630))?FILLER_CROWNS[(start/RACE_INTERVAL)%FILLER_CROWNS.length]:null;}
/** Slots a crown race may use: weekday nights 19:00-0:45, weekends from 10:00 (members work days). */
export function crownSlotAllowed(start){
 if(!isRaceStart(start)||bigRaceName(start)||fillerCrownName(start))return false;
 const {day,minutes}=jstParts(start);
 return minutes>=1140||minutes<60||((day===0||day===6)&&minutes>=600);
}

// Race classes and horse grades share one ladder. A horse runs in the class of its grade.
export const CLASSES=[{label:'ザコ戦',grade:'下級',mult:1,mean:-.6},{label:'中堅戦',grade:'中級',mult:3,mean:-.2},{label:'強豪戦',grade:'上級',mult:10,mean:.2},{label:'エリート戦',grade:'エリート級',mult:30,mean:.6},{label:'頂上決戦',grade:'頂上級',mult:100,mean:1}];
/** Class of a race slot. Big races are one class up. */
export function raceClass(start){const base=pickWeighted(rngFrom(`class:${start}`),[50,25,15,7,3]);return Math.min(CLASSES.length-1,base+(bigRaceName(start)?1:0));}
/** A card is public: wild horses come from the race time; owned horses (`entries`) come from the Worker. */
export function raceCard(start,salt=PUBLIC_SALT,entries=[]){
 if(!isRaceStart(start))throw Error('レースが見つかりません');
 const rng=rngFrom(`${salt}:card:${start}`);
 const big=bigRaceName(start),size=big?10:8,cls=raceClass(start);
 const names=[...HORSE_NAMES];
 for(let i=names.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[names[i],names[j]]=[names[j],names[i]];}
 const horses=names.slice(0,size).map((name,i)=>({number:i+1,name,ability:CLASSES[cls].mean+normal(rng)*.35,style:Math.floor(rng()*STYLES.length),condition:pickWeighted(rng,[1,2,4,2,1])}));
 if(entries.length){
  const gates=[...horses.keys()],grng=rngFrom(`${salt}:gates:${start}`);
  for(let i=gates.length-1;i>0;i--){const j=Math.floor(grng()*(i+1));[gates[i],gates[j]]=[gates[j],gates[i]];}
  entries.slice(0,size).forEach((e,i)=>Object.assign(horses[gates[i]],{name:e.name,ability:e.ability,style:e.style,horseId:e.horseId,owner:e.owner,ownerName:e.ownerName,nickname:e.nickname??null,person:!!e.person},Number.isInteger(e.condition)&&e.condition>=0&&e.condition<CONDITIONS.length?{condition:e.condition}:{}));
 }
 const crown=big?null:fillerCrownName(start);
 return {id:start,start,closeAt:start-CLOSE_BEFORE,number:raceNumber(start),name:big??crown??`第${raceNumber(start)}レース`,big:!!big,crown:!!crown,raceClass:cls,size,going:pickWeighted(rng,[5,3,2]),horses};
}

// The race model: a Plackett-Luce ranking (each place goes to a remaining horse with probability
// proportional to its strength), mixed over five pace scenarios. Exact probabilities are cheap to
// compute, so the odds have no sampling error and the Worker stays well inside its CPU limit.
const PACE_POINTS=[-2,-1,0,1,2],PACE_WEIGHTS=[1,4,6,4,1].map(w=>w/16); // mean 0, variance 1
const BETA=1.6;
function raceModel(card){
 const front=card.horses.filter(h=>h.style<=1).length,paceBase=(front-card.size/2)/2,sharp=BETA/GOINGS[card.going].noise;
 return PACE_POINTS.map((point,k)=>{
  const pace=paceBase+point*.6; // > 0: a fast pace that favours the closers
  return {weight:PACE_WEIGHTS[k],strength:card.horses.map(h=>Math.exp(sharp*(h.ability+CONDITIONS[h.condition].value*.35+(card.size/2-h.number)*.02+(h.style-1.5)*.2*pace)))};
 });
}
/** Exact probability that each horse wins, and finishes inside the paid places. */
export function finishProbabilities(card){
 const slots=placeSlots(card.size),win=new Array(card.size).fill(0),place=new Array(card.size).fill(0);
 for(const {weight,strength} of raceModel(card)){
  const used=new Uint8Array(card.size);
  const visit=(depth,prob,rest)=>{
   for(let j=0;j<card.size;j++){
    if(used[j])continue;
    const p=prob*strength[j]/rest;
    place[j]+=weight*p;if(depth===0)win[j]+=weight*p;
    if(depth+1<slots){used[j]=1;visit(depth+1,p,rest-strength[j]);used[j]=0;}
   }
  };
  visit(0,1,strength.reduce((a,b)=>a+b,0));
 }
 return {win,place};
}

/** The real run: one draw from the same model, using the race's seed. */
export function raceResult(card,seed=PUBLIC_SALT){
 const rng=rngFrom(`${seed}:run:${card.id}`),scenarios=raceModel(card);
 const {strength}=scenarios[pickWeighted(rng,scenarios.map(s=>s.weight))];
 const left=card.horses.map(h=>h.number),order=[];
 while(left.length){
  let r=rng()*left.reduce((sum,n)=>sum+strength[n-1],0),k=0;
  for(;k<left.length-1;k++){r-=strength[left[k]-1];if(r<0)break;}
  order.push(left.splice(k,1)[0]);
 }
 // Presentation only: a slow starter is picked among horses that finished in the back half.
 const late=new Set(order.slice(Math.ceil(order.length/2)).filter(()=>rng()<.06));
 return {order,runs:order.map(number=>({number,late:late.has(number)}))};
}

/** Odds in tenths (25 = 2.5x): floor(1 / probability), never below 1.0x. No house cut. */
export const oddsFromProbability=p=>p>0?Math.max(10,Math.floor(10/p+1e-9)):Number.MAX_SAFE_INTEGER;
const oddsCache=new Map();
export function raceOdds(card){
 const key=card.id+':'+card.horses.map(h=>h.horseId??'').join(',');
 if(oddsCache.has(key))return oddsCache.get(key);
 const {win,place}=finishProbabilities(card),odds={win:{},place:{},winProb:{},placeProb:{}};
 for(const h of card.horses){const i=h.number-1;odds.win[h.number]=oddsFromProbability(win[i]);odds.place[h.number]=oddsFromProbability(place[i]);odds.winProb[h.number]=win[i];odds.placeProb[h.number]=place[i];}
 if(oddsCache.size>32)oddsCache.delete(oddsCache.keys().next().value);
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
export function raceTimeline(card,result,seed=PUBLIC_SALT){
 const rng=rngFrom(`${seed}:show:${card.id}`);
 let last=0;
 const raw=result.order.map((_,i)=>i?(last+=60+(-Math.log(1-rng()))*330):0);
 const scale=raw.at(-1)>3000?3000/raw.at(-1):1; // the field stays on screen and inside RUN_MS
 const horses={};
 result.runs.forEach((r,i)=>{
  const h=card.horses[r.number-1];
  const curve=Math.max(-.9,Math.min(.9,STYLES[h.style].curve+(r.late?-.06:0)+(rng()-.5)*.02));
  horses[r.number]={finish:44000+raw[i]*scale,curve,late:r.late,rank:i+1};
 });
 return {horses,photo:result.order.length>1&&(raw[1]-raw[0])*scale<120};
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
export function raceCommentary(card,result,timeline,odds,seed=PUBLIC_SALT){
 const rng=rngFrom(`${seed}:talk:${card.id}`),pick=list=>list[Math.floor(rng()*list.length)];
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
export function placeRaceBet(state,{raceId,type,horse,amount},now,entries=[]){
 if(raceId!==openRaceStart(now))throw Error('このレースの馬券は締め切りました');
 if(!Object.hasOwn(BET_TYPES,type))throw Error('券の種類を選んでください');
 const card=raceCard(raceId,PUBLIC_SALT,entries);
 if(!Number.isInteger(horse)||horse<1||horse>card.size)throw Error('馬を選んでください');
 if(!validInt(amount,MIN_BET)||amount%BET_STEP!==0)throw Error(`金額は${MIN_BET} KP以上、${BET_STEP} KP単位です`);
 if(amount>state.cash)throw Error('KPが不足しています');
 const spent=weeklySpent(state,now);
 if(spent+amount>WEEKLY_LIMIT)throw Error(`1週間に買える馬券は${WEEKLY_LIMIT.toLocaleString('ja-JP')} KPまでです（残り${(WEEKLY_LIMIT-spent).toLocaleString('ja-JP')} KP）`);
 const odds=raceOdds(card)[type][horse];
 const bet={id:`${now}-${state.raceBets.length}`,raceId,type,horse,amount,odds,status:'pending',payout:0,time:now};
 state.cash-=amount;
 state.raceWeek={start:weekStart(now),spent:spent+amount};
 state.raceBets.unshift(bet);
 const pending=state.raceBets.filter(b=>b.status==='pending');
 state.raceBets=[...pending,...state.raceBets.filter(b=>b.status!=='pending').slice(0,Math.max(0,60-pending.length))].sort((a,b)=>b.time-a.time);
 return bet;
}
/** Pays out every pending bet whose race has finished. Odds were fixed when the bet was bought.
 * `seedOf(raceId)` returns the race seed, or null when it is not available yet. */
export function settleRaceBets(state,now,seedOf=()=>PUBLIC_SALT,entriesOf=()=>[]){
 const settled=[];
 for(const bet of state.raceBets){
  if(bet.status!=='pending'||now<bet.raceId+RUN_MS)continue;
  const seed=seedOf(bet.raceId);if(seed===null||seed===undefined)continue;
  const card=raceCard(bet.raceId,PUBLIC_SALT,entriesOf(bet.raceId)),won=betWins(bet.type,bet.horse,raceResult(card,seed),card.size);
  const payout=won?payoutFor(bet.amount,bet.odds):0;
  if(!validInt(state.cash+payout))throw Error('KPが上限を超えています');
  state.cash+=payout;bet.status=won?'won':'lost';bet.payout=payout;settled.push(bet);
 }
 return settled;
}
/** No-contest rule: a race runs only when someone bet on it (big and crown races always run). */
export function raceRuns(card,state){return card.big||card.crown||state.raceBets.some(b=>b.raceId===card.id);}

// Owners (docs/RACING_PLAN.md §6). The Worker owns horses and prizes; these rules are shared for display.
export const MAX_OWNED=3,RETIRE_RACES=20,DAILY_EXCHANGES=3,PRIZES=[1000,400,200];
export const BOXES=[
 {id:'normal',label:'ノーマル',price:3000,odds:[90,10,0,0,0]},
 {id:'silver',label:'シルバー',price:15000,odds:[15,75,10,0,0]},
 {id:'gold',label:'ゴールド',price:60000,odds:[0,15,75,10,0]},
 {id:'platinum',label:'プラチナ',price:250000,odds:[0,0,30,70,0]},
 {id:'legend',label:'レジェンド',price:1000000,odds:[0,0,0,70,30]},
];
/** A new horse from a box, drawn with the given random source (the Worker uses crypto). */
export function drawHorse(boxId,rng){
 const box=BOXES.find(b=>b.id===boxId);if(!box)throw Error('ボックスを選んでください');
 const grade=pickWeighted(rng,box.odds);
 return {grade,ability:Math.round((CLASSES[grade].mean+normal(rng)*.25)*1000)/1000,style:Math.floor(rng()*STYLES.length)};
}
/** Prize for a finishing place (0-based); grows with the race class. */
export const prizeFor=(card,rank)=>rank<PRIZES.length?PRIZES[rank]*CLASSES[card.raceClass].mult:0;
/** Buy-back price: 20% when new, falling to 10% at retirement. */
export const sellValue=(price,races)=>Math.floor(price*(20-10*Math.min(races,RETIRE_RACES)/RETIRE_RACES)/100);
export function validHorseName(name){
 const value=String(name??'').normalize('NFKC').trim();
 if(value.length<1||value.length>12||/[\u0000-\u001f@#`*_~<>|\\/:]/.test(value)||/https?|www\./i.test(value))throw Error('馬の名前は1〜12文字で、記号やURLは使えません');
 return value;
}
/** One JST day's exchanges (directives, boxes, luxury items). */
export function exchangeDay(now){return new Date(now+JST).toISOString().slice(0,10);}
export function useExchange(state,now){
 const day=exchangeDay(now),count=state.exchange?.day===day?state.exchange.count:0;
 if(count>=DAILY_EXCHANGES)throw Error(`指令・ボックスなどの交換は1日${DAILY_EXCHANGES}回までです（朝0時に戻ります）`);
 state.exchange={day,count:count+1};
}
/** A nickname from a horse's record. `runs` are newest first: {rank, winOdds (tenths), favourite}. */
export function horseNickname({wins=0,seconds=0},runs=[]){
 if(runs.some(r=>r.rank===1&&r.winOdds>=200))return '気まぐれの悪魔';
 if(runs.filter(r=>r.favourite&&r.rank>=4).length>=2)return '人気詐欺';
 if(wins===0&&seconds>=3)return '永遠の二番手';
 if(runs.length>=5&&runs.slice(0,5).every(r=>r.rank>=4))return '歩く戦犯';
 return null;
}
/** An owner's horse condition from their recent play (any game counts the same; docs/RACING_PLAN.md §7).
 * `recent` is activity in the last 24 hours, `anyIn72h` whether they played at all in 3 days. */
export function conditionFromActivity(recent,anyIn72h){
 if(recent>=6)return 4;if(recent>=3)return 3;if(recent>=1)return 2;
 return anyIn72h?1:0;
}
