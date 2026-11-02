/** KESO relics: a server-owned collection. No bonuses alter other games' KP economy. */
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
const NORMAL: Array<readonly [RelicRarity, number, readonly [string, string, string][]]> = [
  ['common', 10, [['copper','くすんだ銅貨','蓄積'],['stone','名もなき石','忍耐'],['clockhand','折れた針','時間']]],
  ['uncommon', 24, [['flame','消えない火種','持続'],['glass','青の小瓶','集中'],['feather','旅人の羽根','機動']]],
  ['rare', 55, [['mirror','揺らぎの鏡','反射'],['scale','均衡の天秤','調整'],['blade','夜明けの刃','一撃']]],
  ['legendary', 110, [['crown','放浪王の冠','威厳'],['hourglass','逆さの砂時計','巻き戻し'],['comet','彗星の欠片','加速']]],
  ['mythic', 180, [['void','虚空の瞳','洞察'],['fortune','六面の神託','運命'],['archive','記憶の書','継承']]],
  ['ancient', 260, [['abyss','深淵の心臓','不滅'],['origin','原初の核','創生'],['eternity','永久機関','循環']]],
  ['transcendent', 350, [['rainbow','万象を超える賽','超越'],['end','終端の王冠','超越'],['zero','零番目の時計','超越']]],
];
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
  return state.relics;
}
export const summonLevel = (total: number) => Math.min(10, 1 + Math.floor(total / 500));
export function rarityForRoll(roll: number, level: number): RelicRarity {
  if (!Number.isInteger(roll) || roll < 0 || roll >= 1_000_000) throw Error('Invalid relic roll');
  // Transcendent starts at 0.001%, reaches 0.01% at level 10, never guaranteed.
  let boundary = Math.max(1, Math.min(10, level)) * 10;
  if (roll < boundary) return 'transcendent';
  for (const [rarity, chance] of [
    ['ancient', 2400], ['mythic', 17500], ['legendary', 50000],
    ['rare', 130000], ['uncommon', 280000],
  ] as const) {
    boundary += chance;
    if (roll < boundary) return rarity;
  }
  return 'common';
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
    const [tier, power, templates] = NORMAL.find(t => t[0] === rarity)!;
    const [slug, name, ability] = templates[entropy[n * 2 + 1]! % templates.length]!;
    const id = 'normal.' + slug;
    store(c, {id, name, origin:'normal', rarity:tier, power, ability, count:1});
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
  if (!required || !Number.isSafeInteger(wins) || wins < required) throw Error('ユナイトの達成記録を確認できません。');
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
  if (id !== '' && !c.items[id]) throw Error('所持していない遺物です。');
  const next = [...c.equipped];
  for (let n=0;n<RELIC_SLOTS;n++) if (next[n]===id && n!==slot) next[n]='';
  next[slot]=id;
  c.equipped=next;
  return {equipped:next,power:next.reduce((n,key)=>n+(c.items[key]?.power??0),0)};
}
