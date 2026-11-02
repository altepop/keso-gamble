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
  count: number;
  // External evidence is bound to existing certified receipts, not a browser claim.
  source?: string;
}
export interface RelicCollection {
  totalSummons: number;
  items: Record<string, RelicItem>;
  equipped: string[];
}
export const RELIC_SLOTS = 4;
const UNITE = {
  'unite.first_win': {name:'テイアの守護核', power:390, ability:'単独効果・守護の極致'},
  'unite.three_wins': {name:'伝説を奪う手', power:480, ability:'単独効果・逆転の支配'},
  'unite.five_wins': {name:'レックウザの逆鱗', power:620, ability:'単独効果・戦局を覆す威圧'},
} as const;
export type UniteRelicId = keyof typeof UNITE;
export const UNITE_REQUIREMENTS: Readonly<Record<UniteRelicId, number>> = {
  'unite.first_win': 1, 'unite.three_wins': 3, 'unite.five_wins': 5,
};
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
export const summonLevel = (total: number) => Math.min(10, 1 + Math.floor(total / 200));
/** Exact ticket odds (one million possible outcomes), interpolated at each level.
 * Lv10 intentionally has ZERO common artifacts, but transcendents remain a very rare direct draw.
 */
const START_RATES = [520090,280000,130000,50000,17500,2400,10] as const;
const END_RATES = [0,40000,300000,400000,210000,49900,100] as const;
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
/** A skill activates only for the corresponding verified game mode.
 * Bonuses are independent, bounded, and never grant another game's relic or advantage.
 * This function does NOT decide whether evidence is real; callers use certified results.
 */
export function modeRelicBonus(
 collection:RelicCollection|undefined,
 mode:string,
 event:{amount:number;win:boolean},
):{bonus:number;skills:string[]} {
 if(!collection||!Number.isSafeInteger(event.amount)||event.amount<=0)return{bonus:0,skills:[]};
 const thresholds:Record<string,readonly [number,number]>={
  competitive:[200,400],unrated:[200,400],swiftplay:[70,180],spikerush:[40,100],
  teamdeathmatch:[50,100],escalation:[50,150],deathmatch:[50,500],skirmish:[50,250],
  racing:[100,500],casino:[100,500],market:[50,200],mleague:[100,500],
  quiz:[30,100],voice:[10,15],
 };
 const bounds=thresholds[mode];if(!bounds)return{bonus:0,skills:[]};
 let total=0;const activated:string[]=[];
 for(const id of collection.equipped){
  const def=NORMAL_RELIC_BY_ID.get(id);
  if(!def||def.mode!==mode||!collection.items[id])continue;
  const skill=def.skill;
  const eligible=skill==='spark'
   ||(skill==='rescue'&&event.amount<=bounds[0])
   ||(skill==='advance'&&event.amount>=bounds[0])
   ||(skill==='highroll'&&event.amount>=bounds[1])
   ||(skill==='surge'&&event.amount>=bounds[0])
   ||((skill==='master'||skill==='sovereign')&&event.win);
  if(!eligible)continue;
  const contribution=Math.min(def.cap,Math.max(1,Math.floor(event.amount*def.percent/100)));
  total+=contribution;
  activated.push(def.name);
 }
 return{bonus:Math.min(total,80,Math.floor(event.amount*0.15)),skills:activated};
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
) {
  if (!RELIC_SUMMON_SIZES.includes(count as (typeof RELIC_SUMMON_SIZES)[number])) throw Error('召喚は1・10・100・1000連から選んでください。');
  const price = count * RELIC_SUMMON_COST;
  if (state.cash < price) throw Error('召喚に必要なKPが足りません。');
  const entropy = numbers ?? crypto.getRandomValues(new Uint32Array(count * 2));
  if (entropy.length !== count * 2) throw Error('Invalid random draw');
  const c = relicCollection(state), summary: Record<string, number> = {};
  const highlights: Array<{name:string;rarity:string;id:string}> = [];
  for (let n = 0; n < count; n++) {
    const rarity = rarityForRoll(entropy[n * 2]! % 1_000_000, summonLevel(c.totalSummons));
    const candidates=NORMAL_RELIC_BY_RARITY.get(rarity as NormalRelicRarity)!;
    const chosen=candidates[entropy[n * 2 + 1]!%candidates.length]!;
    const {id,name,mode,skill,ability,power}=chosen;
    store(c,{id,name,origin:'normal',rarity,mode,skill,power,ability,count:1});
    c.totalSummons += 1;
    summary[rarity] = (summary[rarity] ?? 0) + 1;
    if (rarity === 'transcendent' || rarity === 'ancient') highlights.push({id,name,rarity});
  }
  state.cash -= price;
  return {cost:price,count,level:summonLevel(c.totalSummons),summary,highlights:highlights.slice(0,30)};
}
export function grantSteamRelic(
  state: {relics?: RelicCollection},
  proof: {id:string;app:number;achievement:string;title:string;percent:number},
) {
  if (!Number.isFinite(proof.percent) || proof.percent > 10 || proof.percent < 0 ||
      !Number.isSafeInteger(proof.app) || proof.app <= 0 ||
      typeof proof.id !== 'string' || !proof.id.startsWith('steam:')) throw Error('Steamの希少実績を確認できません。');
  const c = relicCollection(state);
  const id = 'steam.' + proof.id;
  if (c.items[id]) throw Error('この実績遺物は受け取り済みです。');
  if (Object.keys(c.items).filter(k=>k.startsWith('steam.')).length >= 200) throw Error('Steam遺物の保有枠は200個までです。');
  const tier = proof.percent <= 0.01 ? 5 : proof.percent <= 0.1 ? 4 : proof.percent <= 1 ? 3 : proof.percent <= 5 ? 2 : 1;
  const power = [0, 75, 105, 150, 220, 320][tier]!;
  const item: RelicItem = {
    id, name:'実績の証：' + proof.title.slice(0,72),origin:'steam',rarity:'exclusive',
    power,ability:['','収集の証','熟練の証','偉業の証','神話の証','異界の偉業'][tier]!,
    count:1,source:'steam app ' + proof.app + ' / ' + proof.achievement.slice(0,90),
  };
  store(c,item);
  return {item};
}
export function grantUniteRelic(state:{relics?:RelicCollection}, id:UniteRelicId, wins:number) {
  const required = UNITE_REQUIREMENTS[id];
  if (!Object.hasOwn(UNITE_REQUIREMENTS,id) || !Number.isSafeInteger(wins) || wins < required) throw Error('ユナイトの達成記録を確認できません。');
  const c = relicCollection(state);
  if (c.items[id]) throw Error('このユナイト遺物は受け取り済みです。');
  const def = UNITE[id];
  const item:RelicItem = {id,name:def.name,origin:'unite',rarity:'exclusive',
    power:def.power,ability:def.ability,count:1,source:required+'連勝到達'};
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
