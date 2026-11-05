import type {NormalRelicDefinition} from './relic-catalog.ts';
/**
 * 深淵の遺物（ハイリスク・2026-11-05）。装備していると、試合などの遺物ボーナス（確率発動）が
 * 「当たりやすいが、外れの半分が反動・反動は元の報酬と同額」になる。竜騎士の加護も打ち消す。
 * 平均は元の報酬の +50% のまま（発動率が上がる分、反動が重い）。
 */
export const ABYSS_RELICS:ReadonlyArray<NormalRelicDefinition>=[
 {id:'normal.abyss.contract',name:'深淵の契約書',mode:'universal',rarity:'ancient',power:300,skill:'spark',percent:250,cap:0,
  tradeoff:'abyss',drawback:'遺物ボーナスの外れの半分が反動。反動は元の報酬と同額。竜騎士の加護も無効',
  short:'報酬獲得時：＋250%（深淵）',trait:'深淵の代償',
  ability:'全ゲームの報酬＋250%。装備中は遺物ボーナスが当たりやすくなる代わり、外れの半分で元の報酬と同額を失う。竜騎士の加護を打ち消す。'},
 {id:'normal.abyss.crown',name:'奈落の王冠',mode:'universal',rarity:'transcendent',power:470,skill:'victory_high',percent:600,cap:0,
  tradeoff:'abyss',drawback:'遺物ボーナスの外れの半分が反動。反動は元の報酬と同額。竜騎士の加護も無効',
  short:'勝利＆400KP以上：＋600%（深淵）',trait:'奈落の代償',
  ability:'勝利かつ報酬400KP以上で＋600%。装備中は遺物ボーナスが当たりやすくなる代わり、外れの半分で元の報酬と同額を失う。竜騎士の加護を打ち消す。'},
];
export const ABYSS_IDS=new Set(ABYSS_RELICS.map(x=>x.id));
export function abyssEquipped(c?:{equipped:string[];items:Record<string,{origin?:string;count?:number}|undefined>}):boolean{
 return Boolean(c?.equipped?.some(id=>ABYSS_IDS.has(id)&&c.items[id]?.origin==='normal'&&Number(c.items[id]?.count)>=1));
}
