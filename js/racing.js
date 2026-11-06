import {EXTRA_HORSE_NAMES,EXTRA_CROWN_NAMES,REGULAR_RACE_NAMES} from './racing-name-catalog.js?v=web-a55c6681d5193a0e';
// Horse racing. Pure logic with no DOM or clock reads, shared by the browser and the Worker.
// Cards and odds are public (PUBLIC_SALT). The run uses a per-race seed: the demo uses the public
// salt, while the Worker keeps a random seed secret until the start and publishes its hash first.
export const RACE_INTERVAL=15*60000, CLOSE_BEFORE=60000, RUN_MS=50000, COURSE_M=1600;
export const WEEKLY_LIMIT=400000, MIN_BET=100, BET_STEP=100, MAX_RACE_BET=100000;
export const PUBLIC_SALT='keso-play-demo-racing-v1';
export const BET_TYPES={win:{label:'1着当て',formal:'単勝'},place:{label:'3着以内当て',formal:'複勝'},trifecta:{label:'1〜3着を順番通り',formal:'3連単'}};
export const STYLES=[{label:'最初から飛ばす',curve:.08},{label:'前の方につける',curve:.03},{label:'後半に追い上げる',curve:-.03},{label:'最後に一気',curve:-.08}];
export const CONDITIONS=[{label:'絶不調',value:-1},{label:'不調',value:-.5},{label:'普通',value:0},{label:'好調',value:.5},{label:'絶好調',value:1}];
export const GOINGS=[{label:'走りやすい',noise:1},{label:'ややぬかるみ',noise:1.15},{label:'ぬかるんでいる',noise:1.3}];

/** New information-rich market, future races only. Old tickets and archived results are immutable. */
export const FORM_REFORM_FROM=Date.parse('2026-11-04T00:00:00+09:00');
export const TRACK_BIAS_LABELS=['内枠有利','枠の偏りなし','外枠有利'];
// Suitability follows the horse's identity, so a returning named or owned horse keeps its preference.
export function groundAffinity(h){
 const id=String(h.horseId??h.name);
 const roll=rngFrom('ground-affinity:'+id)();
 return roll<.35?0:roll<.65?1:2; // 0 firm, 1 flexible, 2 mud
}
export const AFFINITY_LABELS=['良馬場巧者','オールラウンダー','道悪巧者'];
export function runningNotes(card,h){
 const approx=h.ability-CLASSES[card.raceClass].mean;
 const training=approx>=.46?'A':approx>=.17?'B':approx>=-.16?'C':approx>=-.42?'D':'E';
 const apt=groundAffinity(h);
 const trackFit=card.going===1?(apt===1?'◎':'○'):apt===card.going?'◎':apt===1?'○':'△';
 return {training,apt,aptitude:AFFINITY_LABELS[apt],trackFit,form:h.record??null,recentRanks:h.recentRanks??[]};
}
export function raceBrief(card){
 const front=card.horses.filter(h=>h.style<=1).length;
 const pace=front>=Math.ceil(card.size*.6)?'ハイペース（差し馬注目）':front<=Math.floor(card.size*.35)?'スローペース（先行馬注目）':'平均ペース（展開次第）';
 return {pace,front,bias:TRACK_BIAS_LABELS[card.trackBias??1],hint:'オッズは市場の概算評価。ペース・当日の枠傾向・馬場適性・特別ルールの影響を十分に反映しない。'};
}
function fieldContextBonus(card,h){
 if(card.start<FORM_REFORM_FROM)return 0;
 const apt=groundAffinity(h);
 const ground=card.going===1?(apt===1?.09:0):apt===card.going?.26:apt===1?.07:-.20;
 const mid=(h.number-.5)/card.size-.5;
 const gate=card.trackBias===0?-mid*.50:card.trackBias===2?mid*.50:0;
 return ground+gate;
}

