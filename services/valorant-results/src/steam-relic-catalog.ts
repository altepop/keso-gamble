/** Steam-exclusive trophy families. Added beside the original 12 so owned receipts remain untouched.
 * An achievement ID selects one of 30 candidates within its worldwide unlock-rate band.
 * Percent is a deliberate wide spectrum, not a uniform rarity multiplier:
 * some hard achievements yield trophies, others unlock best-in-slot builds.
 */
import type {RelicMode} from './relic-catalog.ts';

export type SteamFeatureKind='none'|'fixed'|'chorus'|'mirror'|'curse';
export interface SteamRelicVariant {
 name:string;mode:RelicMode;skill:string;percent:number;
 feature:SteamFeatureKind;featureValue:number;
}
export const STEAM_GRADE_NAMES=['異界','深淵','神話','偉業','熟練','挑戦','旅路'] as const;
export type SteamGrade=typeof STEAM_GRADE_NAMES[number];
/** name | compatible mode | verified-reward predicate | bonus % | special | strength
 * fixed: add KP; chorus: KP per OTHER active relic; mirror: copy % of largest OTHER percent-bonus;
 * curse: if predicate misses, suppress OTHER relic bonuses by the stated percentage.
 */
const EXTRA:Record<SteamGrade,readonly string[]>={
 '異界':[
 '常夜の永久機関|universal|spark|420|fixed|180',
 '千年を裂く羅針盤|universal|prime|900|none|0',
 '全知の残響|universal|spark|48|chorus|240',
 '奪われた王の鏡|universal|spark|60|mirror|180',
 '終焉の契約書|universal|highroll|1400|curse|95',
 '虚空の祈り|voice|spark|560|fixed|200',
 '八百万の夜明け|spikerush|spark|620|fixed|175',
 '輪廻の十二面体|fortune|lucky7|1600|none|0',
 '眠らない古代銀行|finance|advance|780|none|0',
 '蒼穹の負け札|universal|rescue|380|fixed|90',
 '逆しまの星鍵|universal|reverse|1800|none|0',
 '不滅の金箔|casino|highroll|1100|none|0',
 '無音の開拓史|voice|spark|45|fixed|16',
 '遅刻した終末|universal|triple|75|none|0',
 '運命を捨てた骰子|fortune|prime|2000|curse|90',
 '異界の火打石|universal|spark|15|none|0',
 '神撃の馬蹄|racing|highroll|990|mirror|100',
 '消えかけたメモリー|steam|spark|4|fixed|1'
 ],
 '深淵':[
 '黒潮の動力核|universal|spark|245|fixed|95',
 '真夜中の電卓|universal|prime|670|none|0',
 '写し身の獣面|universal|spark|40|mirror|140',
 '喧騒の交響器|voice|spark|350|chorus|90',
 '奈落の逆転時計|universal|rescue|310|fixed|60',
 '漆黒の契約印|universal|highroll|850|curse|85',
 '八連星の証明|spikerush|spark|390|fixed|100',
 '深海の通話鐘|voice|spark|120|fixed|35',
 '幽閉された指数|fortune|square|940|none|0',
 '黙示録の配当券|racing|highroll|770|none|0',
 '破産王の使い魔|casino|highroll|720|none|0',
 '秘匿の星屑|universal|odd|115|none|0',
 '黄泉からの落書き|quiz|master|500|none|0',
 '夜霧の古地図|universal|spark|11|none|0',
 '海底の錬金壺|finance|advance|440|none|0',
 '冥府の守銭奴|universal|quarter|820|curse|70',
 '遺忘の古文書|steam|spark|5|none|0',
 '月影の聴診器|mahjong|master|220|fixed|85'
 ],
 '神話':[
 '神代の歯車|universal|spark|170|fixed|55',
 '運命の万華鏡|universal|spark|25|mirror|100',
 '星喰いの長剣|competitive|sovereign|400|none|0',
 '金の裏返し|universal|even|260|none|0',
 '予言者の禁書|universal|prime|550|none|0',
 '神罰の反転符|universal|highroll|680|curse|75',
 '永遠の夜食券|voice|spark|210|fixed|45',
 '不敗の走馬灯|spikerush|spark|270|fixed|55',
 '虹色の借用書|universal|spark|38|chorus|80',
 '麻雀神の指輪|mahjong|master|320|none|0',
 '黄金市場の青写真|finance|advance|360|none|0',
 '競馬場の神託|racing|highroll|460|none|0',
 '不発の雷管|universal|spark|9|none|0',
 '双頭の百科事典|quiz|master|160|fixed|35',
 '変則の発明図|fortune|lucky7|710|none|0',
 '零時の回転盤|casino|highroll|470|none|0',
 '遠征用の髪留め|universal|rescue|35|none|0',
 '壊れた神像|steam|spark|2|fixed|1'
 ],
 '偉業':[
 '達人の起動鍵|universal|spark|95|fixed|24',
 '職人の重ね鏡|universal|spark|18|mirror|65',
 '百人の拍手|voice|spark|145|chorus|32',
 '大逆転の銀杭|universal|rescue|200|none|0',
 '栄光の落雷|spikerush|spark|160|fixed|40',
 '勇気の契約|universal|highroll|450|curse|60',
 '勝利の献立表|competitive|sovereign|280|none|0',
 '三連勝のメダル|universal|triple|240|none|0',
 '永久保存の切符|steam|spark|35|fixed|20',
 '異邦の貯金箱|finance|advance|200|none|0',
 '七色の仕掛け箱|fortune|lucky7|490|none|0',
 '末席の応援旗|universal|spark|7|none|0',
 '馬房の手紙|racing|advance|170|none|0',
 '卓上の拍子木|mahjong|master|120|fixed|24',
 '戦友のカセット|voice|spark|55|fixed|10',
 '記録係の付箋|universal|quarter|330|none|0',
 '閉店間際の勲章|casino|highroll|240|none|0',
 '達成感の空瓶|universal|spark|3|none|0'
 ],
 '熟練':[
 '匠の計算尺|universal|spark|62|fixed|15',
 'こだまの鈴|universal|spark|12|chorus|25',
 '練習試合の栞|spikerush|spark|135|fixed|20',
 '夜更けの拍手|voice|spark|95|fixed|20',
 '技師の反射板|universal|spark|10|mirror|40',
 '失敗を喰う札|universal|rescue|150|none|0',
 '奇数の仕立て屋|universal|odd|180|none|0',
 '激流の契約紙|universal|highroll|350|curse|50',
 '試算の金槌|finance|advance|150|none|0',
 '勝負のガイド線|competitive|sovereign|145|none|0',
 '通学路の寄り道|universal|spark|6|none|0',
 '裏庭の馬券箱|racing|advance|120|none|0',
 '薄明の火縄|casino|highroll|190|none|0',
 '達人の逆引き索引|quiz|master|100|fixed|18',
 '七時の目覚まし|fortune|lucky7|300|none|0',
 '多面体の小石|universal|quarter|220|none|0',
 'やり込んだノート|steam|spark|23|fixed|10',
 '予備のセーブ枠|universal|spark|2|none|0'
 ],
 '挑戦':[
 '挑戦者の方位磁針|universal|spark|44|fixed|10',
 '一攫千金の栞|fortune|prime|260|none|0',
 '軽量の増幅装置|universal|spark|8|chorus|17',
 '無名の薄鏡|universal|spark|8|mirror|30',
 '三番目の祝砲|spikerush|spark|100|fixed|15',
 '眠気覚ましの鈴|voice|spark|65|fixed|12',
 '破れた賭博契約|universal|highroll|230|curse|45',
 '再挑戦の腰袋|universal|rescue|110|none|0',
 '取引の走り書き|finance|advance|110|none|0',
 '素数好きの鉛筆|universal|prime|210|none|0',
 '雨宿りの勝利旗|competitive|sovereign|105|none|0',
 '市場の目盛り|market|advance|80|none|0',
 '馬券のしおり|racing|advance|85|none|0',
 '小さな親指印|universal|spark|4|none|0',
 '二十五番目の鍵|universal|quarter|180|none|0',
 '卓上の連絡帳|mahjong|master|75|none|0',
 'VCTの下書き|quiz|master|58|none|0',
 '触ると鳴る石|steam|spark|3|fixed|2'
 ],
 '旅路':[
 '始まりの灯台|universal|spark|20|fixed|6',
 '木製の秘密鍵|universal|prime|160|none|0',
 '旅人の歯車|universal|spark|5|chorus|8',
 '手鏡の欠片|universal|spark|4|mirror|20',
 '温かい通話のマグ|voice|spark|42|fixed|8',
 '起爆の落書き|spikerush|spark|60|fixed|8',
 '見習いの大勝負|universal|highroll|150|curse|35',
 '初勝利のリボン|competitive|sovereign|62|none|0',
 'やさしい回復薬|universal|rescue|72|none|0',
 '七日目のしおり|fortune|lucky7|200|none|0',
 '駆け出しの馬蹄|racing|advance|48|none|0',
 'ひび割れた電卓|universal|spark|2|none|0',
 '昼休みの砂時計|voice|spark|7|none|0',
 '実績欄の落書き|steam|spark|3|fixed|1',
 '壊れかけの貯金箱|finance|advance|55|none|0',
 '小石のブローチ|universal|triple|65|none|0',
 'アルミの賞状|quiz|master|30|none|0',
 '逆さの靴下|universal|spark|1|none|0'
 ]
};
export function steamExtraRelics(grade:SteamGrade):readonly SteamRelicVariant[]{
 return EXTRA[grade].map(line=>{
  const [name,mode,skill,rate,feature,value]=line.split('|');
  return {name:name!,mode:mode as RelicMode,skill:skill!,percent:Number(rate),
    feature:feature as SteamFeatureKind,featureValue:Number(value)};
 });
}
export const STEAM_EXTRA_PER_GRADE=18;
