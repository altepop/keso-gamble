import type {NormalRelicDefinition} from './relic-catalog.ts';
/**
 * 竜騎士（ドラグーン）セット（2026-11-05）。4点そろえて装備すると「竜騎士の加護」：
 * - 試合などの遺物ボーナス（確率発動）に反動がなくなり、1回の上限が 10,000 → 30,000 KP に上がる。
 *   発動率は反動なしの式で決まるので、平均は元の報酬の +50% のまま（当たったときが大きく、外れても減らない）。
 * - 賭け系（カジノ・株・競馬・Mリーグ）の負けの反動が半分になる。
 * 1点ずつでも全モードで効く強い神話遺物。通常召喚の神話枠に追加する（既存の遺物・IDは変えない）。
 */
export const DRAGOON_RELICS:ReadonlyArray<NormalRelicDefinition>=[
 {id:'normal.set.dragoon_helm',name:'竜騎士の兜',mode:'universal',rarity:'mythic',power:220,skill:'spark',percent:70,cap:0,
  short:'報酬獲得時：＋70%（竜騎士セット）',trait:'竜騎士セット1/4',
  ability:'全ゲームの報酬＋70%。兜・鎧・槍・翼竜の紋章の4点で「竜騎士の加護」：反動なし・1回の上限30,000 KP・賭けの負けの反動半減。'},
 {id:'normal.set.dragoon_mail',name:'竜騎士の鎧',mode:'universal',rarity:'mythic',power:220,skill:'spark',percent:70,cap:0,
  short:'報酬獲得時：＋70%（竜騎士セット）',trait:'竜騎士セット2/4',
  ability:'全ゲームの報酬＋70%。兜・鎧・槍・翼竜の紋章の4点で「竜騎士の加護」：反動なし・1回の上限30,000 KP・賭けの負けの反動半減。'},
 {id:'normal.set.dragoon_lance',name:'竜騎士の槍',mode:'universal',rarity:'mythic',power:220,skill:'victory_high',percent:120,cap:0,
  short:'勝利＆400KP以上：＋120%（竜騎士セット）',trait:'竜騎士セット3/4',
  ability:'勝利かつ報酬400KP以上で＋120%。兜・鎧・槍・翼竜の紋章の4点で「竜騎士の加護」：反動なし・1回の上限30,000 KP・賭けの負けの反動半減。'},
 {id:'normal.set.dragoon_crest',name:'翼竜の紋章',mode:'universal',rarity:'mythic',power:220,skill:'lucky7',percent:200,cap:0,
  short:'報酬末尾7：＋200%（竜騎士セット）',trait:'竜騎士セット4/4',
  ability:'報酬の末尾が7なら＋200%。兜・鎧・槍・翼竜の紋章の4点で「竜騎士の加護」：反動なし・1回の上限30,000 KP・賭けの負けの反動半減。'},
];
export const DRAGOON_SET_IDS=DRAGOON_RELICS.map(x=>x.id);
export const DRAGOON_SET_NAME='竜騎士の加護（ドラグーン4点）';
/** True when all four pieces are equipped (normal origin, at least one owned). */
export function dragoonSetComplete(c?:{equipped:string[];items:Record<string,{origin?:string;count?:number}|undefined>}):boolean{
 if(!c?.equipped)return false;
 return DRAGOON_SET_IDS.every(id=>c.equipped.includes(id)&&c.items[id]?.origin==='normal'&&Number(c.items[id]?.count)>=1);
}
