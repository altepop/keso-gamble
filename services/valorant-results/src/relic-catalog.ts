/** Every ordinary relic has its own name and a mode-specific autonomous skill.
 * A game mode is NEVER a required source for another item's upgrade or unlock.
 */
export const RELIC_MODE_NAMES = {
  "competitive": "コンペ",
  "unrated": "アンレ",
  "swiftplay": "スイフト",
  "spikerush": "スパイクラッシュ",
  "teamdeathmatch": "チームデスマッチ",
  "escalation": "エスカレーション",
  "deathmatch": "デスマッチ",
  "skirmish": "スカーミッシュ",
  "racing": "競馬",
  "casino": "カジノ",
  "market": "株式市場",
  "mleague": "Mリーグ",
  "quiz": "VCT QUIZ",
  "voice": "Discord通話",
  "universal": "全ゲーム共通",
  "finance": "経済横断",
  "marketplus": "株式・裏戦略",
  "racingplus": "競馬・裏戦略",
  "casinoplus": "カジノ・裏戦略",
  "fortune": "特殊条件"
} as const;
export type RelicMode = keyof typeof RELIC_MODE_NAMES;
export const RELIC_RARITIES = ['common','uncommon','rare','legendary','mythic','ancient','transcendent'] as const;
export type NormalRelicRarity = typeof RELIC_RARITIES[number];
export interface NormalRelicDefinition {
  id:string; name:string; mode:RelicMode; rarity:NormalRelicRarity;
  power:number; skill:string; ability:string; percent:number; cap:number;
}
const names:ReadonlyArray<readonly [RelicMode,readonly string[]]> = [
  [
    "competitive",
    [
      "鉄のランクバッジ",
      "逆境の戦術手帳",
      "勝者の照準",
      "昇格の刃",
      "頂点の星図",
      "天命の階級章",
      "不敗の王座"
    ]
  ],
  [
    "unrated",
    [
      "野良の羅針盤",
      "異端の弾倉",
      "気まぐれな硬貨",
      "夜会の拳銃",
      "予測不能の祭壇",
      "賭場の天球儀",
      "無法の運命盤"
    ]
  ],
  [
    "swiftplay",
    [
      "早駆けの靴",
      "五番目の薬莢",
      "速攻の狼煙",
      "開幕の指揮棒",
      "短期決戦の剣",
      "五点先取の光輪",
      "刹那を支配する時計"
    ]
  ],
  [
    "spikerush",
    [
      "即席の起爆符",
      "跳ねる爆弾",
      "爆音の羽根",
      "四拍子の装薬",
      "奪取の紋章",
      "閃光の起爆装置",
      "終幕のスパイク"
    ]
  ],
  [
    "teamdeathmatch",
    [
      "連射の火打石",
      "弾薬箱の鍵",
      "百発の指輪",
      "連鎖の牙",
      "制圧の機関銃",
      "乱戦の赤冠",
      "戦場を埋める流星"
    ]
  ],
  [
    "escalation",
    [
      "装備替えの札",
      "梯子の歯車",
      "変転の鞘",
      "昇華の歯車",
      "武装継承の王印",
      "混沌の武器庫",
      "最後の装備、最初の神"
    ]
  ],
  [
    "deathmatch",
    [
      "最初の弾痕",
      "首位の勲章",
      "疾風の照準器",
      "独走の長靴",
      "首狩りの星",
      "戦果の天秤",
      "独走者の玉座"
    ]
  ],
  [
    "skirmish",
    [
      "二人の握手",
      "連携の小旗",
      "譲れない旗",
      "続行の銀貨",
      "五連勝の紋章",
      "相棒の誓約",
      "二対二の戴冠"
    ]
  ],
  [
    "racing",
    [
      "蹄鉄の欠片",
      "追い込みの鐙",
      "勝負服の糸",
      "三連単の地図",
      "馬群を裂く風",
      "王冠の鞍",
      "万馬券の予言書"
    ]
  ],
  [
    "casino",
    [
      "空のチップ",
      "片目のサイコロ",
      "負け知らずの札",
      "境界のマーク",
      "最後の賭札",
      "ディーラーの手袋",
      "確率を嗤う悪魔"
    ]
  ],
  [
    "market",
    [
      "端株の証書",
      "買い板のレンズ",
      "下落の盾",
      "相場師の鉛筆",
      "逆張りの宝珠",
      "終値の王権",
      "市場を喰う大蛇"
    ]
  ],
  [
    "mleague",
    [
      "卓上の点棒",
      "河読みの眼鏡",
      "安全牌の札",
      "放銃回避の羅針盤",
      "親番の王冠",
      "裏ドラの神籤",
      "天和を夢見る卓"
    ]
  ],
  [
    "quiz",
    [
      "削れた鉛筆",
      "早押しの鈴",
      "出題者の手稿",
      "解答者の砂時計",
      "知識の書庫",
      "全問正解の冠",
      "問いを支配する賢者"
    ]
  ],
  [
    "voice",
    [
      "古い受話器",
      "通話の火種",
      "輪の中心の鈴",
      "雑談の羽根",
      "夜更けの鐘",
      "不滅の通話石",
      "千夜を繋ぐ声"
    ]
  ],
  ["universal",["どこでも効く銅貨","小さき者の王笏","全局面の方位磁針","遍在の銀時計","四面の宝珠","万象連結の理","世界に干渉する鍵"]],
  ["finance",["帳簿の栞","両建ての羽根","四市場の鋼心","損益の盲点","黒字への階段","経済循環の瞳","黄金経済圏の心臓"]],
  ["marketplus",["端数を拾う猫","急落待ちの蜘蛛","逆張りの鉄則","株価の七番目","薄利千金の短剣","市場閉鎖の前夜","価格の外側に立つ者"]],
  ["racingplus",["複勝拾いの蹄鉄","人気薄の笛","払戻しの仕掛け","七番人気の魔符","馬券師の罠","万馬券への片道切符","砂塵の勝利法則"]],
  ["casinoplus",["一枚のチップ","傷んだジョーカー","偶数の銀盃","七の目の契約","低配当の怪物","大勝の先読み","悪魔の取り分"]],
  ["fortune",["七秒の砂時計","細い勝ち筋","敗者の宝石","端数の魔導書","薄氷の勝利札","奇数の支配者","確率の裏口"]]
];
const power=[10,24,55,110,180,260,350];
/** Each tier is a different standalone passive, not a generic +KP% stat.
 * The match bonus engine uses these precise conditions, capped across all equipped relics.
 */
