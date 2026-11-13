/** KESO relics: a server-owned collection. No bonuses alter other games' KP economy. */
import {dragoonSetComplete,DRAGOON_SET_NAME} from './relic-dragoon.ts';
import {abyssEquipped} from './relic-abyss.ts';
import {NORMAL_RELIC_BY_ID,NORMAL_RELIC_BY_RARITY,RELIC_RARITIES,RELIC_CATALOG_COUNT,RELIC_MODE_NAMES} from './relic-catalog.ts';
import {steamExtraRelics,STEAM_EXTRA_PER_GRADE,STEAM_GRADE_NAMES,type SteamGrade,type SteamFeatureKind} from './steam-relic-catalog.ts';
import type {RelicMode,NormalRelicRarity} from './relic-catalog.ts';
export {RELIC_CATALOG_COUNT,RELIC_RARITIES} from './relic-catalog.ts';
export const RELIC_SUMMON_COST = 200;
export const RELIC_SUMMON_SIZES = [1, 10, 100, 1000] as const;
export type RelicOrigin = 'normal' | 'steam' | 'unite';
export type RelicRarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythic' | 'ancient' | 'transcendent' | 'exclusive';
export interface RelicItem {
  id: string;
  name: string;
  origin: RelicOrigin;
  rarity: RelicRarity;
  power: number;
  ability: string;
  mode?: RelicMode;
  skill?: string;
  percent?: number;
  cap?: number;
  count: number;
  mutation?:{kind:'prism'|'risk'|'comeback';percent:number;at:number};
  foil?:{kind:'holographic'|'starlit'|'abyss';percent:number;at:number};
  // External evidence is bound to existing certified receipts, not a browser claim.
  source?: string;
  /** Server-assigned effects for NEW Steam trophies only; persisted once per verified receipt. */
  steamFeature?:{kind:SteamFeatureKind;value:number};
}
export interface RelicCollection {
  totalSummons: number;
  shards?: number;
  horseVouchers?: number;
  items: Record<string, RelicItem>;
  equipped: string[];
  dailyNativeBonus?: {day:string;amount:number};
  /** Casino ONLY. UTC calendar day switches at 09:00 JST, stored atomically with each spin. */
  dailyCasinoRelic?: {day:string;amount:number};
  /** Stocks, racing and M.League: the same day boundary and cap, one bucket per mode, stored with the settlement. */
  dailyNativeRelic?: Partial<Record<'market'|'racing'|'mleague',{day:string;amount:number}>>;
  /** Losses (2026-11-05 owner decision): the relic multiplier also applies to a settled loss, with the same caps. */
  dailyRelicLoss?: Partial<Record<'casino'|'market'|'racing'|'mleague',{day:string;amount:number}>>;
  nativeLost?: number;
  lastRelicLoss?: {mode:string;amount:number;penalty:number;at:number};
  /** Loadouts taken off in the last 24 hours (copies of the items). A settled loss uses the strongest of these
   * and the current loadout, so taking relics off right before a losing sale does not dodge the penalty. */
  recentLoadouts?: {items:RelicItem[];until:number}[];
  /** When the equipped set last changed (relics put on within 90 minutes before a win do not count for it). */
  loadoutChangedAt?: number;
  lastNativeEffect?: {mode:string;amount:number;bonus:number;percent:number;at:number;names:string[];lines?:RelicBonusLine[];sets?:{name:string;bonus:number}[]};
  summonHistory?:SummonHistoryEntry[];
  presets?:Record<string,string[]>;
  nativeEffects?:RelicEffectRecord[];
  nativeEarned?:number;
  nativeCount?:number;
  mutatedCount?:number;
  foilCount?:number;
}
export const RELIC_SLOTS = 4;
export const RELIC_PRESETS:ReadonlyArray<{id:string;name:string}>=[
 {id:'balanced',name:'バランス'}, {id:'valorant',name:'VALORANT'},
 {id:'racing',name:'競馬'}, {id:'casino',name:'カジノ'},
 {id:'market',name:'株式'}, {id:'risk',name:'危険なビルド'},
];
export type SummonHistoryEntry={
 at:number;start:number;end:number;count:number;cost:number;summary:Record<string,number>;
 highlights:Array<{id:string;name:string;rarity:string}>;mutations:string[];foils:string[];
};
export type RelicEffectRecord={
 id:string;mode:string;amount:number;bonus:number;at:number;origin:'native'|'verified';
 lines:RelicBonusLine[];sets:{name:string;bonus:number}[];resonance:number;
};
/** Achievements are granted only from monitored, already certified kp_steam_events.
 * This catalog does not fetch the user's historical achievements.
 */
