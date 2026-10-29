import { CASINO_MIN, CASINO_MAX, CHINCHIRO_HANDS, RANKS, SUITS, bjTotal } from './casino.js?v=web-12983dccc661b02c';
const kp=n=>Math.abs(n).toLocaleString('ja-JP')+' KP';
const signed=n=>(n>0?'+':n<0?'−':'±')+kp(n);
export const CASINO_GAMES=[['roulette','ルーレット'],['chinchiro','チンチロ'],['blackjack','ブラックジャック'],['mines','マインズ'],['slot','スロット'],['poker','ポーカー'],['baccarat','バカラ']];
export function gamePicker(game){return `<div class="segment casino-games" role="tablist">${CASINO_GAMES.map(([id,label])=>`<button role="tab" data-casino-game="${id}" class="${game===id?'active':''}" aria-selected="${game===id}">${label}</button>`).join('')}</div>`;}
const stakeField=(id,label='賭け金')=>`<div class="field"><label for="${id}">${label}（${CASINO_MIN}〜${CASINO_MAX.toLocaleString('ja-JP')} KP）</label><input id="${id}" class="input" type="number" min="${CASINO_MIN}" max="${CASINO_MAX}" step="100" value="500" inputmode="numeric"></div>`;
const skip=busy=>busy?'<button class="casino-skip" data-action="casino-skip">演出をスキップ ›</button>':'';
const particles='<div class="casino-sparks" aria-hidden="true">'+Array.from({length:12},(_,i)=>`<i style="--i:${i}"></i>`).join('')+'</div>';
const resultBanner=(label,net,stage,special=false)=>`<div role="status" class="casino-verdict ${stage.phase==='settled'?'fresh':''} ${net>0?'won':net<0?'lost':'draw'} ${special&&net>0?'big-hand':''}">${net>0?particles:''}<span class="verdict-label">${label}</span><strong class="casino-net">${signed(net)}</strong><span class="verdict-note">${special&&net>0?'BIG HAND':net>0?'NICE WIN':net<0?'NEXT ROUND':'PUSH'}</span></div>`;
const phaseText=stage=>stage.phase==='waiting'?'結果を確認中…':stage.phase==='rolling'?`${stage.side==='oya'?'親':'あなた'}の${stage.round}投目…`:stage.phase==='landing'?'最後まで見届けろ…':stage.phase==='reroll'?'目なし。もう一投' :stage.phase==='hand'?'役を確認':stage.phase==='dealer-turn'?'ディーラーのターン':stage.phase==='dealing'?(stage.side==='dealer'?'ディーラーに配札':'あなたに配札'):stage.phase==='settled'?'結果':'';
const status=(stage,busy,fallback='賭け金を入力してください')=>`<div class="casino-stage-status" role="status">${phaseText(stage)||fallback}${skip(busy)}</div>`;
// Solid dice and pips stay legible on small screens (no font-dependent dice glyphs).
const PIPS={1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]};
const pips=v=>Array.from({length:9},(_,n)=>`<i class="${PIPS[v].includes(n+1)?'pip':''}"></i>`).join('');
const die=(v,i,rolling=false,last=false,fresh=false)=>`<span class="die ${v===1?'one':''} ${rolling?'tumbling': 'landed'+(fresh?' newly-landed':'')} ${last?'last-die':''}" style="--die:${i}" ${rolling?'aria-hidden="true"':`role="img" aria-label="サイコロ ${v}"`}>${rolling?`<span class="dice-cube">${[1,6,2,5,3,4].map((f,j)=>`<span class="dice-face face-${j} ${f===1?'red-pips':''}">${pips(f)}</span>`).join('')}</span>`:pips(v)}</span>`;
export function diceSuspense(stopped){
 if(stopped.length!==2)return 'まずは1個…';
 const [a,b]=stopped;
 if(a===b)return a===1?'ピンゾロくるか…？':'ゾロ目くるか…？';
 if([a,b].every(n=>n>=4))return 'シゴロくるか…？';
 if([a,b].every(n=>n<=3))return 'ヒフミくるか…？';
 return 'あと1個…';
}
const handName=h=>!h?'—':h.kind==='me'?`${h.point}の目`:h.kind==='zoro'?`${h.point}のゾロ目`:CHINCHIRO_HANDS[h.kind];
function diceSide(who,r,side,stage){
 const active=stage.side===side&&stage.phase!=='settled';
 const rolling=active&&['rolling','landing'].includes(stage.phase),stopped=rolling?(stage.stopped??[]):[];
 const last=r?.rolls.at(-1),faces=rolling?[0,1,2].map(i=>stopped[i]??2):last;
 const suspense=rolling&&stopped.length===2;
 return `<div class="dice-side ${active?'active':''}"><div class="dice-player"><span>${side==='oya'?'HOUSE':'PLAYER'}</span><strong>${who}</strong></div><div class="dice-bowl ${rolling?'rolling':''} ${suspense?'suspense':''}" data-stopped="${rolling?stopped.length:3}"><div class="dice-row">${faces?faces.map((v,i)=>die(v,i,rolling&&i>=stopped.length,suspense&&i===2,rolling?i===stopped.length-1:active&&['hand','reroll'].includes(stage.phase)&&i===2)).join(''):'<span class="dice-rest">出目待ち</span>'}</div>${rolling?`<span class="dice-roll-count">${stage.round} / 3 投目</span>`:''}</div><span class="dice-hand ${r?.hand&&!rolling?'revealed':''} ${suspense?'dice-tension':''}">${rolling?stopped.length?diceSuspense(stopped):'転がれ…！':handName(r?.hand)}</span>${r?.rolls.length>0&&rolling||r?.rolls.length>1?`<div class="dice-previous">前の出目 ${r.rolls.slice(0,rolling?undefined:-1).map(d=>d.join(' · ')).join(' ／ ')}</div>`:''}</div>`;
}
export function chinchiroView(state,stage={},busy=false){
 const last=state.chinchiro?.[0],settled=last&&!busy||stage.phase==='settled';
 const show=last??{oya:null,ko:null};
 const arena=`<section class="casino-arena chinchiro-arena ${settled?(last.net>0?'win':last.net<0?'lose':''):''}" aria-label="チンチロのテーブル"><div class="casino-masthead"><span>KESO DICE CLUB</span>${last?`<span>BET ${kp(last.amount)}</span>`:''}</div>${status(stage,busy)}<div class="dice-board ${busy&&stage.side?'in-play':''}">${diceSide('親（KESO）',show.oya,'oya',stage)}<span class="dice-versus" aria-hidden="true">VS</span>${diceSide('あなた',show.ko,'ko',stage)}</div>${settled?resultBanner(last.net>0?'勝ち':last.net<0?'負け':'引き分け',last.net,stage,last.units>=3):'<div class="casino-table-hint">ピンゾロ <b>×5</b>　ゾロ目 <b>×3</b>　シゴロ <b>×2</b></div>'}${settled&&last.ko===null?'<p class="casino-table-hint">親の役で決着</p>':''}</section>`;
 const recent=(state.chinchiro??[]).slice(1,6).map(c=>`<div class="history-entry"><div>親 ${handName(c.oya.hand)}${c.ko?` / あなた ${handName(c.ko.hand)}`:''}</div><div class="helper">${signed(c.net)}</div></div>`).join('');
 return `${arena}<div class="trade-box casino-controls"><h3>賭け金</h3><p class="helper">親が先に振ります。「目」ならあなたの番。目が揃わなければ最大3回。</p>${stakeField('chinchiro-amount')}<div class="action-row"><button class="action-btn primary casino-play" data-action="chinchiro" ${busy?'disabled':''}>${busy?'勝負中…':'サイコロを振る'} <span>↗</span></button></div><details class="rules"><summary>役と倍率</summary><p class="helper">あなたの役：ピンゾロ 5倍・ゾロ目 3倍・シゴロ 2倍の勝ち／目なし 1倍・ヒフミ 2倍の負け。<br>親の役：ピンゾロ 5倍・ゾロ目 3倍・シゴロ 2倍の負け／目なし 1倍・ヒフミ 2倍の勝ち。<br>最大で賭け金の5倍負けるので、所持KPは賭け金の5倍以上必要です。</p></details></div>${recent?`<div class="asset-list"><div class="asset-card"><h2 class="panel-title">最近の勝負</h2>${recent}</div></div>`:''}`;
}
const card=(c,i,side,stage)=>`<span class="playing-card ${c.s===1||c.s===2?'red':''} ${stage.phase==='dealing'&&stage.side===side&&stage.index===i?'dealt':''}" aria-label="${SUITS[c.s]} ${RANKS[c.r-1]}"><span class="card-corner">${RANKS[c.r-1]}<small>${SUITS[c.s]}</small></span><b class="card-suit">${SUITS[c.s]}</b><span class="card-corner bottom" aria-hidden="true">${RANKS[c.r-1]}<small>${SUITS[c.s]}</small></span></span>`;
const hidden='<span class="playing-card back" aria-label="次のカードはまだ配られていません"><span>K</span></span>';
const total=cards=>{if(!cards.length)return '—';const t=bjTotal(cards);return `${t.total}${t.soft&&t.total<21?' SOFT':''}`;};
const RESULTS={win:'勝ち',lose:'負け',push:'引き分け',bust:'バースト',blackjack:'ブラックジャック！','dealer-blackjack':'ディーラーのブラックジャック'};
const table=(dealer,player,showDealer,stage)=>`<div class="bj-table"><div class="bj-seat ${stage.side==='dealer'?'active':''}"><div class="bj-seat-label"><strong>ディーラー <small>HOUSE</small></strong><span class="bj-total">${total(dealer)}</span></div><div class="cards">${dealer.map((c,i)=>card(c,i,'dealer',stage)).join('')}${showDealer?'':hidden}</div></div><div class="bj-center" aria-hidden="true"><span>BLACKJACK</span><small>PAYS 3 : 2</small><i>♠</i></div><div class="bj-seat ${stage.side==='player'?'active':''}"><div class="bj-seat-label"><strong>あなた <small>PLAYER</small></strong><span class="bj-total ${bjTotal(player).total>21?'busted':''}">${total(player)}</span></div><div class="cards">${player.length?player.map((c,i)=>card(c,i,'player',stage)).join(''):hidden+hidden}</div></div></div>`;
export function blackjackView(state,stage={},busy=false){
 const hand=state.blackjack,last=state.bjHistory?.[0],shown=hand??last;
 const showDealer=!hand&&!!last;
 const canDouble=hand?.player.length===2&&!hand.doubled&&state.cash>=hand.bet;
 const arena=`<section class="casino-arena blackjack-arena ${last&&!hand?(last.net>0?'win':last.net<0?'lose':''):''}" aria-label="ブラックジャックのテーブル"><div class="casino-masthead"><span>KESO CARD ROOM</span></div>${status(stage,busy,hand?'ヒットかスタンドを選んでください':undefined)}${table(shown?.dealer??[],shown?.player??[],showDealer,stage)}${last&&!hand?resultBanner(RESULTS[last.result]??'勝負終了',last.net,stage,last.result==='blackjack'):`<div class="casino-table-hint">${hand?'BET　'+kp(hand.bet*(hand.doubled?2:1)):'ディーラーは17でスタンド'}</div>`}${hand?`<div class="bj-actions"><button class="action-btn primary" data-action="bj-hit" ${busy?'disabled':''}>ヒット<small>もう1枚</small></button><button class="action-btn" data-action="bj-stand" ${busy?'disabled':''}>スタンド<small>ここで勝負</small></button><button class="action-btn" data-action="bj-double" ${canDouble&&!busy?'':'disabled'}>ダブル<small>2倍で勝負</small></button></div>`:''}</section>`;
 if(hand)return arena;
 const recent=(state.bjHistory??[]).slice(1,6).map(r=>`<div class="history-entry"><div>${RESULTS[r.result]??r.result}（あなた ${bjTotal(r.player).total} / ディーラー ${bjTotal(r.dealer).total}）</div><div class="helper">${signed(r.net)}</div></div>`).join('');
 return `${arena}<div class="trade-box casino-controls"><h3>賭け金</h3><p class="helper">21に近い方が勝ち。ブラックジャックは2.5倍の払い戻し。</p>${stakeField('bj-amount')}<div class="action-row"><button class="action-btn primary casino-play" data-action="bj-start" ${busy?'disabled':''}>${busy?'配っています…':'カードを配る'} <span>↗</span></button></div><details class="rules"><summary>細かいルール</summary><p class="helper">勝ちは掛け金の2倍、最初の2枚で21なら2.5倍の払い戻し。カードは毎回52枚から引きます。ディーラーの2枚目は、あなたが止めた後に引きます。ディーラーはソフト17で止まります。ダブルは最初の2枚のときだけで、1枚だけ引いて止まります。スプリットはありません。ディーラーがブラックジャックのときは、ダブルで足した分は返ります。</p></details></div>${recent?`<div class="asset-list"><div class="asset-card"><h2 class="panel-title">最近の勝負</h2>${recent}</div></div>`:''}`;
}
