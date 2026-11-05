import type {NormalRelicDefinition} from './relic-catalog.ts';
/**
 * 竜騎士（ドラグーン）セット（2026-11-05）。4点そろえて装備すると「竜騎士の加護」（攻守両方に強い安定型・4枠占有）：
 * - 勝ったときの遺物ボーナスが 1.25倍。
 * - 遺物による追加の損（ハラハラ枠の最下位・ラス、賭け系の負けの反動）が半分。
 * 1点ずつでも全モードで効く強い神話遺物。通常召喚の神話枠に追加する（既存の遺物・IDは変えない）。
 */
export const DRAGOON_RELICS:ReadonlyArray<NormalRelicDefinition>=[
 {id:'normal.set.dragoon_helm',name:'竜騎士の兜',mode:'universal',rarity:'mythic',power:220,skill:'spark',percent:70,cap:0,
  short:'報酬獲得時：＋70%（竜騎士セット）',trait:'竜騎士セット1/4',
  ability:'全ゲームの報酬＋70%。兜・鎧・槍・翼竜の紋章の4点で「竜騎士の加護」：勝ちの遺物ボーナス1.25倍・遺物による追加の損を半減。'},
 {id:'normal.set.dragoon_mail',name:'竜騎士の鎧',mode:'universal',rarity:'mythic',power:220,skill:'spark',percent:70,cap:0,
  short:'報酬獲得時：＋70%（竜騎士セット）',trait:'竜騎士セット2/4',
  ability:'全ゲームの報酬＋70%。兜・鎧・槍・翼竜の紋章の4点で「竜騎士の加護」：勝ちの遺物ボーナス1.25倍・遺物による追加の損を半減。'},
 {id:'normal.set.dragoon_lance',name:'竜騎士の槍',mode:'universal',rarity:'mythic',power:220,skill:'victory_high',percent:120,cap:0,
  short:'勝利＆400KP以上：＋120%（竜騎士セット）',trait:'竜騎士セット3/4',
  ability:'勝利かつ報酬400KP以上で＋120%。兜・鎧・槍・翼竜の紋章の4点で「竜騎士の加護」：勝ちの遺物ボーナス1.25倍・遺物による追加の損を半減。'},
 {id:'normal.set.dragoon_crest',name:'翼竜の紋章',mode:'universal',rarity:'mythic',power:220,skill:'lucky7',percent:200,cap:0,
  short:'報酬末尾7：＋200%（竜騎士セット）',trait:'竜騎士セット4/4',
  ability:'報酬の末尾が7なら＋200%。兜・鎧・槍・翼竜の紋章の4点で「竜騎士の加護」：勝ちの遺物ボーナス1.25倍・遺物による追加の損を半減。'},
];
export const DRAGOON_SET_IDS=DRAGOON_RELICS.map(x=>x.id);
export const DRAGOON_SET_NAME='竜騎士の加護（ドラグーン4点）';
/** True when all four pieces are equipped (normal origin, at least one owned). */
export function dragoonSetComplete(c?:{equipped:string[];items:Record<string,{origin?:string;count?:number}|undefined>}):boolean{
 if(!c?.equipped)return false;
 return DRAGOON_SET_IDS.every(id=>c.equipped.includes(id)&&c.items[id]?.origin==='normal'&&Number(c.items[id]?.count)>=1);
}