export const STEAM_RELIC_TIERS=[
  {max:0.01,label:'異界',power:335,percent:15,cap:75},
  {max:0.1,label:'深淵',power:285,percent:11,cap:58},
  {max:1,label:'神話',power:235,percent:9,cap:45},
  {max:5,label:'偉業',power:175,percent:7,cap:34},
  {max:10,label:'熟練',power:135,percent:6,cap:27},
  {max:25,label:'挑戦',power:95,percent:4,cap:19},
  {max:100,label:'旅路',power:65,percent:2,cap:12},
] as const;
export function steamRelicTier(percent:number){
 if(!Number.isFinite(percent)||percent<0||percent>100)throw Error('Steamの実績解除率を確認できません。');
 // 25% exactly belongs to the new widely obtainable 25%+ tier.
 if(percent>=25)return STEAM_RELIC_TIERS[6]!;
 return STEAM_RELIC_TIERS.find(t=>percent<=t.max)!;
}
export const STEAM_RELIC_ARCHETYPES=[
 {name:'冒険の羅針盤',mode:'universal',skill:'spark',ability:'全体への追い風'},
 {name:'勝負師の証',mode:'casino',skill:'highroll',ability:'カジノの大勝負'},
 {name:'馬群を裂く勲章',mode:'racing',skill:'advance',ability:'競馬の勝負所'},
 {name:'相場の残響',mode:'market',skill:'rescue',ability:'株の小さな取引'},
 {name:'知識の紋章',mode:'quiz',skill:'master',ability:'VCT QUIZの完走'},
 {name:'戦場の記憶',mode:'competitive',skill:'sovereign',ability:'コンペ勝利'},
 {name:'卓上の誓い',mode:'mleague',skill:'highroll',ability:'Mリーグ予想'},
 {name:'夜話の灯火',mode:'voice',skill:'spark',ability:'通話への参加'},
 {name:'七番目の勝負符',mode:'fortune',skill:'lucky7',ability:'報酬の末尾が7の時に輝く'},
 {name:'循環の金貨',mode:'finance',skill:'advance',ability:'株・競馬・カジノ・Mリーグ'},
 {name:'薄氷の護符',mode:'universal',skill:'rescue',ability:'全体の低額獲得を補助'},
 {name:'突破者の楯',mode:'unrated',skill:'master',ability:'アンレの勝利'},
] as const;
export function steamRelicArchetype(app:number,achievement:string){
 // Fixed FNV-1a; independent of the order in which monitored achievements are claimed.
 let h=(2166136261^app)>>>0;
 for(let i=0;i<achievement.length;i++)h=Math.imul(h^achievement.charCodeAt(i),16777619)>>>0;
 return STEAM_RELIC_ARCHETYPES[h%STEAM_RELIC_ARCHETYPES.length]!;
}
/** Visible collection: 12 original archetypes plus 18 new grade-exclusive designs. */
export function steamRelicPool(grade:SteamGrade){
 const tier=STEAM_RELIC_TIERS.find(t=>t.label===grade)!;
 return [
  ...STEAM_RELIC_ARCHETYPES.map(a=>({...a,percent:tier.percent,feature:'none' as const,featureValue:0})),
  ...steamExtraRelics(grade).map(a=>({...a,ability:'Steam限定の固有設計'})),
 ];
}
export const STEAM_RELIC_POOL_GRADES=STEAM_GRADE_NAMES;
export function steamRelicVariant(app:number,achievement:string,percent:number){
 const grade=steamRelicTier(percent).label as SteamGrade;
 let h=(2166136261^app)>>>0;
 for(let i=0;i<achievement.length;i++)h=Math.imul(h^achievement.charCodeAt(i),16777619)>>>0;
 return steamRelicPool(grade)[h%(STEAM_RELIC_ARCHETYPES.length+STEAM_EXTRA_PER_GRADE)]!;
}
const STEAM_SKILL_TEXT:Record<string,string>={
 spark:'報酬を獲得',rescue:'基準以下の報酬を獲得',advance:'基準以上の報酬を獲得',
 highroll:'高額報酬を獲得',triple:'3の倍数の報酬を獲得',quarter:'25の倍数の報酬を獲得',
 lucky7:'末尾7の報酬を獲得',prime:'素数KPの報酬を獲得',square:'平方数KPの報酬を獲得',
 reverse:'左右対称の報酬を獲得',odd:'奇数KPの報酬を獲得',even:'偶数KPの報酬を獲得',
 master:'達成・勝利を確定',sovereign:'勝利を確定',
};
const steamFeatureText=(kind:SteamFeatureKind,value:number)=>({
 none:'',fixed:'さらに固定＋'+value+'KP。',
 chorus:'同時に発動したほかの遺物1個につき＋'+value+'KP。',
 mirror:'ほかの遺物の最大倍率追加分の'+value+'%を複写。',
 curse:'条件未達の場合、ほかの遺物の追加KPを'+value+'%減らす。',
} as const)[kind];
export const UNITE = {
 'unite.first_win':{name:'テイアの守護核',power:390,ability:'全モードの達成に寄り添う堅守',mode:'universal',skill:'spark',percent:10,cap:36,wins:1},
 'unite.two_wins':{name:'エオスの双星',power:425,ability:'全モードの少額報酬に効く逆境効果',mode:'universal',skill:'rescue',percent:12,cap:40,wins:2},
 'unite.three_wins':{name:'伝説を奪う手',power:480,ability:'カジノの大勝負で単体発動',mode:'casino',skill:'highroll',percent:16,cap:58,wins:3},
 'unite.four_wins':{name:'テイアの不落城',power:545,ability:'株式の買付に単体発動',mode:'market',skill:'advance',percent:18,cap:65,wins:4},
 'unite.five_wins':{name:'レックウザの逆鱗',power:620,ability:'検証済みの勝利で全モードに効果',mode:'universal',skill:'sovereign',percent:20,cap:80,wins:5},
 'unite.career_10':{name:'十勝の結晶',power:445,ability:'競馬の確定配当を補助',mode:'racing',skill:'master',percent:12,cap:55,wins:10},
 'unite.career_25':{name:'二十五戦の灯台',power:510,ability:'カジノの小さな勝利を補助',mode:'casino',skill:'rescue',percent:16,cap:60,wins:25},
 'unite.career_50':{name:'五十勝の栄光',power:570,ability:'株式市場と競馬の双方に作用',mode:'finance',skill:'advance',percent:18,cap:70,wins:50},
 'unite.career_100':{name:'百戦の星冠',power:650,ability:'全モードの高額な報酬へ単体効果',mode:'universal',skill:'highroll',percent:22,cap:80,wins:100},
 'unite.career_200':{name:'無窮のエオス',power:710,ability:'全モードで特別な勝利効果',mode:'universal',skill:'sovereign',percent:25,cap:80,wins:200},
} as const;
export type UniteRelicId=keyof typeof UNITE;
export const UNITE_REQUIREMENTS:Readonly<Record<UniteRelicId,number>>=Object.fromEntries(
 Object.entries(UNITE).map(([id,def])=>[id,def.wins]),
) as Record<UniteRelicId,number>;
export const UNITE_STREAK_IDS:ReadonlySet<string>=new Set(Object.keys(UNITE).filter(k=>!k.startsWith('unite.career_')));
export function relicCollection(state: {relics?: RelicCollection}): RelicCollection {
  if (!state.relics) state.relics = {totalSummons: 0, items: {}, equipped: []};
  // Old items keep their original ids, duplicate counts and equipped slots.
  // Their obsolete generic descriptions are upgraded to the new mode-specific catalog.
  for (const [id,item] of Object.entries(state.relics.items)) {
    const definition = NORMAL_RELIC_BY_ID.get(id);
    if (!definition || item.origin !== 'normal') continue;
    item.name=definition.name;
    item.ability=definition.ability;
    item.mode=definition.mode;
    item.skill=definition.skill;
    item.power=definition.power+Math.min(60,Math.floor(Math.log2(Math.max(1,item.count)))*5);
  }
  return state.relics;
}
// A long-term progression curve. Counts are lifetime summons; existing relics are never removed.
export const SUMMON_MILESTONES = [0,300,750,1350,2100,3000,4050,5250,6600,8100] as const;
export const summonLevel = (total:number) => Math.max(1,SUMMON_MILESTONES.filter(n=>total>=n).length);
export function summonProgress(total:number){
 const level=summonLevel(total),current=SUMMON_MILESTONES[level-1]!;
 const next=level<10?SUMMON_MILESTONES[level]!:null;
 return {level,total,current,next,remaining:next===null?0:Math.max(0,next-total)};
}
/** Exact ticket odds (one million possible outcomes), interpolated at each level.
 * Only the transcendent odds have been boosted. Other non-common tiers retain
 * their previous odds, except Lv10 ancient gives up 70 tickets to keep common at 0.
 */
const START_RATES = [520092,280000,130000,50000,17500,2400,8] as const;
const END_RATES = [0,40000,300000,400000,210000,49970,30] as const;
// Lv1–10, in tickets per million (= 0.0001% per ticket).
// 0.0008%, 0.0011%, 0.0014%, 0.0017%, 0.002%, 0.0025%,
// 0.003%, 0.005%, 0.007%, 0.01%.
const TRANSCENDENT_ROLLS_BY_LEVEL = [8,11,14,17,20,25,30,50,70,100] as const;
export function rarityRatesForLevel(level:number):Readonly<Record<NormalRelicRarity,number>> {
  if (!Number.isInteger(level)||level<1||level>10) throw Error('召喚レベルが不正です。');
  const rates=RELIC_RARITIES.map((_,i)=>START_RATES[i]!+Math.round((END_RATES[i]!-START_RATES[i]!)*(level-1)/9));
  const formerTranscendent=rates[6]!;
  rates[6]=TRANSCENDENT_ROLLS_BY_LEVEL[level-1]!;
  // Lv1–9: common absorbs the small difference. At Lv10 common is already zero,
  // so shift 0.007 percentage points from ancient to transcendent instead.
  if(level===10)rates[5]=rates[5]!-(rates[6]!-formerTranscendent);
  rates[0]=1_000_000-rates.slice(1).reduce((sum,n)=>sum+n,0);
  return Object.fromEntries(RELIC_RARITIES.map((r,i)=>[r,rates[i]!/10000])) as Record<NormalRelicRarity,number>;
}
export function rarityForRoll(roll:number,level:number):RelicRarity {
  if (!Number.isInteger(roll)||roll<0||roll>=1_000_000)throw Error('Invalid relic roll');
  const probabilities=rarityRatesForLevel(level);
  let limit=0;
  for(const rarity of [...RELIC_RARITIES].reverse()){
    limit+=Math.round(probabilities[rarity]*10000);
    if(roll<limit)return rarity;
  }
  throw Error('Relic chance table is invalid');
}
/** Effects do not modify results or RNG. Only certified receipts may award KP. */
/** A shared, pure evaluation for both real credited KP and the visible simulator.
 * Special axes: ancient = chain seal; transcendental = missed-condition breakthrough;
 * Steam/Unite = flat origin seal. No artificial stacking or daily payout ceilings.
 */
export type RelicBonusLine={
 id:string;name:string;mode:string;short:string;percent:number;effectivePercent:number;
 cap:number;active:boolean;triggered:boolean;base:number;exotic:number;trait:string;reason:string;
};
export type RelicBonusResult={
 bonus:number;gross:number;cap:number;percent:number;effectivePercent:number;
 skills:string[];lines:RelicBonusLine[];resonance:number;
 sets:{name:string;bonus:number}[];curseReversed:boolean;
 spikeOpening?:{game:number;multiplier:number;flatPerRelic:number;eligible:number};
};
const RELIC_NATIVE_MODES=new Set(['casino','market','racing','mleague']);
/** Only certified game receipts get a flat ability; no native casino/stocks arbitrage. */
const HIDDEN_VOICE_GEARS=['normal.voice.riddle.three','normal.voice.riddle.five','normal.voice.riddle.fifteen'] as const;
// Alternate four-piece resonance. Unlike the existing fourth gear, this one
// can be assembled without a transcendent rarity item. No public announcements.
const VOICE_RESONANCE_FOURTH='normal.voice.alarm';
const VOICE_RESONANCE_KP=4800;
function voiceResonanceReady(c:RelicCollection,equipped:Set<string>):boolean {
 return [...HIDDEN_VOICE_GEARS,VOICE_RESONANCE_FOURTH].every(id=>
   equipped.has(id)&&c.items[id]?.origin==='normal'&&c.items[id]?.rarity!=='transcendent'
   &&(c.items[id]?.count??0)>0);
}
const RELIC_ABILITY_MODES=new Set(['competitive','unrated','swiftplay','spikerush','teamdeathmatch',
 'escalation','deathmatch','skirmish','quiz','voice','mahjong','unite','steam','loop','dmchallenge']);
