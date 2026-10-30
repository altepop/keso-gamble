import { minesMultiplier, MINES_CELLS } from './casino-more.js?v=web-bd8803787b467985';
// 専用メニューで選べる役。画面の選択肢とサーバーの判定が同じ表を使う。出目・カードは役ごとに決まった並びで、
// 掛け金・残高・記録は通常のゲームの関数がそのまま扱う。
const mines=[[1,10],[3,5],[3,10],[5,5],[5,10],[10,3],[10,6]];
export const PRIVATE_HANDS={
 chinchiro:[['pinzoro','ピンゾロ（5倍）'],...[2,3,4,5,6].map(n=>[`zoro-${n}`,`${n}のゾロ目（3倍）`]),['shigoro','シゴロ（2倍）'],['hifumi','親がヒフミ（2倍）'],...[6,5,4,3,2].map(n=>[`me-${n}`,`${n}の目で勝ち（1倍）`])],
 blackjack:[['blackjack','初手21（2.5倍）']],
 slot:[['seven','7️⃣7️⃣7️⃣（100倍）'],['star','⭐⭐⭐（40倍）'],['bell','🔔🔔🔔（20倍）'],['lemon','🍋🍋🍋（10倍）'],['cherry','🍒🍒🍒（5倍）'],['cherry2','🍒2つ（1.5倍）']],
 poker:[['royal','ロイヤルストレートフラッシュ（250倍）'],['straight-flush','ストレートフラッシュ（50倍）'],['four','フォーカード（25倍）'],['full-house','フルハウス（8倍）'],['flush','フラッシュ（5倍）'],['straight','ストレート（4倍）'],['three','スリーカード（3倍）'],['two-pair','ツーペア（2倍）'],['jacks','ジャックス・オア・ベター（1倍）']],
 baccarat:[['player','プレイヤーが9で勝ち（2倍）'],['banker','バンカーが9で勝ち（1.95倍）'],['tie','9同士の引き分け（9倍）']],
 mines:mines.map(([m,k])=>[`${m}x${k}`,`地雷${m}個・${k}マス開けて降りる（${minesMultiplier(m,k)}倍）`]),
};
export const PRIVATE_GAMES=[['roulette','ルーレット（指定数字）'],['chinchiro','チンチロ'],['blackjack','ブラックジャック'],['slot','スロット'],['poker','ビデオポーカー'],['baccarat','バカラ'],['mines','マインズ']];
/** The chosen hand for a game, or the first one when none is given. Unknown hands are refused. */
export function privateHand(game,hand){
 const list=PRIVATE_HANDS[game];if(!list)return null;
 if(hand===undefined||hand===null||hand==='')return list[0][0];
 if(!list.some(([id])=>id===hand))throw Error('役を選び直してください。');
 return hand;
}
// チンチロ：親が先に3個振る。子の役は親が「目」のときだけ。
export function chinchiroDice(hand){
 if(hand==='pinzoro')return [2,2,3,1,1,1];
 if(hand==='shigoro')return [2,2,3,4,5,6];
 if(hand==='hifumi')return [1,2,3];
 const [kind,n]=hand.split('-'),point=Number(n);
 if(kind==='zoro')return [2,2,3,point,point,point];
 if(kind==='me'){const pair=point===6?5:6;return [6,6,1,pair,pair,point];}
 throw Error('役を選び直してください。');
}
const SLOT_START={cherry:0,lemon:6,bell:11,star:15,seven:18};
export function slotDraws(hand){return hand==='cherry2'?[0,0,6]:[SLOT_START[hand],SLOT_START[hand],SLOT_START[hand]];}
const c=(r,s)=>({r,s});
const POKER={
 royal:[c(10,1),c(11,1),c(12,1),c(13,1),c(1,1)],'straight-flush':[c(5,2),c(6,2),c(7,2),c(8,2),c(9,2)],
 four:[c(9,0),c(9,1),c(9,2),c(9,3),c(2,0)],'full-house':[c(9,0),c(9,1),c(9,2),c(4,0),c(4,1)],
 flush:[c(2,3),c(5,3),c(8,3),c(11,3),c(13,3)],straight:[c(5,0),c(6,1),c(7,2),c(8,3),c(9,0)],
 three:[c(7,0),c(7,1),c(7,2),c(2,0),c(11,1)],'two-pair':[c(8,0),c(8,1),c(4,2),c(4,3),c(13,2)],
 jacks:[c(11,0),c(11,1),c(2,2),c(5,3),c(8,0)],
};
/** The draw function vpDeal uses: each call picks the next wanted card from the cards not dealt yet. */
export function pokerDraws(hand){
 const wanted=[...POKER[hand]],dealt=[],index=x=>(x.s*13+x.r-1);
 return ()=>{const card=wanted.shift(),n=index(card),i=n-dealt.filter(d=>index(d)<n).length;dealt.push(card);return i;};
}
export function baccaratCards(hand){
 const nine=[c(9,0),c(13,1)],zero=[c(13,2),c(12,3)];
 return hand==='player'?[...nine,...zero]:hand==='banker'?[...zero,c(9,2),c(13,3)]:[...nine,c(9,2),c(12,3)];
}
export function minesPlan(hand){
 const [m,k]=hand.split('x').map(Number);
 if(!mines.some(([a,b])=>a===m&&b===k)||k>=MINES_CELLS-m+1)throw Error('役を選び直してください。');
 return {mines:m,opens:k};
}
