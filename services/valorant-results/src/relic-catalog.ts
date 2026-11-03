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
 short:string; trait?:string; tradeoff?:'solo'|'coinflip'|'bloodmoon'|'allin'|'void'|'chain'|'eclipse'|'frenzy'; drawback?:string;
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
/** Twenty mode-specific tactical matrices; the lower rarities are deliberately
 * useful for tailored receipts instead of simply being weaker % bonuses. */
const TACTICAL_SKILLS:Readonly<Record<RelicMode,readonly string[]>> = {
  'competitive': [
    'odd',
    'near',
    'prime',
    'mod11',
    'advance',
    'master',
    'sovereign'
  ],
  'unrated': [
    'even',
    'thin',
    'lucky7',
    'double',
    'surge',
    'highroll',
    'sovereign'
  ],
  'swiftplay': [
    'triple',
    'quarter',
    'digit7',
    'prime',
    'advance',
    'master',
    'sovereign'
  ],
  'spikerush': [
    'lucky7',
    'even',
    'mod13',
    'near',
    'surge',
    'master',
    'sovereign'
  ],
  'teamdeathmatch': [
    'odd',
    'triple',
    'double',
    'quarter',
    'heavy',
    'master',
    'sovereign'
  ],
  'escalation': [
    'even',
    'mod11',
    'prime',
    'digit7',
    'highroll',
    'master',
    'sovereign'
  ],
  'deathmatch': [
    'thin',
    'lucky7',
    'square',
    'triple',
    'advance',
    'highroll',
    'sovereign'
  ],
  'skirmish': [
    'triple',
    'odd',
    'near',
    'prime',
    'surge',
    'master',
    'sovereign'
  ],
  'racing': [
    'quarter',
    'lucky7',
    'mod13',
    'double',
    'highroll',
    'master',
    'sovereign'
  ],
  'casino': [
    'odd',
    'prime',
    'digit7',
    'lucky77',
    'highroll',
    'master',
    'sovereign'
  ],
  'market': [
    'even',
    'thin',
    'mod11',
    'quarter',
    'advance',
    'master',
    'sovereign'
  ],
  'mleague': [
    'lucky7',
    'triple',
    'square',
    'mod13',
    'highroll',
    'master',
    'sovereign'
  ],
  'quiz': [
    'odd',
    'digit7',
    'prime',
    'double',
    'advance',
    'master',
    'sovereign'
  ],
  'voice': [
    'triple',
    'even',
    'near',
    'quarter',
    'surge',
    'master',
    'sovereign'
  ],
  'universal': [
    'even',
    'thin',
    'lucky7',
    'prime',
    'surge',
    'master',
    'sovereign'
  ],
  'finance': [
    'quarter',
    'odd',
    'mod11',
    'lucky7',
    'advance',
    'master',
    'sovereign'
  ],
  'marketplus': [
    'prime',
    'square',
    'quarter',
    'digit7',
    'highroll',
    'master',
    'sovereign'
  ],
  'racingplus': [
    'odd',
    'double',
    'mod13',
    'lucky77',
    'surge',
    'master',
    'sovereign'
  ],
  'casinoplus': [
    'triple',
    'even',
    'reverse',
    'prime',
    'highroll',
    'master',
    'sovereign'
  ],
  'fortune': [
    'lucky77',
    'square',
    'prime',
    'reverse',
    'digit7',
    'master',
    'sovereign'
  ]
};
const TACTICAL_HINTS:Readonly<Record<string,string>> = {
  'even': '受け取るKPが偶数',
  'odd': '受け取るKPが奇数',
  'prime': '受け取るKPが素数（2・3・5・7など）',
  'square': '受け取るKPが平方数（25・100・144など）',
  'quarter': '受け取るKPが25の倍数',
  'mod11': '受け取るKPが11の倍数',
  'mod13': '受け取るKPが13の倍数',
  'digit7': '受け取るKPの各桁の合計が7の倍数',
  'double': '受け取るKPに同じ数字が2桁以上並ぶ（11・100・277など）',
  'reverse': '受け取るKPが左右対称の数字（11・121・303など）',
  'near': '受け取るKPが対象モードの基本ライン+50KP以内',
  'thin': '受け取るKPが対象モードの基本ライン未満',
  'heavy': '受け取るKPが対象モードの高額ラインの2倍以上',
  'triple': '受け取るKPが3の倍数',
  'lucky77': '受け取るKPの数字に「77」が含まれる'
};
const TACTICAL_SPECIAL = new Set(['prime','square','quarter','mod11','mod13','digit7','double','reverse','near','lucky77']);
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
    const specialDef=special[mode],chosenSkill=TACTICAL_SKILLS[mode][rarityIndex]??rule.key;
    const tactical=TACTICAL_SPECIAL.has(chosenSkill);
    const chosenPercent=tactical?Math.max(specialDef?.boost[rarityIndex]??rule.percent,[12,14,16,19,22,25,28][rarityIndex]!):(specialDef?.boost[rarityIndex]??rule.percent);
    const chosenCap=tactical?Math.max(specialDef?.caps[rarityIndex]??rule.cap,[18,28,42,58,68,75,80][rarityIndex]!):(specialDef?.caps[rarityIndex]??rule.cap);
    const unusual=chosenSkill==='lucky7'?'対象額の一の位が7なら':chosenSkill==='odd'?'対象額が奇数なら':null;
    const compatible=['marketplus','racingplus','casinoplus','finance'].includes(mode);
    const explanation=TACTICAL_HINTS[chosenSkill]??unusual??conditions[chosenSkill]??conditions[rule.key];
    const skillShort:Record<string,string>={
      spark:'報酬獲得時',rescue:`${low}KP以下の報酬`,advance:`${low}KP以上の報酬`,
      highroll:`${high}KP以上の報酬`,surge:`${low}KP以上の報酬`,
      master:isNative?'精算時':'勝利・達成時',
      sovereign:isNative?'精算時':'勝利・達成時',
      even:'偶数KPの報酬',odd:'奇数KPの報酬',prime:'素数KPの報酬',
      square:'平方数KPの報酬',quarter:'25の倍数KPの報酬',
      mod11:'11の倍数KPの報酬',mod13:'13の倍数KPの報酬',
      digit7:'各桁合計が7の倍数',double:'数字が2つ連続',
      reverse:'左右対称の数字',near:'基準額+50KP以内',thin:'基準額未満',
      heavy:'高額ラインの2倍以上',triple:'3の倍数KPの報酬',
      lucky7:'末尾7の報酬',lucky77:'77を含む報酬'
    };
    const trait=rarity==='ancient'?'刻印連鎖：他の遺物も発動すると追加KP':rarity==='transcendent'?'運命突破：発動条件を外しても固定KPを獲得':undefined;
    const short=`${skillShort[chosenSkill]??'条件達成時'}：KP報酬＋${chosenPercent}%`;
    const extraCeiling=compatible?'（取引系共通：対象額1%・合計1日120KP以内）':ceiling;
    return {
      id,name,mode,rarity,power:power[rarityIndex]!,skill:chosenSkill,percent:chosenPercent,
      cap:chosenCap,short,trait,ability:`${RELIC_MODE_NAMES[mode]}で「${explanation}」を満たすと報酬が＋${chosenPercent}%。${trait?trait+'。':''}ほかの遺物と上限なしで合算。`,
    };
    /*
    return {
      id,name,mode,rarity,power:power[rarityIndex]!,skill:rule.key,percent:rule.percent,
*/
  }),
);
/** Eight standalone normal-summon relics with extreme trade-offs. Steam/Unite unchanged.
 * Their stable IDs are additional rewards, never replacing the original 140 items. */