const safeReward=(n:number)=>Number.isFinite(n)?Math.max(0,Math.min(Number.MAX_SAFE_INTEGER-1,Math.floor(n))):0;
const MODE_THRESHOLDS:Record<string,readonly [number,number]>={
 competitive:[200,400],unrated:[200,400],swiftplay:[70,180],spikerush:[40,100],
 teamdeathmatch:[50,100],escalation:[50,150],deathmatch:[50,500],skirmish:[50,250],
 racing:[100,500],casino:[100,500],market:[50,200],mleague:[100,500],
 quiz:[30,100],voice:[10,15],
 mahjong:[100,400],unite:[100,400],steam:[100,500],loop:[1000,50000],dmchallenge:[1000,5000],
};
const compatibleRelic=(sourceMode:string|undefined,mode:string)=>sourceMode===mode||
 sourceMode==='universal'||sourceMode==='fortune'||
 (sourceMode==='finance'&&RELIC_NATIVE_MODES.has(mode))||
 (sourceMode==='marketplus'&&mode==='market')||
 (sourceMode==='racingplus'&&mode==='racing')||
 (sourceMode==='casinoplus'&&mode==='casino');
/** Server-verified career game index only. No client API can choose a lower game.
 * Helps new players feel their equipped relics even at a 20/40 KP base. */
export function spikeOpeningTier(gamesBefore:number){
 if(!Number.isSafeInteger(gamesBefore)||gamesBefore<0)return null;
 if(gamesBefore<6)return {game:gamesBefore+1,multiplier:3,flatPerRelic:50};
 if(gamesBefore<15)return {game:gamesBefore+1,multiplier:2,flatPerRelic:30};
 if(gamesBefore<40)return {game:gamesBefore+1,multiplier:1.5,flatPerRelic:15};
 return null;
}
const hasPrimeAmount=(n:number)=>{if(n<2)return false;for(let k=2;k*k<=n;k++)if(n%k===0)return false;return true;};
const relicTrigger=(skill:string|undefined,amount:number,win:boolean,bounds:readonly[number,number]):boolean=>{
 const sum=String(amount).split('').reduce((a,v)=>a+Number(v),0);
 switch(skill){
  case 'spark':return true;
  case 'rescue':return amount<=bounds[0];
  case 'advance':case 'surge':return amount>=bounds[0];
  case 'highroll':return amount>=bounds[1];
  case 'lucky7':return amount%10===7;
  case 'odd':return amount%2===1;
  case 'even':return amount%2===0;
  case 'prime':return hasPrimeAmount(amount);
  case 'square':return Math.floor(Math.sqrt(amount))**2===amount;
  case 'quarter':return amount%25===0;
  case 'mod11':return amount%11===0;
  case 'mod13':return amount%13===0;
  case 'digit7':return sum%7===0;
  case 'double':return /(\d)\1/.test(String(amount));
  case 'reverse':return String(amount)===String(amount).split('').reverse().join('');
  case 'near':return amount>=bounds[0]&&amount<=bounds[0]+50;
  case 'thin':return amount<bounds[0];
  case 'heavy':return amount>=bounds[1]*2;
  case 'triple':return amount%3===0;
  case 'lucky77':return String(amount).includes('77');
  case 'master':case 'sovereign':return win;
  case 'victory_high':return win&&amount>=400;
  default:return false;
 }
};
export function evaluateRelicBonus(
 collection:RelicCollection|undefined,mode:string,event:{amount:number;win:boolean;spikeGamesBefore?:number},
 _nativeRemaining=120,
):RelicBonusResult{
 const empty:RelicBonusResult={bonus:0,gross:0,cap:0,percent:0,effectivePercent:0,skills:[],lines:[],resonance:0,sets:[],curseReversed:false};
 const amount=event.amount,bounds=MODE_THRESHOLDS[mode];
 if(!collection||!bounds||!Number.isSafeInteger(amount)||amount<=0)return empty;
 const lines:RelicBonusLine[]=[];
 const equipped=new Set(collection.equipped.slice(0,RELIC_SLOTS));
 for(const id of equipped){
  const item=collection.items[id],def=NORMAL_RELIC_BY_ID.get(id);
  if(!item)continue;
  const sourceMode=def?.mode??item.mode??'universal';
  const skill=def?.skill??item.skill;
  const basePercent=def?.percent??item.percent??0,cap=def?.cap??item.cap??0;
  const special=def?.special;
  const boosted=item.origin==='normal'&&!special?Math.min(5,Math.floor(Math.log2(Math.max(1,item.count)))):0;
  const mutation=item.mutation;
  const mutationBonus=mutation&&!special?(mutation.kind==='prism'||(mutation.kind==='risk'&&amount%2===0)||(mutation.kind==='comeback'&&!event.win)?mutation.percent:0):0;
  const percent=basePercent+boosted+mutationBonus+(!special?(item.foil?.percent??0):0);
  const active=compatibleRelic(sourceMode,mode);
  const eligible=Boolean(special)&&special!=='shards'&&RELIC_ABILITY_MODES.has(mode);
  const specialCondition=special==='comeback'?!event.win:special==='threshold'?amount>=500:
   special==='voice_key'?mode==='voice'&&(id.endsWith('.three')?amount%3===0:id.endsWith('.five')?amount%5===0:amount%15===0):
   special==='voice_ritual'?mode==='voice'&&amount%15===0&&HIDDEN_VOICE_GEARS.every(key=>equipped.has(key)&&collection.items[key]?.count>0):true;
  const triggered=active&&((eligible&&specialCondition)||(!special&&percent>0&&relicTrigger(skill,amount,event.win,bounds)));
  const base=triggered?safeReward(amount*percent/100):0;
  const trait=def?.trait??(item.rarity==='ancient'?'刻印連鎖':item.rarity==='transcendent'?'運命突破':item.origin==='steam'||item.origin==='unite'?'出自の加護':'');
  let exotic=trait.startsWith('運命突破')&&active&&!triggered
   ?Math.max(1,Math.floor(item.power/70)):0;
  if(triggered){
   if(special==='fixed')exotic=6;
   else if(special==='digits')exotic=String(amount).split('').reduce((sum,d)=>sum+Number(d),0)*2;
   else if(special==='root')exotic=Math.floor(Math.sqrt(amount))*3;
   else if(special==='comeback')exotic=50;
   else if(special==='threshold')exotic=250;
   else if(special==='voice_key'){
     exotic=id.endsWith('.three')?1:id.endsWith('.five')?3:9;
     // Only a verified 20-minute voice receipt and the complete non-transcendent
     // four-slot combination unlock this fixed synergy. Other modes are unaffected.
     if(mode==='voice'&&id==='normal.voice.riddle.fifteen'&&amount===15
       &&voiceResonanceReady(collection,equipped))exotic=VOICE_RESONANCE_KP;
    }
   else if(special==='voice_ritual')exotic=900;
  }
  lines.push({id,name:def?.name??item.name,mode:sourceMode,
   short:def?.short??item.ability,percent:basePercent,effectivePercent:percent,
   cap,active,triggered,base,exotic:safeReward(exotic),trait,
   reason:!active?'対象ゲーム外':special==='shards'?'欠片化でのみ発動':
    special&&!eligible?'取引系では固有能力は無効':
    triggered?(special?'固有能力が発動':'条件達成'):exotic?'運命突破が発動':'条件未達'});
 }
 const activated=lines.filter(l=>l.triggered);
 for(const line of lines){
  if(NORMAL_RELIC_BY_ID.get(line.id)?.special==='echo'&&line.triggered){
   const other=activated.filter(x=>x.id!==line.id).length;
   if(other)line.exotic=other*40;
   else{line.triggered=false;line.reason='ほかの遺物が発動せず、連結不成立';}
  }
  if(line.trait.startsWith('刻印連鎖')&&line.triggered){
   const other=activated.filter(x=>x.id!==line.id).length;
   line.exotic=other*4;
  }else if(line.trait.startsWith('出自の加護')&&line.triggered){
   line.exotic=Math.max(1,Math.floor((collection.items[line.id]?.power??0)/110));
  }
 }

 // Opening blessing is a NEW independent effect (not a replacement for the
 // item's usual win/digit triggers). Compatible equipped relics always give
 // a modest fixed bonus, and their triggered % component is amplified.
 // Therefore a match-1 loss with 20 KP still benefits visibly from equipment.
 const opening=mode==='spikerush'&&event.spikeGamesBefore!==undefined
  ?spikeOpeningTier(event.spikeGamesBefore):null;
 const openingEligible=opening?lines.filter(l=>l.active&&NORMAL_RELIC_BY_ID.get(l.id)?.special!=='shards'):[];
 if(opening)for(const line of openingEligible){
  line.base=safeReward(line.base*opening.multiplier);
  line.exotic=safeReward(line.exotic+opening.flatPerRelic);
  line.reason+='／⚡先陣の加護：固定＋'+opening.flatPerRelic+'KP・本来の倍率分×'+opening.multiplier;
 }
  // A Steam curse suppresses OTHER relic bonuses on missed activation, never the verified base KP.
 for(const line of lines){
  const feature=collection.items[line.id]?.steamFeature;
  if(feature?.kind!=='curse'||!line.active||line.triggered)continue;
  const factor=Math.max(0,100-feature.value)/100;
  for(const other of lines)if(other.id!==line.id){
   other.base=safeReward(other.base*factor);
   other.exotic=safeReward(other.exotic*factor);
   if(other.triggered)other.reason+='／Steam禁呪の反動';
  }
  line.reason+='／禁呪の反動（ほかの遺物－'+feature.value+'%）';
 }
 const pactIds=new Set(lines.map(x=>x.id));
 const curseReversed=pactIds.has('normal.pact.void')&&pactIds.has('normal.pact.coinflip')&&amount%7===0;
 // Risk pacts are independently rolled normal relics, NEVER Steam/Unite upgrades.
 // Drawbacks suppress bonus from OTHER relics only, not the verified base KP reward.
 let suppressResonance=false;
 for(const line of lines){
  const pact=NORMAL_RELIC_BY_ID.get(line.id)?.tradeoff;
  if(!line.active||!pact)continue;
  const others=lines.filter(l=>l.id!==line.id);
  const suppress=(factor:number)=>{
   for(const other of others){
    if(other.triggered||other.exotic>0)other.reason+='／'+line.name+'の代償で'+Math.round((1-factor)*100)+'%減';
    other.base=safeReward(other.base*factor);other.exotic=safeReward(other.exotic*factor);
   }
  };
  if(pact==='solo'&&line.triggered)suppress(.2);
  if(pact==='coinflip'&&amount%2!==0)suppress(curseReversed?1.25:.4);
  if(pact==='bloodmoon'&&amount<400)suppress(.3);
  if(pact==='allin'&&amount%10!==7)suppress(.5);
  if(pact==='void'){suppress(curseReversed?1.25:.25);suppressResonance=!curseReversed;}
  if(pact==='eclipse'&&!(event.win&&amount>=400))suppress(0);
  if(pact==='frenzy'&&!hasPrimeAmount(amount))suppress(.1);
  if(pact==='chain'){
   const otherCount=others.filter(l=>l.triggered).length;
   if(otherCount<2){line.base=0;line.triggered=false;line.reason='連鎖不成立（ほか2個の発動が必要）';}
   else{line.effectivePercent+=60*otherCount;line.base=safeReward(amount*line.effectivePercent/100);line.reason='連鎖成功：ほか'+otherCount+'個の効果と連動';}
  }
 }
 // Server-persisted Steam abilities are evaluated after drawback suppression.
 // A mirror only copies another relic's percentage portion, never its own or a prior mirror.
 for(const line of lines){
  const feature=collection.items[line.id]?.steamFeature;
  if(!feature||!line.active||!line.triggered)continue;
  let extra=0;
  if(feature.kind==='fixed')extra=feature.value;
  else if(feature.kind==='chorus')extra=lines.filter(other=>other.id!==line.id&&other.triggered).length*feature.value;
  else if(feature.kind==='mirror')extra=Math.floor(Math.max(0,...lines.filter(other=>other.id!==line.id).map(other=>other.base))*feature.value/100);
  if(extra>0){
   line.exotic=safeReward(line.exotic+extra);
   line.reason+='／Steam固有＋'+extra+'KP';
  }
 }
 const effective=lines.filter(l=>l.triggered);
 let gross=safeReward(lines.reduce((n,l)=>n+l.base+l.exotic,0));
 const sets:{name:string;bonus:number}[]=[];
 const activatedItems=lines.filter(l=>l.base+l.exotic>0);
 const applySet=(name:string,ratio:number)=>{
  const bonus=safeReward(gross*ratio);
  if(bonus){sets.push({name,bonus});gross=safeReward(gross+bonus);}
 };
 const modes=activatedItems.map(l=>l.mode);
 const rarities=activatedItems.map(l=>collection.items[l.id]?.rarity);
 if(modes.some(m=>modes.filter(x=>x===m).length>=2))applySet('同系統の絆（+10%）',.10);
 if(new Set(modes).size>=3)applySet('異界旅団（+15%）',.15);
 if(rarities.some(r=>rarities.filter(x=>x===r).length>=3))applySet('同格の誓い（+25%）',.25);
 if(curseReversed)sets.push({name:'呪い反転（虚無＋銀貨＋7の倍数）',bonus:0});
 if(dragoonSetComplete(collection))sets.push({name:DRAGOON_SET_NAME,bonus:0});
 if(abyssEquipped(collection))sets.push({name:'深淵の代償（勝ちを増幅、負けの反動も増幅）',bonus:0});
 if(collection.equipped.some(id=>collection.items[id]?.origin==='normal'&&collection.items[id]?.foil))sets.push({name:'色違いの輝き（ハラハラ枠の勝ち×1.5）',bonus:0});
 let resonance=0;
 if(!suppressResonance&&effective.length>=2&&amount%7===0){
  const skillKinds=new Set(effective.map(l=>NORMAL_RELIC_BY_ID.get(l.id)?.skill??collection.items[l.id]?.skill));
  if(skillKinds.size>=2){resonance=safeReward(gross*.2);gross=safeReward(gross+resonance);}
 }
 // Unbounded percentage stacking, no per-receipt, individual, or daily soft cap.
 // The Number.MAX_SAFE_INTEGER boundary is purely an integer-integrity guard.
 const bonus=gross;
 const percent=effective.reduce((n,l)=>n+l.effectivePercent,0);
 return {bonus,gross,cap:0,percent,effectivePercent:Math.round(10000*bonus/amount)/100,
  lines,resonance,sets,curseReversed,
  ...(opening?{spikeOpening:{...opening,eligible:openingEligible.length}}:{}),
  skills:[...lines.filter(l=>l.base+l.exotic>0).map(l=>l.name),...sets.map(x=>x.name),...(resonance?['七重共鳴']:[])]};
}
export function modeRelicBonus(
 collection:RelicCollection|undefined,
 mode:string,
 event:{amount:number;win:boolean},
):{bonus:number;skills:string[]} {
 if(!Number.isSafeInteger(event.amount)||event.amount<=0)return {bonus:0,skills:[]};
 const result=evaluateRelicBonus(collection,mode,event);
 // Preserve the original public contract for callers and tests.
 return {bonus:result.bonus,skills:result.skills};
}
/** Paid only after a verified positive realized casino outcome. Never from placing
 * a stake, purchasing a stock, or buying a ticket. Idempotency is guaranteed by
 * the parent operation transaction. This blocks unlimited risk-free buy loops. */