// Fictional names only. Real members' names need their consent (docs/RACING_PLAN.md).
const LEGACY_HORSE_NAMES=['ゲートニキヅカナイ','エイムガブレール','キャリーマチ','ランクダケヒクイ','ヨフカシオー','エーティーエム','ニバンテボーイ','ムテキノイイワケ','アンレタイショウ','デスマッチノオウ','フルバイノユメ','エコラウンド','ハナサノマジュツシ','ニンキサギ','キマグレノアクマ','ネオチダービー','ワンタップドリーム','クラッチミス','スモークツカイ','ラストアワー','ゼロキルクイーン','ヤケクソラン','ゴールデンマンジュウ','コタツデネムル','ザンネンカイチョウ','シンヤサンジ','オヤツタイム','カブヲトカシタ','リセットボタン','バクチウチ','ゲンジツトウヒ','ハラペコジョッキー','ウワサノダークホース','オクレテキタヒーロー','イイワケハアトデ','ミチクサオー','タダノウマ','ジツハツヨイ','ガチャハズレ','マタマケタ','デスアンレ','ヒトシイマツモト','ダイスキミヤガワ','エスカレーター','カチカク','トケルバター','オモシロインデス','ニシフハカイガイ','デスレ','カガワケンミン','ケーピートカシ','ドワー','ヤリラフィー'];
// Introducing names changes the number of shuffled items and therefore the
// random draws used for horse abilities, odds and archived race replays.
// Keep old race cards byte-for-byte identical; activate only for future starts.
export const NAME_EXPANSION_FROM=Date.parse('2026-11-03T00:00:00+09:00');
export const HORSE_NAMES=[...LEGACY_HORSE_NAMES,...EXTRA_HORSE_NAMES];
const JST=9*3600000;
// Big races carry the group's memes (MEME_SOURCES.md): 松本等しい, 堀大輔, もこう's stream phrases, KESO TOWN.
const WEEKDAY_BIG={0:'日付またぎレース 堀大輔マイクロスリープ杯',480:'出勤前レース 寝ないチャレンジではない賞',750:'昼休みレース 最後の餃子ステークス',1200:'ゴールデンタイム 良かったこの距離で記念',1260:'KESO TOWN メインレース 松本等しい杯',1320:'夜ふかし バチコーンストライク記念',1380:'最終レース 次のVTR行ってみましょか賞'};
const {480:_commute,...NIGHTS}=WEEKDAY_BIG,WEEKEND_BIG={...NIGHTS,600:'朝寝坊レース あの、ナメてます？杯',840:'昼下がりレース 5億マジかwカップ',960:'おやつレース 味濃い薄いあったら言って賞',1080:'夕方レース 生まれもエリート記念'};

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
// Only FUTURE slots change race physics. Historical cards/odds/settlements must stay identical.
export const CHAOS_RACES_FROM=Date.parse('2026-11-04T00:00:00+09:00');
export const CHAOS_RACE_TYPES=[
 {id:'front',name:'逃げ馬天国',effect:'先行・逃げ脚質が有利',desc:'序盤から飛ばす馬に追い風。好スタートがいつも以上に重要。'},
 {id:'close',name:'末脚解放',effect:'差し・追い込み脚質が有利',desc:'最後方からの逆転が狙いやすい。先行馬は油断禁物。'},
 {id:'upset',name:'下剋上',effect:'能力の低い馬にハンデ補正',desc:'格上馬の独走を許さない。普段の人気馬ほど安全ではない。'},
 {id:'condition',name:'体調最優先',effect:'好調馬がさらに有利・不調馬は苦戦',desc:'コンディションの差が普段より大きく着順へ響く。'},
];
export function raceEvent(start){
 if(!isRaceStart(start)||start<CHAOS_RACES_FROM)return null;
 const {day,minutes}=jstParts(start);
 const eligible=minutes===1095||minutes===1275||minutes===1395||((day===0||day===6)&&(minutes===735||minutes===975));
 if(!eligible)return null;
 return CHAOS_RACE_TYPES[Math.floor(rngFrom('chaos-race:'+start)()*CHAOS_RACE_TYPES.length)];
}
function chaosStrengthBonus(h,avg,event){
 if(!event)return 0;
 switch(event.id){
  case 'front':return h.style<=1?.4:-.10;
  case 'close':return h.style>=2?.4:-.10;
  case 'upset':return Math.max(-.45,Math.min(.45,(avg-h.ability)*.72));
  case 'condition':return (h.condition-2)*.2;
  default:return 0;
 }
}

