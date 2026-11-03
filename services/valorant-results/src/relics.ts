/** KESO relics: a server-owned collection. No bonuses alter other games' KP economy. */
import {NORMAL_RELIC_BY_ID,NORMAL_RELIC_BY_RARITY,RELIC_RARITIES,RELIC_CATALOG_COUNT} from './relic-catalog.ts';
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
}
export interface RelicCollection {
  totalSummons: number;
  items: Record<string, RelicItem>;
  equipped: string[];
  dailyNativeBonus?: {day:string;amount:number};
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
 * Lv10 intentionally has ZERO common artifacts, but transcendents remain a very rare direct draw.
 */
const START_RATES = [520092,280000,130000,50000,17500,2400,8] as const;
const END_RATES = [0,40000,300000,400000,210000,49970,30] as const;
export function rarityRatesForLevel(level:number):Readonly<Record<NormalRelicRarity,number>> {
  if (!Number.isInteger(level)||level<1||level>10) throw Error('召喚レベルが不正です。');
  const rates=RELIC_RARITIES.map((_,i)=>START_RATES[i]!+Math.round((END_RATES[i]!-START_RATES[i]!)*(level-1)/9));
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
  const boosted=item.origin==='normal'?Math.min(5,Math.floor(Math.log2(Math.max(1,item.count)))):0;
  const mutation=item.mutation;
  const mutationBonus=mutation?(mutation.kind==='prism'||(mutation.kind==='risk'&&amount%2===0)||(mutation.kind==='comeback'&&!event.win)?mutation.percent:0):0;
  const percent=basePercent+boosted+mutationBonus+(item.foil?.percent??0);
  const active=compatibleRelic(sourceMode,mode);
  const triggered=active&&percent>0&&relicTrigger(skill,amount,event.win,bounds);
  const base=triggered?safeReward(amount*percent/100):0;
  const trait=def?.trait??(item.rarity==='ancient'?'刻印連鎖':item.rarity==='transcendent'?'運命突破':item.origin==='steam'||item.origin==='unite'?'出自の加護':'');
  const exotic=trait.startsWith('運命突破')&&active&&!triggered
   ?Math.max(1,Math.floor(item.power/70)):0;
  lines.push({id,name:def?.name??item.name,mode:sourceMode,
   short:def?.short??item.ability,percent:basePercent,effectivePercent:percent,
   cap,active,triggered,base,exotic,trait,
   reason:!active?'対象ゲーム外':triggered?'条件達成':exotic?'運命突破が発動':'条件未達'});
 }
 const activated=lines.filter(l=>l.triggered);
 for(const line of lines){
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
 const openingEligible=opening?lines.filter(l=>l.active):[];
 if(opening)for(const line of openingEligible){
  line.base=safeReward(line.base*opening.multiplier);
  line.exotic=safeReward(line.exotic+opening.flatPerRelic);
  line.reason+='／⚡先陣の加護：固定＋'+opening.flatPerRelic+'KP・本来の倍率分×'+opening.multiplier;
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
export function nativeRelicBonus(
 state:{cash:number;relics?:RelicCollection},
 mode:'casino'|'market'|'racing'|'mleague',
 amount:number,
 now=Date.now(),
):number {
 if(!state.relics||!Number.isSafeInteger(amount)||amount<=0)return 0;
 const detail=evaluateRelicBonus(state.relics,mode,{amount,win:true});
 const payout=Math.min(detail.bonus,Math.max(0,Number.MAX_SAFE_INTEGER-1-state.cash));
 if(!payout)return 0;
 state.cash+=payout;
 state.relics.lastNativeEffect={mode,amount,bonus:payout,percent:Math.round(payout/amount*10000)/100,at:now,names:detail.skills.slice(0,4),lines:detail.lines,sets:detail.sets};
 state.relics.nativeEarned=Math.min(Number.MAX_SAFE_INTEGER, (state.relics.nativeEarned??0)+payout);
 state.relics.nativeCount=(state.relics.nativeCount??0)+1;
 const record:RelicEffectRecord={id:'native:'+now+':'+(state.relics.nativeCount??0),mode,amount,bonus:payout,at:now,origin:'native',lines:detail.lines,sets:detail.sets,resonance:detail.resonance};
 state.relics.nativeEffects=[record,...(state.relics.nativeEffects??[])].slice(0,30);
 return payout;
}
/** Caller MUST confirm a new, immutable server-verified receipt before invoking.
 * This is not a public API; browsers can never request a bonus for arbitrary evidence.
 */
export async function creditVerifiedRelicBonus(
 env:{DB:D1Database},guild:string,user:string,receipt:string,mode:string,amount:number,win:boolean,at=Date.now(),
):Promise<number> {
 if(!Number.isSafeInteger(amount)||amount<=0||!receipt||receipt.length>350)return 0;
 const row=await env.DB.prepare('SELECT data FROM kp_state WHERE guild=? AND user=?')
  .bind(guild,user).first<{data:string}>();
 if(!row)return 0;
 const state=JSON.parse(row.data) as {relics?:RelicCollection};
 if(!state.relics?.equipped?.length)return 0;
 let spikeGamesBefore:number|undefined;
 if(mode==='spikerush'){
  // Proven receipt + immutable snapshot from the already-settled Riot match.
  // Never take the game number from browser input or a mutable profile.
  const spike=await env.DB.prepare(`SELECT json_extract(detail,'$.gamesBefore') AS gamesBefore
   FROM spike_rewards WHERE id=? AND guild=? AND user=?
   UNION ALL SELECT json_extract(detail,'$.gamesBefore') AS gamesBefore
   FROM spike_overdrive_rewards WHERE id=? AND guild=? AND user=?`)
   .bind(receipt,guild,user,receipt,guild,user).first<{gamesBefore:number}>();
  if(!spike||!Number.isSafeInteger(spike.gamesBefore)||spike.gamesBefore<0)return 0;
  spikeGamesBefore=spike.gamesBefore;
 }
 const detail=evaluateRelicBonus(state.relics,mode,{amount,win,spikeGamesBefore});
 const bonus=detail.bonus;
 if(!bonus)return 0;
 const id='relic:'+receipt;
 const saved=await env.DB.prepare('INSERT OR IGNORE INTO kp_ledger(id,guild,user,delta,kind,at) VALUES(?,?,?,?,?,?)')
  .bind(id,guild,user,bonus,'relic',at).run();
 // Log only real credited receipts; write is independently idempotent on retries.
 try{
  await env.DB.prepare(
   'INSERT OR IGNORE INTO relic_effect_logs(id,guild,user,mode,base,bonus,details,at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM kp_ledger WHERE id=? AND guild=? AND user=?)'
  ).bind(id,guild,user,mode,amount,bonus,JSON.stringify({lines:detail.lines,sets:detail.sets,resonance:detail.resonance,curseReversed:detail.curseReversed,spikeOpening:detail.spikeOpening}),at,id,guild,user).run();
 }catch{console.warn('relic_effect_log_pending');}
 return saved.meta.changes?bonus:0;
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
    // 1/4096 duplicate evolution, once per relic ID; 1/40000 cosmetic foil,
    // also once per relic ID. Different source/Steam history is untouched.
    if(duplicate&&!item.mutation&&variants[n*2]!%4096===0){
     const kinds=['prism','risk','comeback'] as const;
     const kind=kinds[variants[n*2+1]!%kinds.length]!;
     item.mutation={kind,percent:kind==='risk'?24:kind==='comeback'?17:12,at:Date.now()};
     mutations.push(name);c.mutatedCount=(c.mutatedCount??0)+1;
    }
    if(!item.foil&&variants[n*2+1]!%40000===0){
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
 const archetype=steamRelicArchetype(proof.app,proof.achievement);
 const item:RelicItem={
  id,name:tier.label+'の'+archetype.name+'：'+proof.title.slice(0,55),
  origin:'steam',rarity:'exclusive',power:tier.power,
  ability:tier.label+'／'+archetype.ability+'：報酬＋'+tier.percent+'%。追加KPはほかの遺物と上限なしで合算。',
  mode:archetype.mode,skill:archetype.skill,percent:tier.percent,cap:tier.cap,
  count:1,source:'steam app '+proof.app+' / '+proof.achievement.slice(0,90),
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