/** Casino relics are strictly a SMALL cash-back on actual funds at risk.
 * 0.5% of wager (rounded up), at most 250KP per settlement, 500KP per JST 09:00 day.
 * Stake is required for the casino path: missing/malformed evidence fails closed.
 * No cap or balance change applies to any other game/mode.
 */
export const CASINO_RELIC_RATE=0.005;
export const CASINO_RELIC_ROUND_CAP=250;
export const CASINO_RELIC_DAILY_CAP=500;
export function casinoRelicDay(now:number):string{
 return new Date(now).toISOString().slice(0,10); // JST 09:00 == UTC midnight
}
export function casinoRelicAllowance(
 stake:number,usedToday:number,
):number{
 if(!Number.isSafeInteger(stake)||stake<100||stake>200000||
  !Number.isSafeInteger(usedToday)||usedToday<0)return 0;
 return Math.max(0,Math.min(CASINO_RELIC_ROUND_CAP,
  Math.ceil(stake*CASINO_RELIC_RATE),CASINO_RELIC_DAILY_CAP-usedToday));
}
/** Stocks, racing and M.League (2026-11-05): the casino rule, keyed to the KP actually put in.
 * A sale's gross proceeds / a settlement's total stakes. 0.5% of that is below the 1%+1% stock fees and the
 * house edge, so self-made price moves, wash trades and covering every outcome can never pay. */