// Crown races with no person in the name, at :30: every night 19:30-0:30, and weekends from 10:30 (docs/RACING_PLAN.md §3).
// Races named after someone's bad day come from the Worker (src/racing-crowns.ts) and override the name.
const LEGACY_FILLER_CROWNS=['うおw記念','クイヤ記念','お祭り男か記念','しばくぞ記念','あかんかったなぁ記念','了解お兄さん記念','効いてて草記念','一旦な記念','3がある記念','毒かも記念','いいわぁ記念','純の勝ち記念','判定してるやつがおかしい記念','フルタじゃねえわ記念','KESO TOWN町内会杯','ラストデス記念','エコラウンド記念','フルバイの夢記念','ATMレース','KP溶かし予選','ガチャハズレ大会','寝落ち記念'];
export const FILLER_CROWNS=[...LEGACY_FILLER_CROWNS,...EXTRA_CROWN_NAMES];
export function fillerCrownName(start){const {day,minutes}=jstParts(start);if(!(minutes%60===30&&(minutes>=1170||minutes<=30||((day===0||day===6)&&minutes>=630))))return null;
 if(start<NAME_EXPANSION_FROM)return LEGACY_FILLER_CROWNS[(start/RACE_INTERVAL)%LEGACY_FILLER_CROWNS.length];
 return FILLER_CROWNS[Math.floor(rngFrom(`filler:${start}`)()*FILLER_CROWNS.length)];
}
/** Ordinary races gain a distinct fictional name without claiming an extra crown slot. */
export function regularRaceName(start){return REGULAR_RACE_NAMES[Math.floor(rngFrom(`ordinary:${start}`)()*REGULAR_RACE_NAMES.length)];}
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
 const names=start<NAME_EXPANSION_FROM?[...LEGACY_HORSE_NAMES]:[...HORSE_NAMES];
 for(let i=names.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[names[i],names[j]]=[names[j],names[i]];}
 const horses=names.slice(0,size).map((name,i)=>({number:i+1,name,ability:CLASSES[cls].mean+normal(rng)*.35,style:Math.floor(rng()*STYLES.length),condition:pickWeighted(rng,[1,2,4,2,1])}));
 if(entries.length){
  const gates=[...horses.keys()],grng=rngFrom(`${salt}:gates:${start}`);
  for(let i=gates.length-1;i>0;i--){const j=Math.floor(grng()*(i+1));[gates[i],gates[j]]=[gates[j],gates[i]];}
  entries.slice(0,size).forEach((e,i)=>Object.assign(horses[gates[i]],{name:e.name,ability:e.ability,style:e.style,horseId:e.horseId,owner:e.owner,ownerName:e.ownerName,nickname:e.nickname??null,person:!!e.person,...(start>=FORM_REFORM_FROM&&e.record?{record:e.record,recentRanks:e.recentRanks??[]}:{})},Number.isInteger(e.condition)&&e.condition>=0&&e.condition<CONDITIONS.length?{condition:e.condition}:{}));
 }
 const crown=big?null:fillerCrownName(start),event=raceEvent(start);
 return {id:start,start,closeAt:start-CLOSE_BEFORE,number:raceNumber(start),name:event?`第${raceNumber(start)}レース ${event.name}杯`:big??crown??(start<NAME_EXPANSION_FROM?`第${raceNumber(start)}レース`:`第${raceNumber(start)}レース ${regularRaceName(start)}`),big:!!big,crown:!!crown,raceClass:cls,size,going:pickWeighted(rng,[5,3,2]),horses,...(event?{event}:{}),...(start>=FORM_REFORM_FROM?{trackBias:Math.floor(rngFrom('track-bias:'+start)()*3)}:{})};
}