const skills=[
  {key:'spark', label:'小さな追い風', percent:1,cap:5,condition:'報酬が正のとき'},
  {key:'rescue',label:'窮地の報せ',percent:4,cap:14,condition:'報酬が200KP以下のとき'},
  {key:'advance',label:'攻勢の鐘',percent:4,cap:22,condition:'報酬が200KP以上のとき'},
  {key:'highroll',label:'大勝の刻印',percent:6,cap:32,condition:'報酬が400KP以上のとき'},
  {key:'surge',label:'爆発する運命',percent:7,cap:42,condition:'報酬が200KP以上のとき'},
  {key:'master',label:'熟達の証明',percent:9,cap:55,condition:'勝利したとき'},
  {key:'sovereign',label:'覇者の領域',percent:15,cap:80,condition:'勝利したとき'},
] as const;
/** Deliberately preserve the first three original item ids at each rarity.
 * Old users keep their investments and get the matching, newly designed skill.
 */
export const LEGACY_RELIC_SLUGS:readonly (readonly string[])[]=[
  ['copper','stone','clockhand'],['flame','glass','feather'],['mirror','scale','blade'],
  ['crown','hourglass','comet'],['void','fortune','archive'],['abyss','origin','eternity'],
  ['rainbow','end','zero'],
];
export const NORMAL_RELICS:ReadonlyArray<NormalRelicDefinition> = names.flatMap(([mode,items],modeIndex)=>
  items.map((name,rarityIndex)=>{
    const rarity=RELIC_RARITIES[rarityIndex]!;
    const rule=skills[rarityIndex]!;
    const legacy=modeIndex<3?LEGACY_RELIC_SLUGS[rarityIndex]![modeIndex]:undefined;
    const id='normal.'+(legacy??mode+'.'+rarity);
    const base:Record<string,readonly [number,number]>={
      competitive:[200,400],unrated:[200,400],swiftplay:[70,180],spikerush:[40,100],
      teamdeathmatch:[50,100],escalation:[50,150],deathmatch:[50,500],skirmish:[50,250],
      racing:[100,500],casino:[100,500],market:[50,200],mleague:[100,500],
      quiz:[30,100],voice:[10,15],
      universal:[100,400],finance:[100,500],
      marketplus:[50,200],racingplus:[100,500],casinoplus:[100,500],
      fortune:[50,200],
    };
    const [low,high]=base[mode]!;
    const isNative=['racing','casino','market','mleague'].includes(mode);
    const source:Record<string,string>={
      racing:'馬券購入・確定配当',casino:'カジノでのプラス精算',market:'株の買付',mleague:'予想購入・確定配当',
      quiz:'クイズ完走',voice:'通話20分ごとの確定枠',skirmish:'スカーミッシュのKP受取',
    };
    const conditions:Record<string,string>={
      spark:'対象額が1KP以上',rescue:`対象額が${low}KP以下`,advance:`対象額が${low}KP以上`,
      highroll:`対象額が${high}KP以上`,surge:`対象額が${low}KP以上`,
      master:isNative?'対象の精算が確定':'対象の勝利・達成が確定',
      sovereign:isNative?'対象の精算が確定':'対象の勝利・達成が確定',
    };
    const ceiling=isNative?'（取引系共通：対象額1%・合計1日120KP以内）':'（対象額15%・1件合計80KP以内）';
    // Situational specialists deliberately break the simple "higher rarity wins" hierarchy.
    // Rare or uncommon items can match a transcendental's effectiveness under narrow conditions.
    const special:Record<string,{skills:readonly string[];boost:readonly number[];caps:readonly number[]}>={
      universal:{skills:['spark','rescue','advance','lucky7','surge','master','sovereign'],
        boost:[2,8,8,10,7,9,12],caps:[8,32,44,64,42,55,70]},
      finance:{skills:['spark','rescue','advance','lucky7','surge','master','sovereign'],
        boost:[4,9,11,16,7,9,15],caps:[10,30,54,80,42,55,80]},
      marketplus:{skills:['spark','rescue','advance','lucky7','highroll','master','sovereign'],
        boost:[3,14,17,20,8,10,15],caps:[8,60,70,80,50,55,80]},
      racingplus:{skills:['spark','rescue','advance','lucky7','highroll','master','sovereign'],
        boost:[3,14,17,20,8,10,15],caps:[8,60,70,80,50,55,80]},
      casinoplus:{skills:['spark','rescue','advance','lucky7','highroll','master','sovereign'],
        boost:[3,14,17,20,8,10,15],caps:[8,60,70,80,50,55,80]},
      fortune:{skills:['lucky7','rescue','lucky7','odd','advance','master','sovereign'],
        boost:[5,11,16,17,12,9,15],caps:[14,38,80,75,62,55,80]},
    };
    const specialDef=special[mode],chosenSkill=specialDef?.skills[rarityIndex]??rule.key;
    const chosenPercent=specialDef?.boost[rarityIndex]??rule.percent;
    const chosenCap=specialDef?.caps[rarityIndex]??rule.cap;
    const unusual=chosenSkill==='lucky7'?'対象額の一の位が7なら':chosenSkill==='odd'?'対象額が奇数なら':null;
    const compatible=['marketplus','racingplus','casinoplus','finance'].includes(mode);
    const explanation=unusual??conditions[chosenSkill]??conditions[rule.key];
    const extraCeiling=compatible?'（取引系共通：対象額1%・合計1日120KP以内）':ceiling;
    return {
      id,name,mode,rarity,power:power[rarityIndex]!,skill:chosenSkill,percent:chosenPercent,
      cap:chosenCap,ability:`${RELIC_MODE_NAMES[mode]}特化「${name}」：${explanation}に発動。追加KP最大${chosenPercent}%・単独上限${chosenCap}KP${extraCeiling}。`,
    };
    /*
    return {
      id,name,mode,rarity,power:power[rarityIndex]!,skill:rule.key,percent:rule.percent,
*/
  }),
);
export const NORMAL_RELIC_BY_ID = new Map(NORMAL_RELICS.map(x=>[x.id,x]));
export const NORMAL_RELIC_BY_RARITY:ReadonlyMap<NormalRelicRarity,ReadonlyArray<NormalRelicDefinition>>=
  new Map(RELIC_RARITIES.map(r=>[r,NORMAL_RELICS.filter(item=>item.rarity===r)]));
export const RELIC_CATALOG_COUNT = NORMAL_RELICS.length;