export const NATIVE_RELIC_RATE=CASINO_RELIC_RATE;
export const NATIVE_RELIC_ROUND_CAP=CASINO_RELIC_ROUND_CAP;
export const NATIVE_RELIC_DAILY_CAP=CASINO_RELIC_DAILY_CAP;
export function nativeRelicAllowance(stake:number,usedToday:number):number{
 if(!Number.isSafeInteger(stake)||stake<=0||!Number.isSafeInteger(usedToday)||usedToday<0)return 0;
 return Math.max(0,Math.min(NATIVE_RELIC_ROUND_CAP,Math.ceil(stake*NATIVE_RELIC_RATE),NATIVE_RELIC_DAILY_CAP-usedToday));
}
export function nativeRelicBonus(
 state:{cash:number;relics?:RelicCollection},
 mode:'casino'|'market'|'racing'|'mleague',
 amount:number,
 now=Date.now(),
 stake=0,
):number {
 if(!state.relics||!Number.isSafeInteger(amount)||amount<=0)return 0;
 // Every native mode has a stake-based and daily cap. A missing or invalid stake pays nothing (safe side).
 const day=casinoRelicDay(now);
 const earned=mode==='casino'
  ?(state.relics.dailyCasinoRelic?.day===day?state.relics.dailyCasinoRelic.amount:0)
  :(state.relics.dailyNativeRelic?.[mode]?.day===day?state.relics.dailyNativeRelic[mode]!.amount:0);
 const allowance=mode==='casino'?casinoRelicAllowance(stake,earned):nativeRelicAllowance(stake,earned);
 if(!allowance)return 0;
 const detail=evaluateRelicBonus(state.relics,mode,{amount,win:true});
 const payout=Math.min(detail.bonus,allowance,Math.max(0,Number.MAX_SAFE_INTEGER-1-state.cash));
 if(!payout)return 0;
 state.cash+=payout;
 if(mode==='casino')state.relics.dailyCasinoRelic={day,amount:earned+payout};
 else state.relics.dailyNativeRelic={...(state.relics.dailyNativeRelic??{}),[mode]:{day,amount:earned+payout}};
 state.relics.lastNativeEffect={mode,amount,bonus:payout,percent:Math.round(payout/amount*10000)/100,at:now,names:detail.skills.slice(0,4),lines:detail.lines,sets:detail.sets};
 state.relics.nativeEarned=Math.min(Number.MAX_SAFE_INTEGER, (state.relics.nativeEarned??0)+payout);
 state.relics.nativeCount=(state.relics.nativeCount??0)+1;
 const record:RelicEffectRecord={id:'native:'+now+':'+(state.relics.nativeCount??0),mode,amount,bonus:payout,at:now,origin:'native',lines:detail.lines,sets:detail.sets,resonance:detail.resonance};
 state.relics.nativeEffects=[record,...(state.relics.nativeEffects??[])].slice(0,30);
 return payout;
}
export const RELIC_LOSS_MEMORY_MS=24*3600_000;
/** Copies of the currently equipped items (before an operation that may change them). */
export function snapshotLoadout(c?:RelicCollection):RelicItem[]{
 if(!c?.equipped?.length)return [];
 return c.equipped.map(id=>c.items[id]).filter((x):x is RelicItem=>Boolean(x)).map(x=>structuredClone(x));
}
/** After an operation: if the equipped set changed, remember the previous one for 24 hours. */
export function rememberLoadout(c:RelicCollection|undefined,before:RelicItem[],now=Date.now()){
 if(!c)return;
 const live=(c.recentLoadouts??[]).filter(l=>l.until>now);
 const changed=before.length>0&&(before.length!==c.equipped.length||before.some((x,i)=>x.id!==c.equipped[i]));
 if(changed){live.unshift({items:before,until:now+RELIC_LOSS_MEMORY_MS});c.loadoutChangedAt=now;}
 if(changed||live.length!==(c.recentLoadouts??[]).length)c.recentLoadouts=live.slice(0,8);
}
function lossBonus(c:RelicCollection,mode:string,loss:number,now:number):number{
 let best=c.equipped.length?evaluateRelicBonus(c,mode,{amount:loss,win:true}).bonus:0;
 for(const l of c.recentLoadouts??[]){
  if(!(l.until>now)||!l.items.length)continue;
  const view:RelicCollection={...c,items:Object.fromEntries(l.items.map(x=>[x.id,x])),equipped:l.items.map(x=>x.id)};
  best=Math.max(best,evaluateRelicBonus(view,mode,{amount:loss,win:true}).bonus);
 }
 return best;
}
/** The mirror of nativeRelicBonus for a settled LOSS in casino, stocks, racing or M.League (owner decision
 * 2026-11-05): the equipped relics' bonus on that amount is taken away instead of added, under the same caps
 * (0.5% of the stake/proceeds, 250 per settlement, 500 per day per mode) and never below a zero balance. */
export function nativeRelicLoss(
 state:{cash:number;relics?:RelicCollection},
 mode:'casino'|'market'|'racing'|'mleague',
 loss:number,
 now=Date.now(),
 stake=0,
):number{
 const c=state.relics;
 if(!c||!(c.equipped?.length||c.recentLoadouts?.some(l=>l.until>now))||!Number.isSafeInteger(loss)||loss<=0)return 0;
 const day=casinoRelicDay(now);
 const used=c.dailyRelicLoss?.[mode]?.day===day?c.dailyRelicLoss[mode]!.amount:0;
 const allowance=mode==='casino'?casinoRelicAllowance(stake,used):nativeRelicAllowance(stake,used);
 if(!allowance)return 0;
 const penalty=Math.min(Math.floor(lossBonus(c,mode,loss,now)*relicLossFactor(relicFlags(c))),allowance,Math.max(0,Math.floor(state.cash)));
 if(!Number.isSafeInteger(penalty)||penalty<=0)return 0;
 state.cash-=penalty;
 c.dailyRelicLoss={...(c.dailyRelicLoss??{}),[mode]:{day,amount:used+penalty}};
 c.nativeLost=Math.min(Number.MAX_SAFE_INTEGER,(c.nativeLost??0)+penalty);
 c.lastRelicLoss={mode,amount:loss,penalty,at:now};
 return penalty;
}
/**
 * Verified receipts (games, voice, Steam, LOOP, …): how relics act, by how much risk the mode carries
 * (owner decision 2026-11-05, replacing the chance-based #342):
 * - THRILL modes (コンペ・アンレ・エスカレーション・デスマッチ・DM一発勝負・スカーミッシュ・雀魂): a WIN gets the full relic bonus with no
 *   cap ("数倍"). A normal loss keeps its base reward with no bonus. A NEGATIVE result (最下位・ラス・大勝負の負け) grows by the same
 *   relic strength: the extra loss is taken even beyond the balance, as 借KP (borrowShortfall), like the base penalty.
 * - SAFE modes (スパイクラッシュ〔基礎だけ〕・TDM・スイフト・レプリケーション・ユナイト・通話・QUIZ): the bonus is at most the base reward (Spike Rush: ten times its base).
 * - ONE-OFF rewards: LOOP up to 20,000 per receipt; Steam up to 20,000 per receipt and 30,000 per day.
 * - アンレの特別抽選 is computed apart: the bonus is on the match reward without the lottery prize.
 * Special effects (they multiply the relic part only): 竜騎士4点 win ×1.25 / extra loss ×0.5; 色違い (thrill wins) ×1.5;
 * 深淵の契約書 win ×1.3 / loss ×1.75; 奈落の王冠 win ×1.5 / loss ×2.
 * Equipment: relics put on within 90 minutes before the settlement do not count for a WIN (the weaker of the current and
 * the previous loadout is used); for a LOSS the strongest loadout of the last 24 hours counts (no taking relics off).
 */
export const FOIL_ODDS=5000;
export const THRILL_MODES=new Set(['competitive','unrated','escalation','deathmatch','dmchallenge','skirmish','mahjong']);
export const ONE_OFF_CAPS:Readonly<Record<string,{receipt:number;daily?:number}>>={loop:{receipt:20000},steam:{receipt:20000,daily:30000}};
export const RELIC_EQUIP_LEAD_MS=90*60_000;
export function relicModeClass(mode:string):'thrill'|'safe'|'oneoff'{
 return THRILL_MODES.has(mode)?'thrill':Object.hasOwn(ONE_OFF_CAPS,mode)?'oneoff':'safe';
}
export type RelicFlags={dragoon:boolean;foil:boolean;contract:boolean;crown:boolean};
export function relicFlags(c?:RelicCollection):RelicFlags{
 if(!c)return {dragoon:false,foil:false,contract:false,crown:false};
 const has=(id:string)=>c.equipped.includes(id)&&c.items[id]?.origin==='normal'&&Number(c.items[id]?.count)>=1;
 return {dragoon:dragoonSetComplete(c),foil:c.equipped.some(id=>c.items[id]?.origin==='normal'&&Boolean(c.items[id]?.foil)),
  contract:has('normal.abyss.contract'),crown:has('normal.abyss.crown')};
}
/** Multiplier on the relic WIN bonus from special effects. */
export function relicWinFactor(f:RelicFlags,thrill:boolean){
 return (f.dragoon?1.25:1)*(f.foil&&thrill?1.5:1)*(f.crown?1.5:f.contract?1.3:1);
}
/** Multiplier on the relic EXTRA LOSS from special effects. */
export function relicLossFactor(f:RelicFlags){
 return (f.dragoon?0.5:1)*(f.crown?2:f.contract?1.75:1);
}
function view(c:RelicCollection,items:RelicItem[]):RelicCollection{
 return {...c,items:Object.fromEntries(items.map(x=>[x.id,x])),equipped:items.map(x=>x.id)};
}
/** The loadout that counts for a WIN settled at `at`: if the current one was put on less than 90 minutes before,
 * the weaker of it and the loadout it replaced. */
