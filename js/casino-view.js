import { CASINO_MIN, CASINO_MAX, CHINCHIRO_HANDS, RANKS, SUITS, bjTotal } from './casino.js?v=20261028-casino';
const kp=n=>Math.abs(n).toLocaleString('ja-JP')+' KP';
const signed=n=>(n>0?'+':n<0?'−':'±')+kp(n);
export const CASINO_GAMES=[['roulette','ルーレット'],['chinchiro','チンチロ'],['blackjack','ブラックジャック']];
export function gamePicker(game){
 return `<div class="segment casino-games" role="tablist">${CASINO_GAMES.map(([id,label])=>`<button role="tab" data-casino-game="${id}" class="${game===id?'active':''}" aria-selected="${game===id}">${label}</button>`).join('')}</div>`;
}
const stakeField=(id,label='賭け金')=>`<div class="field"><label for="${id}">${label}（${CASINO_MIN}〜${CASINO_MAX.toLocaleString('ja-JP')} KP）</label><input id="${id}" class="input" type="number" min="${CASINO_MIN}" max="${CASINO_MAX}" step="100" value="500" inputmode="numeric"></div>`;

// ---- チンチロ ----
const FACES=['','⚀','⚁','⚂','⚃','⚄','⚅'];
const handName=h=>h.kind==='me'?`${h.point}の目`:h.kind==='zoro'?`${h.point}のゾロ目`:CHINCHIRO_HANDS[h.kind];
const rolls=(who,r)=>`<div class="dice-side"><strong>${who}</strong>${r.rolls.map((d,i)=>`<div class="dice-row ${i===r.rolls.length-1?'final':''}">${d.map(v=>`<span class="die" aria-label="${v}">${FACES[v]}</span>`).join('')}</div>`).join('')}<span class="badge">${handName(r.hand)}</span></div>`;
export function chinchiroView(state){
 const last=state.chinchiro?.[0];
 const result=last?`<section class="casino-result ${last.net>0?'win':last.net<0?'lose':''}" aria-live="polite"><div class="dice-board">${rolls('親（KESO）',last.oya)}${last.ko?rolls('あなた',last.ko):'<div class="dice-side"><strong>あなた</strong><p class="helper">親の役で決着</p></div>'}</div><p class="casino-net">${last.net>0?'勝ち':last.net<0?'負け':'分け'} ${signed(last.net)}（賭け ${kp(last.amount)}）</p></section>`:'';
 const recent=(state.chinchiro??[]).slice(1,6).map(c=>`<div class="history-entry"><div>親 ${handName(c.oya.hand)}${c.ko?` / あなた ${handName(c.ko.hand)}`:''}</div><div class="helper">${signed(c.net)}</div></div>`).join('');
 return `${result}<div class="trade-box"><h3>チンチロ</h3><p class="helper">親（KESO）が先に振り、ピンゾロ・ゾロ目・シゴロ・ヒフミ・目なしなら即決着。親が「目」なら、あなたが最大3回振って目の大小で勝負。</p>${stakeField('chinchiro-amount')}<div class="action-row"><button class="action-btn primary" data-action="chinchiro">サイコロを振る</button></div><details class="rules"><summary>役と倍率</summary><p class="helper">あなたの役：ピンゾロ 5倍・ゾロ目 3倍・シゴロ 2倍の勝ち／目なし 1倍・ヒフミ 2倍の負け。<br>親の役：ピンゾロ 5倍・ゾロ目 3倍・シゴロ 2倍の負け／目なし 1倍・ヒフミ 2倍の勝ち。<br>最大で賭け金の5倍負けるので、所持KPは賭け金の5倍以上必要です。</p></details></div>${recent?`<div class="asset-list"><div class="asset-card"><h2 class="panel-title">最近の勝負</h2>${recent}</div></div>`:''}`;
}

// ---- ブラックジャック ----
const card=c=>`<span class="playing-card ${c.s===1||c.s===2?'red':''}">${RANKS[c.r-1]}<small>${SUITS[c.s]}</small></span>`;
const hidden='<span class="playing-card back" aria-label="伏せ札">?</span>';
const total=cards=>{const t=bjTotal(cards);return `${t.total}${t.soft&&t.total<21?'（ソフト）':''}`;};
const RESULTS={win:'勝ち',lose:'負け',push:'引き分け',bust:'バースト',blackjack:'ブラックジャック！','dealer-blackjack':'ディーラーのブラックジャック'};
const table=(dealer,player,showDealer)=>`<div class="bj-table"><div><strong>ディーラー</strong><div class="cards">${dealer.map(card).join('')}${showDealer?'':hidden}</div><span class="helper">${showDealer?total(dealer):`見えている札 ${total(dealer)}`}</span></div><div><strong>あなた</strong><div class="cards">${player.map(card).join('')}</div><span class="helper">${total(player)}</span></div></div>`;
export function blackjackView(state){
 const hand=state.blackjack,last=state.bjHistory?.[0];
 if(hand){
  const canDouble=hand.player.length===2&&!hand.doubled&&state.cash>=hand.bet;
  return `<section class="casino-result">${table(hand.dealer,hand.player,false)}<p class="helper">賭け ${kp(hand.bet*(hand.doubled?2:1))}</p><div class="bj-actions"><button class="action-btn primary" data-action="bj-hit">ヒット</button><button class="action-btn" data-action="bj-stand">スタンド</button><button class="action-btn" data-action="bj-double" ${canDouble?'':'disabled'}>ダブル</button></div></section>`;
 }
 const result=last?`<section class="casino-result ${last.net>0?'win':last.net<0?'lose':''}" aria-live="polite">${table(last.dealer,last.player,true)}<p class="casino-net">${RESULTS[last.result]??last.result} ${signed(last.net)}</p></section>`:'';
 const recent=(state.bjHistory??[]).slice(1,6).map(r=>`<div class="history-entry"><div>${RESULTS[r.result]??r.result}（あなた ${bjTotal(r.player).total} / ディーラー ${bjTotal(r.dealer).total}）</div><div class="helper">${signed(r.net)}</div></div>`).join('');
 return `${result}<div class="trade-box"><h3>ブラックジャック</h3><p class="helper">21に近い方が勝ち。勝ちは2倍、ブラックジャック（最初の2枚で21）は2.5倍の払い戻し。ディーラーは17以上で止まります。</p>${stakeField('bj-amount')}<div class="action-row"><button class="action-btn primary" data-action="bj-start">配る</button></div><details class="rules"><summary>細かいルール</summary><p class="helper">カードは毎回52枚から引きます（何枚出ても同じ確率）。ディーラーの2枚目は、あなたが止めた後に引きます。ダブルは最初の2枚のときだけで、1枚だけ引いて止まります。スプリットはありません。ディーラーがブラックジャックのときは、ダブルで足した分は返ります。</p></details></div>${recent?`<div class="asset-list"><div class="asset-card"><h2 class="panel-title">最近の勝負</h2>${recent}</div></div>`:''}`;
}
