import type {NormalRelicDefinition} from './relic-catalog.ts';
/**
 * 深淵の遺物（攻撃型・超ハイリスク、2026-11-05）。装備中は勝ちの遺物ボーナスを増幅し、遺物による追加の損も増幅する。
 * 深淵の契約書：勝ち×1.3・損×1.75。奈落の王冠：勝ち×1.5・損×2（両方なら王冠が優先）。
 */
export const ABYSS_RELICS:ReadonlyArray<NormalRelicDefinition>=[
 {id:'normal.abyss.contract',name:'深淵の契約書',mode:'universal',rarity:'ancient',power:300,skill:'spark',percent:250,cap:0,
  tradeoff:'abyss',drawback:'遺物による追加の損が1.75倍（ハラハラ枠の最下位・ラス、賭けの負け）',
  short:'報酬獲得時：＋250%（深淵）',trait:'深淵の代償',
  ability:'全ゲームの報酬＋250%。装備中は勝ちの遺物ボーナスが1.3倍、遺物による追加の損が1.75倍。'},
 {id:'normal.abyss.crown',name:'奈落の王冠',mode:'universal',rarity:'transcendent',power:470,skill:'victory_high',percent:600,cap:0,
  tradeoff:'abyss',drawback:'遺物による追加の損が2倍（ハラハラ枠の最下位・ラス、賭けの負け）',
  short:'勝利＆400KP以上：＋600%（深淵）',trait:'奈落の代償',
  ability:'勝利かつ報酬400KP以上で＋600%。装備中は勝ちの遺物ボーナスが1.5倍、遺物による追加の損が2倍。'},
];
export const ABYSS_IDS=new Set(ABYSS_RELICS.map(x=>x.id));
export function abyssEquipped(c?:{equipped:string[];items:Record<string,{origin?:string;count?:number}|undefined>}):boolean{
 return Boolean(c?.equipped?.some(id=>ABYSS_IDS.has(id)&&c.items[id]?.origin==='normal'&&Number(c.items[id]?.count)>=1));
}