export function winLoadout(c:RelicCollection,mode:string,amount:number,at:number,event:{spikeGamesBefore?:number}={}):RelicCollection{
 // Voice has a shorter, still verified 20-minute preparation window.
 // Every other mode keeps the 90-minute anti-switching rule.
 const leadMs=mode==='voice'?20*60_000:RELIC_EQUIP_LEAD_MS;
 if(!(Number(c.loadoutChangedAt)>at-leadMs))return c;
 const previous=(c.recentLoadouts??[])[0];
 const before=previous?view(c,previous.items):view(c,[]);
 const now=evaluateRelicBonus(c,mode,{amount,win:true,...event}).bonus,then=evaluateRelicBonus(before,mode,{amount,win:true,...event}).bonus;
 return now<=then?c:before;
}
/** The loadout that counts for a LOSS: the strongest of the current one and any taken off in the last 24 hours. */
export function lossLoadout(c:RelicCollection,mode:string,loss:number,at:number):RelicCollection{
 let best=c,score=c.equipped.length?evaluateRelicBonus(c,mode,{amount:loss,win:true}).bonus:0;
 for(const l of c.recentLoadouts??[]){
  if(!(l.until>at)||!l.items.length)continue;
  const v=view(c,l.items),b=evaluateRelicBonus(v,mode,{amount:loss,win:true}).bonus;
  if(b>score){best=v;score=b;}
 }
 return best;
}
// D1 hotspot (Nov 2026): matching l.id = 'relic:' || s.id drives a full
// kp_steam_events scan. Search the indexed daily ledger slice first, then use
// the Steam event PRIMARY KEY for exact receipt verification. No policy change.
export const STEAM_RELIC_CAP_USED_SQL=`SELECT COALESCE(SUM(l.delta),0) AS n FROM kp_ledger l
 WHERE l.guild=? AND l.user=? AND l.kind='relic' AND l.at>=?
 AND substr(l.id,1,6)='relic:'
 AND EXISTS(SELECT 1 FROM kp_steam_events s WHERE s.id=substr(l.id,7))`;

/** Caller MUST confirm a new, immutable server-verified receipt before invoking.
 * This is not a public API; browsers can never request a bonus for arbitrary evidence.
 * `lottery` is the legacy signed アンレ split. Legacy receipts keep their original base-only calculation.
 * V7 receipts pass zero: the entire 70/500/2,000/10,000/100,000 award receives relics.
 */
export async function creditVerifiedRelicBonus(
 env:{DB:D1Database},guild:string,user:string,receipt:string,mode:string,amount:number,win:boolean,at=Date.now(),lottery=0,
):Promise<number> {
 if(!Number.isSafeInteger(amount)||amount<=0||!receipt||receipt.length>350)return 0;
 const kind=relicModeClass(mode);
 // Thrill modes: only a win is boosted; a normal loss keeps its plain reward.
 if(kind==='thrill'&&!win)return 0;
 const row=await env.DB.prepare('SELECT data FROM kp_state WHERE guild=? AND user=?')
  .bind(guild,user).first<{data:string}>();
 if(!row)return 0;
 const state=JSON.parse(row.data) as {relics?:RelicCollection};
 if(!state.relics?.equipped?.length)return 0;
 let spikeGamesBefore:number|undefined;
 if(mode==='spikerush'){
  // Proven receipt + immutable snapshot from the already-settled Riot match.
  // Never take the game number from browser input or a mutable profile.
  const spike=await env.DB.prepare(`SELECT json_extract(detail,'$.gamesBefore') AS gamesBefore,json_extract(detail,'$.base') AS base
   FROM spike_rewards WHERE id=? AND guild=? AND user=?
   UNION ALL SELECT json_extract(detail,'$.gamesBefore') AS gamesBefore,json_extract(detail,'$.base') AS base
   FROM spike_overdrive_rewards WHERE id=? AND guild=? AND user=?`)
   .bind(receipt,guild,user,receipt,guild,user).first<{gamesBefore:number;base:number}>();
  if(!spike||!Number.isSafeInteger(spike.gamesBefore)||spike.gamesBefore<0)return 0;
  spikeGamesBefore=spike.gamesBefore;
  // Owner decision 2026-11-05: relics apply to the Spike Rush BASE only (win 40 / loss 20), not to the
  // growth correction, which is already the reward for building the roster.
  if(!Number.isSafeInteger(spike.base)||spike.base<=0)return 0;
  amount=Math.min(amount,spike.base);
 }
 // アンレの特別抽選は独立計算: relics act on the match reward without the lottery prize.
 if(mode==='unrated'&&Number.isSafeInteger(lottery)&&lottery!==0)amount=Math.max(0,amount-lottery);
 if(amount<=0)return 0;
 const loadout=winLoadout(state.relics,mode,amount,at,{spikeGamesBefore});
 const detail=evaluateRelicBonus(loadout,mode,{amount,win,spikeGamesBefore});
 if(!detail.bonus)return 0;
 let bonus=Math.floor(detail.bonus*relicWinFactor(relicFlags(loadout),kind==='thrill'));
 // Spike Rush keeps its 40/20 calculation base; only its final payout ceiling is raised.
 if(kind==='safe')bonus=Math.min(bonus,amount*(mode==='voice'?400:mode==='spikerush'?10:1));
 if(kind==='oneoff'){
  const cap=ONE_OFF_CAPS[mode]!;
  bonus=Math.min(bonus,cap.receipt);
  if(cap.daily){
   const day=Date.parse(casinoRelicDay(at)+'T00:00:00Z');
   const used=await env.DB.prepare(STEAM_RELIC_CAP_USED_SQL).bind(guild,user,day).first<{n:number}>().catch(()=>({n:0}));
   bonus=Math.min(bonus,Math.max(0,cap.daily-Number(used?.n??0)));
  }
 }
 if(!Number.isSafeInteger(bonus)||bonus<=0)return 0;
 const id='relic:'+receipt;
 const saved=await env.DB.prepare('INSERT OR IGNORE INTO kp_ledger(id,guild,user,delta,kind,at) VALUES(?,?,?,?,?,?)')
  .bind(id,guild,user,bonus,'relic',at).run();
 // Log only real credited receipts; write is independently idempotent on retries.
 try{
  await env.DB.prepare(
   'INSERT OR IGNORE INTO relic_effect_logs(id,guild,user,mode,base,bonus,details,at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM kp_ledger WHERE id=? AND guild=? AND user=?)'
  ).bind(id,guild,user,mode,amount,bonus,JSON.stringify({lines:detail.lines,sets:detail.sets,resonance:detail.resonance,curseReversed:detail.curseReversed,spikeOpening:detail.spikeOpening,kind}),at,id,guild,user).run();
 }catch{console.warn('relic_effect_log_pending');}
 return saved.meta.changes?bonus:0;
}
/** Thrill modes: a NEGATIVE result (最下位・ラス・大勝負の負け) grows by the equipped relics' strength. Taken beyond the
 * balance as 借KP, like the base penalty, so keeping KP elsewhere does not dodge it. Once per receipt. */
