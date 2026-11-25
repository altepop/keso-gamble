// Rules are static explanatory text, verified against duel-rules.js and
// duel-mini-games.js; never suggest or reveal opponent private information.
export const DUEL_BEGINNER_RULES=Object.freeze({
 othello:{name:'オセロ',win:'終了時に石が多い側が勝ち。',first:'黒が先手。自分の石で相手の石を挟むマスを選ぶ。',caution:'置けない場合は自動パス。盤面の「返せる枚数」はその手の石数であり、勝利予測ではない。'},
 gomoku:{name:'五目並べ',win:'縦・横・斜めに5個以上並べると勝ち。',first:'空きマスを選択してから「ここに置く」で確定する。',caution:'盤面は15×15。禁じ手はなく、先手はランダムに決まる。'},
 connect4:{name:'四目並べ',win:'縦・横・斜めに4個並べると勝ち。',first:'上の▼で列を選び、空いている最下段へ駒を落とす。',caution:'満杯の列には置けない。駒を置いた後で元に戻すことはできない。'},
 hitblow:{name:'Hit & Blow',win:'相手の秘密の4桁を先に当てると勝ち。40手で未決着なら引き分け。',first:'異なる数字4つを選んで予想し、HIT（数字と位置）・BLOW（数字のみ）から絞る。',caution:'先頭の0も使える。相手の秘密番号は終了時の公開まで表示しない。'},
 bluffdice:{name:'ブラフダイス',win:'相手より先に2ラウンド勝つと勝利。',first:'5個の自分のダイスだけを見て、合計10個の中にある出目の個数を宣言する。',caution:'前より強い宣言をするか、相手の宣言を疑う。1はワイルドではない。相手の現在のダイスは公開されない。'},
 poker:{name:'5カードポーカー',win:'5枚の役を比較し、強い役の側が勝ち。',first:'自分の5枚を確認し、0〜3枚を選んで1回だけ交換を確定する。',caution:'0枚交換も可能。相手のカードは両者の交換終了後のショーダウンまで非公開。'}
});
export function getDuelBeginnerRules(game){
 return Object.hasOwn(DUEL_BEGINNER_RULES,game)?DUEL_BEGINNER_RULES[game]:null;
}
