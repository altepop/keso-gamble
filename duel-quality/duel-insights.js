// Deeper reference panels use public rules or already-rendered confirmed boards.
// Never use a hidden opponent card, code or dice roll.
export const DUEL_POKER_HAND_ORDER=Object.freeze([
 'ストレートフラッシュ','フォーカード','フルハウス','フラッシュ','ストレート',
 'スリーカード','ツーペア','ワンペア','ハイカード'
]);
export function summarizeVisibleOthelloCorners(cells){
 if(!Array.isArray(cells)||cells.length!==64||cells.some(x=>!['B','W','.'].includes(x)))return null;
 const corners=[cells[0],cells[7],cells[56],cells[63]];
 return {black:corners.filter(c=>c==='B').length,
  white:corners.filter(c=>c==='W').length,
  open:corners.filter(c=>c==='.').length};
}
export const DUEL_BLUFF_BID_RULES=Object.freeze([
 '宣言を上げる場合、まず個数を多くするか、同じ個数なら出目を大きくする。',
 '相手の宣言を疑うと、公開された合計10個のダイスで成否が決まる。',
 '「1」はワイルドではなく、ほかの出目の代わりに数えない。',
 '確率の目安は自分のダイスと未知の5個を仮定した計算であり、相手の実際の出目を示すものではない。'
]);