export async function creditVerifiedRelicLoss(
 env:{DB:D1Database},guild:string,user:string,receipt:string,mode:string,loss:number,at=Date.now(),
):Promise<number>{
 if(relicModeClass(mode)!=='thrill'||!Number.isSafeInteger(loss)||loss<=0||!receipt||receipt.length>350)return 0;
 const row=await env.DB.prepare('SELECT data FROM kp_state WHERE guild=? AND user=?').bind(guild,user).first<{data:string}>();
 if(!row)return 0;
 const state=JSON.parse(row.data) as {relics?:RelicCollection};
 const c=state.relics;
 if(!c||!(c.equipped?.length||c.recentLoadouts?.some(l=>l.until>at)))return 0;
 const loadout=lossLoadout(c,mode,loss,at);
 // Win-only relics count as if their condition were met: the loss mirrors what the same amount would have won.
 const raw=evaluateRelicBonus(loadout,mode,{amount:loss,win:true}).bonus;
 const extra=Math.floor(raw*relicLossFactor(relicFlags(loadout)));
 if(!Number.isSafeInteger(extra)||extra<=0)return 0;
 const id='relic:'+receipt;
 const saved=await env.DB.prepare(`INSERT OR IGNORE INTO kp_ledger(id,guild,user,delta,kind,at)
   SELECT ?,?,?,-MIN(?,balance),'relic',? FROM kp_wallets WHERE guild=? AND user=?`).bind(id,guild,user,extra,at,guild,user).run();
 if(!saved.meta.changes)return 0;
 // The part the balance could not cover becomes 借KP (same mechanism as match penalties).
 try{
  await env.DB.prepare(`INSERT OR IGNORE INTO kp_debt_events(id,guild,user,amount,kind,at) SELECT 'borrow:'||id,guild,user,CAST(? AS INTEGER)+delta,'borrow',at FROM kp_ledger WHERE id=? AND CAST(? AS INTEGER)+delta>0`)
   .bind(extra,id,extra).run();
 }catch{console.warn('relic_loss_debt_pending');}
 return extra;
}
function store(c: RelicCollection, item: RelicItem) {
  const old = c.items[item.id];
  if (old) {
    old.count += 1;
    // Each repeated find grows a common relic gradually, without granting additional KP.
    if (item.origin === 'normal') old.power = item.power + Math.min(60, Math.floor(Math.log2(old.count)) * 5);
  } else c.items[item.id] = item;
}
export function summonRelics(
  state: {cash: number; relics?: RelicCollection},
  count: number,
  numbers?: Uint32Array,
  variantNumbers?: Uint32Array,
) {
  if (!RELIC_SUMMON_SIZES.includes(count as (typeof RELIC_SUMMON_SIZES)[number])) throw Error('召喚は1・10・100・1000連から選んでください。');
  const price = count * RELIC_SUMMON_COST;
  if (state.cash < price) throw Error('召喚に必要なKPが足りません。');
  const entropy = numbers ?? crypto.getRandomValues(new Uint32Array(count * 2));
  if (entropy.length !== count * 2) throw Error('Invalid random draw');
  const c = relicCollection(state), summary: Record<string, number> = {};
  const startCount=c.totalSummons;
  const highlights: Array<{name:string;rarity:string;id:string}> = [];
  const mutations:string[]=[],foils:string[]=[];
  // Independent cryptographic draws for variants. Explicit test entropy suppresses
  // rare random mutations to make deterministic original unit tests stable.
  const variants = variantNumbers ?? (numbers ? new Uint32Array(count*2).fill(0xffffffff) : crypto.getRandomValues(new Uint32Array(count*2)));
  if(variants.length!==count*2)throw Error('Invalid variant draw');
  for (let n = 0; n < count; n++) {
    const rarity = rarityForRoll(entropy[n * 2]! % 1_000_000, summonLevel(c.totalSummons));
    const candidates=NORMAL_RELIC_BY_RARITY.get(rarity as NormalRelicRarity)!;
    const chosen=candidates[entropy[n * 2 + 1]!%candidates.length]!;
    const {id,name,mode,skill,ability,power}=chosen;
    const duplicate=Boolean(c.items[id]);
    store(c,{id,name,origin:'normal',rarity,mode,skill,power,ability,count:1});
    const item=c.items[id]!;
    // 1/4096 duplicate evolution, once per relic ID; 1/5000 foil (色違い, raised from 1/40000 on 2026-11-05),
    // also once per relic ID. Different source/Steam history is untouched.
    if(!chosen.special&&duplicate&&!item.mutation&&variants[n*2]!%4096===0){
     const kinds=['prism','risk','comeback'] as const;
     const kind=kinds[variants[n*2+1]!%kinds.length]!;
     item.mutation={kind,percent:kind==='risk'?24:kind==='comeback'?17:12,at:Date.now()};
     mutations.push(name);c.mutatedCount=(c.mutatedCount??0)+1;
    }
    if(!chosen.special&&!item.foil&&variants[n*2+1]!%FOIL_ODDS===0){
     const kinds=['holographic','starlit','abyss'] as const;
     item.foil={kind:kinds[(variants[n*2]!>>>8)%3]!,percent:3,at:Date.now()};
     foils.push(name);c.foilCount=(c.foilCount??0)+1;
    }
    c.totalSummons += 1;
    summary[rarity] = (summary[rarity] ?? 0) + 1;
    if (['legendary','mythic','ancient','transcendent'].includes(rarity)) highlights.push({id,name,rarity});
  }
  state.cash -= price;
  const rank:Record<string,number>={transcendent:4,ancient:3,mythic:2,legendary:1};
  highlights.sort((a,b)=>(rank[b.rarity]??0)-(rank[a.rarity]??0));
  const entry:SummonHistoryEntry={at:Date.now(),start:startCount+1,end:c.totalSummons,count,cost:price,summary,highlights:highlights.slice(0,12),mutations:mutations.slice(0,15),foils:foils.slice(0,15)};
  c.summonHistory=[entry,...(c.summonHistory??[])].slice(0,30);
  return {...entry,level:summonLevel(c.totalSummons)};
}
export function grantSteamRelic(
 state:{relics?:RelicCollection},
 proof:{id:string;app:number;achievement:string;title:string;percent:number},
) {
 const tier=steamRelicTier(proof.percent);
 if(!Number.isSafeInteger(proof.app)||proof.app<=0||
  typeof proof.id!=='string'||!proof.id.startsWith('steam:')||
  typeof proof.achievement!=='string'||!proof.achievement||
  typeof proof.title!=='string')throw Error('Steamの実績を確認できません。');
 const c=relicCollection(state);
 const id='steam.'+proof.id;
 if(Object.hasOwn(c.items,id))throw Error('この実績遺物は受け取り済みです。');
 if(Object.keys(c.items).filter(k=>k.startsWith('steam.')).length>=200)throw Error('Steam遺物の保有枠は200個までです。');
 const archetype=steamRelicVariant(proof.app,proof.achievement,proof.percent);
 const feature=archetype.feature;
 const strength=Math.round(Math.max(0,archetype.percent-tier.percent)*0.6+(feature==='fixed'?archetype.featureValue*0.15:0));
 const item:RelicItem={
  id,name:tier.label+'の'+archetype.name+'：'+proof.title.slice(0,55),
  origin:'steam',rarity:'exclusive',power:Math.min(1800,tier.power+strength),
  ability:tier.label+'／'+RELIC_MODE_NAMES[archetype.mode]+'で'+(STEAM_SKILL_TEXT[archetype.skill]??'条件達成')+'すると元報酬＋'+archetype.percent+'%。'+steamFeatureText(feature,archetype.featureValue)+'ほかの遺物と上限なしで合算。',
  mode:archetype.mode,skill:archetype.skill,percent:archetype.percent,cap:tier.cap,
  count:1,source:'steam app '+proof.app+' / '+proof.achievement.slice(0,90),
  ...(feature!=='none'?{steamFeature:{kind:feature,value:archetype.featureValue}}:{}),
 };
 store(c,item);
 return{item};
}
export function grantUniteRelic(state:{relics?:RelicCollection}, id:UniteRelicId, wins:number) {
  const required = UNITE_REQUIREMENTS[id];
  if (!Object.hasOwn(UNITE_REQUIREMENTS,id) || !Number.isSafeInteger(wins) || wins < required) throw Error('ユナイトの達成記録を確認できません。');
  const c = relicCollection(state);
  if (c.items[id]) throw Error('このユナイト遺物は受け取り済みです。');
  const def = UNITE[id];
  const condition=id.startsWith('unite.career_')?'検証済みランク戦の累計'+required+'勝':'検証済みランク戦'+required+'連勝';
  const item:RelicItem = {id,name:def.name,origin:'unite',rarity:'exclusive',
   power:def.power,ability:def.ability,mode:def.mode,skill:def.skill,
   percent:def.percent,cap:def.cap,count:1,source:condition};
  store(c,item);
  return {item};
}
export function equipRelic(state:{relics?:RelicCollection},id:string,slot:number) {
  const c = relicCollection(state);
  if (!Number.isInteger(slot)||slot<0||slot>=RELIC_SLOTS) throw Error('装備枠を選んでください。');
  if (id !== '' && !Object.hasOwn(c.items,id)) throw Error('所持していない遺物です。');
  const next = [...c.equipped];
  // Unite is a powerful standalone trophy, not an entire mandatory stack of three.
  if (id && c.items[id]?.origin === 'unite')
    for (let n=0;n<RELIC_SLOTS;n++) if (c.items[next[n]]?.origin === 'unite') next[n] = '';
  for (let n=0;n<RELIC_SLOTS;n++) if (next[n]===id && n!==slot) next[n]='';
  next[slot]=id;
  c.equipped=next;
  return {equipped:next,power:next.reduce((n,key)=>n+(c.items[key]?.power??0),0)};
}

