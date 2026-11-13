/** Additional Mahjong Soul + Discord voice summon relics.
 * The four voice gears are intentionally cryptic: all four slots must connect.
 * Nothing is retroactively granted; all use the ordinary summon rarity pool.
 */
import type {NormalRelicDefinition} from './relic-catalog.ts';
export const MORE_MAHJONG_VOICE_RELICS:ReadonlyArray<NormalRelicDefinition>=[
 {id:'normal.mahjong.hakuchu',name:'白中の符',mode:'mahjong',rarity:'common',power:29,skill:'odd',percent:22,cap:0,short:'奇数KP：＋22%',ability:'雀魂の確定KPが奇数なら＋22%。'},
 {id:'normal.mahjong.redfive',name:'赤五の記憶',mode:'mahjong',rarity:'uncommon',power:58,skill:'even',percent:35,cap:0,short:'偶数KP：＋35%',ability:'雀魂の確定KPが偶数なら＋35%。'},
 {id:'normal.mahjong.riichi',name:'立直の鈴',mode:'mahjong',rarity:'rare',power:89,skill:'quarter',percent:55,cap:0,short:'25の倍数：＋55%',ability:'雀魂の確定KPが25の倍数で＋55%。'},
 {id:'normal.mahjong.dora',name:'裏ドラの瞳',mode:'mahjong',rarity:'legendary',power:143,skill:'prime',percent:135,cap:0,short:'素数KP：＋135%',ability:'雀魂の確定KPが素数のときだけ＋135%。'},
 {id:'normal.mahjong.chiitoi',name:'七対子の星時計',mode:'mahjong',rarity:'mythic',power:227,skill:'lucky7',percent:195,cap:0,short:'末尾7のKP：＋195%',ability:'雀魂の確定KPの一の位が7なら＋195%。'},
 {id:'normal.mahjong.ryuuiisou',name:'緑一色の龍',mode:'mahjong',rarity:'ancient',power:325,skill:'highroll',percent:270,cap:0,short:'400KP以上：＋270%',trait:'刻印連鎖：他の遺物も発動すると追加KP',ability:'雀魂の400KP以上の確定報酬で＋270%。刻印連鎖も発生。'},
 {id:'normal.mahjong.tenhou',name:'天和の幻門',mode:'mahjong',rarity:'transcendent',power:468,skill:'master',percent:375,cap:0,short:'確定達成：＋375%',trait:'運命突破：発動条件を外しても固定KPを獲得',ability:'雀魂の確定した勝利・達成報酬に＋375%。運命突破。'},
 {id:'normal.mahjong.ledger',name:'牌譜の算盤',mode:'mahjong',rarity:'rare',power:101,skill:'spark',percent:0,cap:0,special:'digits',short:'確定KPの桁合計×2KP',trait:'計数',ability:'雀魂の確定KPの各桁を足した数×2KP。'},
 {id:'normal.mahjong.floor',name:'河底の平方鏡',mode:'mahjong',rarity:'legendary',power:157,skill:'spark',percent:0,cap:0,special:'root',short:'平方根（切捨）×3KP',trait:'数字変換',ability:'雀魂の確定KPの平方根を切り捨てた数×3KP。'},
 {id:'normal.mahjong.ensemble',name:'四暗刻の譜面',mode:'mahjong',rarity:'mythic',power:235,skill:'spark',percent:0,cap:0,special:'echo',short:'他の発動遺物×40KP',trait:'連結',ability:'雀魂で別の遺物が同時発動すると、その個数×40KPを固定追加。'},
 {id:'normal.voice.mic',name:'片耳の通話石',mode:'voice',rarity:'common',power:32,skill:'triple',percent:28,cap:0,short:'3の倍数KP：＋28%',ability:'通話の確定KPが3の倍数なら＋28%。'},
 {id:'normal.voice.coffee',name:'夜更かしの珈琲',mode:'voice',rarity:'uncommon',power:60,skill:'odd',percent:45,cap:0,short:'奇数KP：＋45%',ability:'通話の確定KPが奇数なら＋45%。'},
 {id:'normal.voice.pulse',name:'拍子木の共振器',mode:'voice',rarity:'rare',power:104,skill:'near',percent:95,cap:0,short:'小額報酬：＋95%',ability:'通話の基本ライン近辺の確定KPを＋95%。'},
 {id:'normal.voice.alarm',name:'眠気の反転儀',mode:'voice',rarity:'legendary',power:160,skill:'master',percent:125,cap:0,short:'通話の確定報酬：＋125%',ability:'通話の確定達成時に＋125%。鳴らない時計を起こす音があるという。'},
 {id:'normal.voice.midnight',name:'午前零時の星環',mode:'voice',rarity:'mythic',power:239,skill:'odd',percent:215,cap:0,short:'奇数KP：＋215%',ability:'通話の確定KPが奇数なら＋215%。'},
 {id:'normal.voice.dawn',name:'夜明けの残響',mode:'voice',rarity:'transcendent',power:495,skill:'master',percent:355,cap:0,short:'通話の確定報酬：＋355%',trait:'運命突破：発動条件を外しても固定KPを獲得',ability:'通話の確定達成報酬に＋355%。運命突破。'},
 // The first three activate along three unrelated integer divisibility axes.
 {id:'normal.voice.riddle.three',name:'三分割の歯車',mode:'voice',rarity:'rare',power:102,skill:'spark',percent:0,cap:0,special:'voice_key',short:'三で割った余白。まだ音は足りない',trait:'隠し歯車・Ⅰ',ability:'3の倍数に反応する。針と重なっても、それだけでは時計は動かない。'},
 {id:'normal.voice.riddle.five',name:'五拍目の針',mode:'voice',rarity:'mythic',power:251,skill:'spark',percent:0,cap:0,special:'voice_key',short:'五拍目の先には、まだ続きがある',trait:'隠し歯車・Ⅱ',ability:'5の倍数に反応する。二つの数字が重なっても、空いた席は埋まらない。'},
 {id:'normal.voice.riddle.fifteen',name:'十五番目の空席',mode:'voice',rarity:'ancient',power:348,skill:'spark',percent:0,cap:0,special:'voice_key',short:'十五の空席。最後の音はまだない',trait:'隠し歯車・Ⅲ',ability:'15の倍数に反応する。三つの歯車が噛み合っても、空席に最後の音がなければ静かなままだ。'},
 {id:'normal.voice.riddle.crown',name:'無音の王冠',mode:'voice',rarity:'transcendent',power:523,skill:'spark',percent:0,cap:0,special:'voice_ritual',short:'沈黙の四重奏。最後の一音はどこに',trait:'裏和音',ability:'小さな数字の響きは、四つ目の音を迎えるまで旋律にならない。'},
];