export const RISK_RELICS:ReadonlyArray<NormalRelicDefinition>=[
 {id:'normal.pact.lonely_king',name:'孤独な覇冠',mode:'competitive',rarity:'legendary',power:125,skill:'sovereign',
  percent:175,cap:0,tradeoff:'solo',drawback:'自分が発動すると、ほかの遺物の上乗せKPが80%減',
  short:'コンペ勝利：報酬＋175%',trait:'孤高の代償',ability:'コンペ勝利時＋175%。同時装備のほかの遺物は上乗せKPが80%減る。'},
 {id:'normal.pact.coinflip',name:'双面の魔導銀貨',mode:'universal',rarity:'legendary',power:130,skill:'even',
  percent:220,cap:0,tradeoff:'coinflip',drawback:'奇数KPの報酬では、ほかの遺物の上乗せKPが60%減',
  short:'偶数KPの報酬：＋220%',trait:'表裏逆転',ability:'偶数KPの報酬に＋220%。奇数KPのときはほかの遺物の追加分が60%減る。'},
 {id:'normal.pact.bloodmoon',name:'血月の大契約',mode:'competitive',rarity:'mythic',power:208,skill:'victory_high',
  percent:310,cap:0,tradeoff:'bloodmoon',drawback:'報酬400KP未満で、ほかの遺物の追加分が70%減',
  short:'コンペ勝利＆400KP以上：＋310%',trait:'血月の誓い',ability:'コンペ勝利かつ報酬400KP以上なら＋310%。400KP未満ではほかの遺物の効果が70%減る。'},
 {id:'normal.pact.last_seven',name:'破滅への全賭け',mode:'fortune',rarity:'mythic',power:215,skill:'lucky7',
  percent:420,cap:0,tradeoff:'allin',drawback:'報酬末尾が7以外なら、ほかの遺物の追加分が50%減',
  short:'報酬末尾7：＋420%',trait:'七番目の破滅',ability:'報酬末尾が7なら＋420%。それ以外はほかの遺物の効果が50%減る。'},
 {id:'normal.pact.void',name:'虚無の王との契約',mode:'universal',rarity:'ancient',power:290,skill:'spark',
  percent:300,cap:0,tradeoff:'void',drawback:'ほかの遺物の効果が75%減り、七重共鳴も無効',
  short:'報酬獲得時：＋300%',trait:'虚無支配',ability:'全ゲームの報酬＋300%。ほかの遺物の上乗せKPは75%減。七重共鳴も発動しない。'},
 {id:'normal.pact.chain',name:'暴走する鎖の心臓',mode:'universal',rarity:'ancient',power:310,skill:'spark',
  percent:260,cap:0,tradeoff:'chain',drawback:'ほかの遺物が2個以上発動しなければ、自分の効果が0',
  short:'ほか2種以上が発動：＋260%',trait:'連鎖暴走',ability:'ほかの遺物が2個以上同時発動すると＋260%。さらにほかの発動1個につき＋60ポイント。単独では0。'},
 {id:'normal.pact.eclipse',name:'日蝕の至高王',mode:'universal',rarity:'transcendent',power:460,skill:'victory_high',
  percent:560,cap:0,tradeoff:'eclipse',drawback:'勝利かつ400KP以上でなければ、ほかの遺物の追加分が0',
  short:'勝利＆400KP以上：＋560%',trait:'日蝕の代償',ability:'勝利かつ報酬400KP以上なら＋560%。条件未達ではほかの遺物によるKP追加をすべて消す。'},
 {id:'normal.pact.frenzy',name:'賽の崩壊核',mode:'fortune',rarity:'transcendent',power:480,skill:'prime',
  percent:900,cap:0,tradeoff:'frenzy',drawback:'素数KP以外の報酬では、ほかの遺物の追加分が90%減',
  short:'素数KPの報酬：＋900%',trait:'確率暴走',ability:'素数KPの報酬なら＋900%。それ以外はほかの遺物の上乗せKPが90%減る。'},
];
export const ALL_NORMAL_RELICS:ReadonlyArray<NormalRelicDefinition>=[...NORMAL_RELICS,...RISK_RELICS];
export const NORMAL_RELIC_BY_ID = new Map(ALL_NORMAL_RELICS.map(x=>[x.id,x]));
export const NORMAL_RELIC_BY_RARITY:ReadonlyMap<NormalRelicRarity,ReadonlyArray<NormalRelicDefinition>>=
  new Map(RELIC_RARITIES.map(r=>[r,ALL_NORMAL_RELICS.filter(item=>item.rarity===r)]));
export const RELIC_CATALOG_COUNT = ALL_NORMAL_RELICS.length;