/** Four server-authoritative slots in one idempotent KP operation, never a chain
 * of client-side equip calls. No DB reads beyond the already loaded wallet state. */
export function autoEquipRelics(state:{relics?:RelicCollection},goal:string='all'){
 const modes=['all','competitive','unrated','swiftplay','spikerush','teamdeathmatch','escalation',
  'deathmatch','skirmish','racing','casino','market','mleague','quiz','voice','mahjong','unite','steam','loop','dmchallenge'];
 if(!modes.includes(goal))throw Error('おまかせ装備の目的を選んでください。');
 const c=relicCollection(state),items=Object.values(c.items);
 const applicable=(i:RelicItem)=>{
  const mode=NORMAL_RELIC_BY_ID.get(i.id)?.mode??i.mode??'universal';
  return goal==='all'||mode===goal||mode==='universal'||mode==='fortune'||
   (['market','casino','racing','mleague'].includes(goal)&&mode==='finance')||
   (goal==='market'&&mode==='marketplus')||(goal==='racing'&&mode==='racingplus')||
   (goal==='casino'&&mode==='casinoplus');
 };
 const skillOdds:Record<string,number>={spark:1,rescue:.4,advance:.75,highroll:.18,surge:.7,master:.7,
  sovereign:.7,lucky7:.1,lucky77:.04,odd:.5,even:.5,prime:.15,square:.06,quarter:.04,mod11:.09,
  mod13:.075,digit7:.15,double:.27,reverse:.025,near:.18,thin:.3,heavy:.08,triple:.33};
 const score=(i:RelicItem,selected:RelicItem[])=>{
  const def=NORMAL_RELIC_BY_ID.get(i.id),mode=def?.mode??i.mode??'universal',skill=def?.skill??i.skill??'spark';
  const percent=def?.percent??i.percent??0,cap=def?.cap??i.cap??0;
  const trigger=skillOdds[skill]??.4;
  // Favor useful activation and useful niche items, not raw rarity/power alone.
  let value=(Math.min(50,percent*2)+Math.min(50,cap*.4))*trigger+Math.min(12,i.power/60);
  if(goal==='all'){
   if(mode==='universal')value*=1.75;
   else if(mode==='fortune'||mode==='finance')value*=1.4;
   else value*=.42;
  }else if(mode===goal)value*=1.65;
  else if(mode==='universal')value*=1.12;
  else if(mode==='fortune')value*=.95;
  if(selected.some(x=>(NORMAL_RELIC_BY_ID.get(x.id)?.mode??x.mode)===mode))value*=.84;
  if(selected.some(x=>(NORMAL_RELIC_BY_ID.get(x.id)?.skill??x.skill)===skill))value*=.75;
  if(selected.length&&selected.some(x=>(NORMAL_RELIC_BY_ID.get(x.id)?.skill??x.skill)!==skill))value+=2;
  return value;
 };
 const selected:RelicItem[]=[];
 while(selected.length<RELIC_SLOTS){
  const normalOptions=items.filter(i=>!selected.includes(i)&&applicable(i)&&!(i.origin==='unite'&&selected.some(s=>s.origin==='unite')));
  // Risk pacts can silence the user's other items. Never auto-select a pact
  // until the player opts in deliberately via manual equipment.
  const options=normalOptions.filter(i=>!NORMAL_RELIC_BY_ID.get(i.id)?.tradeoff);
  if(!options.length)break;
  options.sort((a,b)=>score(b,selected)-score(a,selected)||b.power-a.power||a.id.localeCompare(b.id));
  selected.push(options[0]!);
 }
 const ids=selected.map(i=>i.id);
 c.equipped=ids;
 return {equipped:ids,power:ids.reduce((n,id)=>n+(c.items[id]?.power??0),0),goal};
}


/** Custom names live in the existing KV shape to preserve all V7 preset saves. */
export const RELIC_PRESET_LIMIT=20;
export const RELIC_PRESET_NAME_LIMIT=24;
const cleanPresetName=(raw:string):string=>{
 if(typeof raw!=='string')throw Error('プリセット名を入力してください。');
 const name=raw.trim().normalize('NFC');
 if(!name||[...name].length>RELIC_PRESET_NAME_LIMIT||/[\u0000-\u001f\u007f<>]/u.test(name)||
  /^(?:__proto__|constructor|prototype)$/i.test(name))throw Error('プリセット名は1〜24文字（制御文字・<>不可）で入力してください。');
 return name;
};
const knownLegacyPresets:Readonly<Record<string,string>>={
 balanced:'バランス',valorant:'VALORANT',racing:'競馬',casino:'カジノ',
 market:'株式',risk:'危険なビルド',
};
const existingPreset=(c:RelicCollection,name:string)=>{
 const presets=c.presets??{};
 if(!Object.hasOwn(presets,name))throw Error('指定したプリセットは保存されていません。');
 return presets;
};
const validateLoadout=(c:RelicCollection,ids:readonly string[])=>{
 if(!Array.isArray(ids)||ids.length>RELIC_SLOTS||ids.some(id=>typeof id!=='string'||(id&&!Object.hasOwn(c.items,id))))throw Error('未所持の遺物が含まれています。');
 if(ids.filter(id=>id&&c.items[id]?.origin==='unite').length>1)throw Error('ユナイト遺物は同時に1個までです。');
 if(new Set(ids.filter(Boolean)).size!==ids.filter(Boolean).length)throw Error('遺物の重複装備はできません。');
};
export function listRelicPresets(collection:RelicCollection|undefined){
 return Object.entries(collection?.presets??{}).filter(([,ids])=>Array.isArray(ids)).map(([id,ids])=>({
  id,name:knownLegacyPresets[id]??id,equipped:ids.filter(Boolean).length,
 }));
}
export function saveRelicPreset(state:{relics?:RelicCollection},rawName:string){
 const name=cleanPresetName(rawName),c=relicCollection(state);
 const presets=c.presets??{};
 if(!Object.hasOwn(presets,name)&&Object.keys(presets).length>=RELIC_PRESET_LIMIT)throw Error('プリセットは20個まで保存できます。');
 const ids=[...c.equipped.slice(0,RELIC_SLOTS)];
 validateLoadout(c,ids);
 c.presets={...presets,[name]:ids};
 return {name,equipped:ids,updated:Object.hasOwn(presets,name)};
}
export function loadRelicPreset(state:{relics?:RelicCollection},rawName:string){
 const name=cleanPresetName(rawName),c=relicCollection(state);
 const ids=existingPreset(c,name)[name]!;
 validateLoadout(c,ids);
 c.equipped=[...ids];
 return {name,equipped:c.equipped,power:c.equipped.reduce((sum,id)=>sum+(c.items[id]?.power??0),0)};
}
export function removeRelicPreset(state:{relics?:RelicCollection},rawName:string){
 const name=cleanPresetName(rawName),c=relicCollection(state);
 existingPreset(c,name);
 const next={...c.presets};delete next[name];c.presets=next;
 return {name,deleted:true};
}
export function renameRelicPreset(state:{relics?:RelicCollection},oldRaw:string,newRaw:string){
 const oldName=cleanPresetName(oldRaw),newName=cleanPresetName(newRaw),c=relicCollection(state);
 existingPreset(c,oldName);
 if(oldName===newName)return {name:newName,renamed:false};
 if(Object.hasOwn(c.presets??{},newName))throw Error('同名のプリセットが存在します。別の名前を選んでください。');
 const next={...c.presets,[newName]:[...c.presets![oldName]!]};delete next[oldName];
 c.presets=next;
 return {name:newName,previous:oldName,renamed:true};
}
/** A compact, reproducible model; no random events or D1 lookups involved. */
export function diagnoseRelicBuild(collection:RelicCollection|undefined){
 const modes=['competitive','unrated','swiftplay','spikerush','racing','casino','market','mleague','quiz','voice'];
 const scores=modes.map(mode=>{
  const trials=[100,500,900,5000].flatMap(amount=>[true,false].map(win=>evaluateRelicBonus(collection,mode,{amount,win}).effectivePercent));
  const average=trials.reduce((a,b)=>a+b,0)/trials.length;
  return {mode,average:Math.round(average*10)/10,max:Math.max(...trials),min:Math.min(...trials)};
 });
 const sorted=[...scores].sort((a,b)=>b.average-a.average);
 const average=scores.reduce((a,b)=>a+b.average,0)/scores.length;
 const volatility=sorted[0]!.max-sorted[0]!.min;
 const style=volatility>150?'一撃必殺型':volatility>45?'ハイリスク型':average>45?'万能強化型':'安定型';
 return {style,average:Math.round(average*10)/10,volatility:Math.round(volatility*10)/10,best:sorted.slice(0,4),worst:sorted.slice(-2),sample:'各モードで100/500/900/5000KP、勝敗それぞれを試算'};
}