// The race model: a Plackett-Luce ranking (each place goes to a remaining horse with probability
// proportional to its strength), mixed over five pace scenarios. Exact probabilities are cheap to
// compute, so the odds have no sampling error and the Worker stays well inside its CPU limit.
const PACE_POINTS=[-2,-1,0,1,2],PACE_WEIGHTS=[1,4,6,4,1].map(w=>w/16); // mean 0, variance 1
const BETA=1.6;
function raceModel(card,market=false){
 const front=card.horses.filter(h=>h.style<=1).length,paceBase=(front-card.size/2)/2,sharp=BETA/GOINGS[card.going].noise;
 const avgAbility=card.event?card.horses.reduce((sum,h)=>sum+h.ability,0)/card.size:0;
 return PACE_POINTS.map((point,k)=>{
  const pace=market?0:paceBase+point*.6; // bookmaker predicts neutral pace, actual racing draws a pace scenario
  return {weight:PACE_WEIGHTS[k],strength:card.horses.map(h=>Math.exp(sharp*(h.ability*(market?.87:1)+CONDITIONS[h.condition].value*(market?.24:.35)+(card.size/2-h.number)*.02+(h.style-1.5)*.2*pace+(market?0:chaosStrengthBonus(h,avgAbility,card.event)+fieldContextBonus(card,h))))) };
 });
}
/** Exact probability that each horse wins, and finishes inside the paid places. */
function calculateProbabilities(card,market=false){
 const slots=placeSlots(card.size),win=new Array(card.size).fill(0),place=new Array(card.size).fill(0);
 for(const {weight,strength} of raceModel(card,market)){
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
export function finishProbabilities(card){return calculateProbabilities(card,false);}
/** Estimated by the market without complete live form; NOT the true winning probability. */
export function marketProbabilities(card){return card.start>=FORM_REFORM_FROM?calculateProbabilities(card,true):finishProbabilities(card);}

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
 const {win,place}=marketProbabilities(card),odds={win:{},place:{},winProb:{},placeProb:{}};
 const margin=card.start>=FORM_REFORM_FROM?1.05:1;
 for(const h of card.horses){const i=h.number-1;odds.win[h.number]=oddsFromProbability(win[i]*margin);odds.place[h.number]=oddsFromProbability(place[i]*margin);odds.winProb[h.number]=win[i];odds.placeProb[h.number]=place[i];}
 if(oddsCache.size>32)oddsCache.delete(oddsCache.keys().next().value);
 oddsCache.set(key,odds);
 return odds;
}

export function trifectaOdds(card,selection){
 if(!Array.isArray(selection)||selection.length!==3||new Set(selection).size!==3||selection.some(n=>!Number.isSafeInteger(n)||n<1||n>card.size))return null;
 const [a,b,d]=selection.map(n=>n-1);
 let chance=0;
 for(const {weight,strength} of raceModel(card,card.start>=FORM_REFORM_FROM)){
  const total=strength.reduce((sum,n)=>sum+n,0);
  chance+=weight*(strength[a]/total)*(strength[b]/(total-strength[a]))*(strength[d]/(total-strength[a]-strength[b]));
 }
 // Future-market adjustment mirrors single-horse odds and never leaks private seed.
 return Math.min(100000,oddsFromProbability(chance*(card.start>=FORM_REFORM_FROM?1.05:1)));
}
export function betWins(type,horse,result,size){
 if(type==='trifecta')return Array.isArray(horse)&&horse.length===3&&horse.every((n,i)=>result.order[i]===n);
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

/** Public live positions only. Never use the eventual finishing order to choose
 * who is last before the race is over. Tie-break by horse number, not result rank. */
export function lastPlaceAt(timeline,t){
 const numbers=Object.keys(timeline.horses).map(Number);
 if(!numbers.length)return null;
 const ranked=numbers.sort((a,b)=>distanceAt(timeline,b,t)-distanceAt(timeline,a,t)||a-b);
 const number=ranked.at(-1),ahead=ranked.at(-2);
 return {number,ahead: ahead??null,gap:ahead===undefined?0:Math.max(0,Math.round(distanceAt(timeline,ahead,t)-distanceAt(timeline,number,t)))};
}
const LAST_FINISH_ROAST=[
 'まさかの最下位！ 今日いちばん長く競馬を楽しんだ馬です！',
 '最下位でフィニッシュ！ 実況席の視線を最後まで独占しました！',
 '最後の最後まで主役は譲らない！ ……最下位でゴール！',
 '最下位！ ほかの馬が帰り支度を始めても走り切りました！',
 '堂々の最下位！ ここから逆転するには、もう1レース必要です！'
];
/** Commentary follows the live backmarker from launch to finish.
 * Rank, odds, bets and physical trajectory are not changed by the narration. */
export function raceCommentary(card,result,timeline,odds,seed=PUBLIC_SALT){
 const rng=rngFrom(`${seed}:talk:${card.id}`),pick=list=>list[Math.floor(rng()*list.length)];
 const name=n=>`${n}番 ${card.horses[n-1].name}`;
 const lead=timeline.horses[result.order[0]].finish;
 const lines=[{t:0,text:`${card.name}、スタート！ 先頭争いよりも、最後方の動きから目が離せません！`}];
 for(const r of result.runs)if(r.late)lines.push({t:1500,text:`${name(r.number)}、ゲートが開いたことに気付いていません！`});
 let prev=null;
 for(const [fraction,stage] of [
  [.14,'start'],[.29,'chase'],[.44,'half'],[.60,'turn'],[.75,'stretch'],[.88,'final'],[.94,'wire']
 ]){
  const t=Math.round(lead*fraction),spot=lastPlaceAt(timeline,t);
  if(!spot)continue;
  const who=name(spot.number),gap=spot.gap;
  const status=prev!==null&&prev!==spot.number
   ?`最後方が入れ替わった！ 今度は${who}！`
   :`最後方は${who}！`;
  const distance=gap>0?`前の馬まで約${gap}m。`:'前の馬とほぼ並んでいます。';
  let reaction='';
  if(stage==='start')reaction=pick(['序盤からこの位置、これは何の作戦だ！','まだ始まったばかりだ、ここからが見せ場！']);
  else if(stage==='chase')reaction=gap>=30?'集団が遠い！ 頼む、まだ置いていかれるな！':'前の馬に食らいついています！';
  else if(stage==='half')reaction=pick(['実況席は先頭を見ていません！ こちらが今日の主役！','折り返しても最後方！ ここから脚を使えるのか！']);
  else if(stage==='turn')reaction=gap>=40?'差が開く！ このままでは単独の旅になってしまう！':'まだ届く距離！ 最下位脱出なるか！';
  else if(stage==='stretch')reaction=pick(['最終直線！ 観客の視線が最後方へ！','さあ最後の直線！ 誰がビリになるのか！']);
  else if(stage==='final')reaction=gap>=35?'前が見えなくなってきた！ それでも脚を止めない！':'少しでも順位を上げたい！ ラストスパート！';
  else reaction='ゴールは目前！ 最下位だけは避けたいところ！';
  lines.push({t,text:`${status} ${distance}${reaction}`});
  prev=spot.number;
 }
 const favourite=card.horses.map(h=>h.number).sort((a,b)=>odds.win[a]-odds.win[b])[0];
 const winner=result.order[0];
 if(timeline.photo)lines.push({t:lead-200,text:'先頭はほぼ同時にゴール！ ビデオ判定です…'});
 lines.push({t:lead+(timeline.photo?1500:0),text:winner===favourite?`勝ったのは1番人気 ${name(winner)}！順当です`:`勝ったのは${name(winner)}！`});
 if(winner!==favourite&&result.order.indexOf(favourite)>=placeSlots(card.size))
  lines.push({t:lead+2500,text:`1番人気の${name(favourite)}は${result.order.indexOf(favourite)+1}着。人気を裏切りました`});
 const last=result.order.at(-1);
 lines.push({t:Math.max(timeline.horses[last].finish,lead+2600),text:`${name(last)}、${pick(LAST_FINISH_ROAST)}`});
 return lines.sort((a,b)=>a.t-b.t);
}

// Demo wallet state. The server will own these in production.
export function createRacing(){return {raceBets:[],raceWeek:{start:0,spent:0}};}
function keepPending(bets){const pending=bets.filter(b=>b.status==='pending');return [...pending,...bets.filter(b=>b.status!=='pending').sort((a,b)=>b.time-a.time).slice(0,Math.max(0,60-pending.length))].sort((a,b)=>b.time-a.time);}
const validInt=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
function validBet(b){return b&&typeof b.id==='string'&&b.id.length<=40&&isRaceStart(b.raceId)&&Object.hasOwn(BET_TYPES,b.type)&&(b.type==='trifecta'?Array.isArray(b.horse)&&b.horse.length===3&&new Set(b.horse).size===3&&b.horse.every(n=>validInt(n,1)&&n<=10):validInt(b.horse,1)&&b.horse<=10)&&validInt(b.amount,MIN_BET)&&b.amount%BET_STEP===0&&validInt(b.odds,10)&&validInt(b.time)&&(b.status==='pending'?b.payout===0:['won','lost'].includes(b.status)&&validInt(b.payout)&&(b.status==='lost'?b.payout===0:b.payout===payoutFor(b.amount,b.odds)));}
export function hydrateRacing(raw){
 const racing=createRacing();
 // Every unsettled ticket stays (its KP is already paid); settled ones fill the rest of the 60 shown, newest first.
 if(Array.isArray(raw?.raceBets))racing.raceBets=keepPending(raw.raceBets.filter(validBet)).map(b=>({id:b.id,raceId:b.raceId,type:b.type,horse:b.horse,amount:b.amount,odds:b.odds,status:b.status,payout:b.payout,time:b.time}));
 if(validInt(raw?.raceWeek?.start)&&validInt(raw.raceWeek.spent))racing.raceWeek={start:raw.raceWeek.start,spent:raw.raceWeek.spent};
 return racing;
}
export function weeklySpent(state,now){return state.raceWeek.start===weekStart(now)?state.raceWeek.spent:0;}
export function placeRaceBet(state,{raceId,type,horse,amount},now,entries=[]){
 if(raceId!==openRaceStart(now))throw Error('このレースの馬券は締め切りました');
 if(!Object.hasOwn(BET_TYPES,type))throw Error('券の種類を選んでください');
 const card=raceCard(raceId,PUBLIC_SALT,entries);
 if(type==='trifecta'?(!Array.isArray(horse)||horse.length!==3||new Set(horse).size!==3||horse.some(n=>!Number.isInteger(n)||n<1||n>card.size)):(!Number.isInteger(horse)||horse<1||horse>card.size))throw Error('馬を選んでください（3連単は異なる3頭を着順通りに）。');
 if(!validInt(amount,MIN_BET)||amount%BET_STEP!==0)throw Error(`金額は${MIN_BET} KP以上、${BET_STEP} KP単位です`);
 if(amount>MAX_RACE_BET)throw Error('馬券は1枚100,000 KPまでです。');
 if(amount>state.cash)throw Error('KPが不足しています');
 const spent=weeklySpent(state,now);
 if(spent+amount>WEEKLY_LIMIT)throw Error(`1週間に買える馬券は${WEEKLY_LIMIT.toLocaleString('ja-JP')} KPまでです（残り${(WEEKLY_LIMIT-spent).toLocaleString('ja-JP')} KP）`);
 const odds=type==='trifecta'?trifectaOdds(card,horse):raceOdds(card)[type][horse];
 if(!Number.isSafeInteger(odds)||odds<10)throw Error('オッズを取得できません。');
 if(!Number.isSafeInteger(payoutFor(amount,odds)))throw Error('払戻金が計算上限を超えています。');
 const bet={id:`${now}-${state.raceBets.length}`,raceId,type,horse,amount,odds,status:'pending',payout:0,time:now};
 state.cash-=amount;
 state.raceWeek={start:weekStart(now),spent:spent+amount};
 state.raceBets.unshift(bet);
 state.raceBets=keepPending(state.raceBets);
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
export function raceRuns(card,state){return card.big||card.crown||!!card.event||state.raceBets.some(b=>b.raceId===card.id);}

// Owners (docs/RACING_PLAN.md §6). The Worker owns horses and prizes; these rules are shared for display.
export const MAX_OWNED=3,RETIRE_RACES=20,DAILY_EXCHANGES=3,PRIZES=[1000,400,200];
export const BOXES=[
 {id:'normal',label:'ノーマル',price:3000,odds:[90,10,0,0,0]},
 {id:'silver',label:'シルバー',price:15000,odds:[15,75,10,0,0]},
 {id:'gold',label:'ゴールド',price:60000,odds:[0,15,75,10,0]},
 {id:'platinum',label:'プラチナ',price:250000,odds:[0,0,30,70,0]},
 {id:'legend',label:'レジェンド',price:1000000,odds:[0,0,0,70,30]},
 {id:'apex',label:'頂上級確定',price:3500000,odds:[0,0,0,0,100]},
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
