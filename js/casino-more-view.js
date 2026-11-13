import { CASINO_MIN, CASINO_MAX, RANKS, SUITS } from './casino.js?v=web-332712cc932d20c7';
import {templeRespinScene,templeWinBackdrop} from './slot-temple-view.js?v=web-332712cc932d20c7';
import { MINES_CELLS, MINES_CHOICES, MINES_CAP, minesMultiplier, SLOT_SYMBOLS, slotWinTier, JACKPOT_PERCENT, JACKPOT_FULL_BET, VP_PAYS, VP_NAMES, BACCARAT_SIDES } from './casino-more.js?v=web-332712cc932d20c7';
// Screens for マインズ・スロット・ビデオポーカー・バカラ. They only show what the wallet already holds; every draw and
// payout is decided by casino-more.js (the server's for live wallets).
const kp=n=>Math.abs(n).toLocaleString('ja-JP')+' KP';
const signed=n=>(n>0?'+':n<0?'−':'±')+kp(n);
const stakeField=(id,value=500)=>`<div class="field"><label for="${id}">賭け金（${CASINO_MIN}〜${CASINO_MAX.toLocaleString('ja-JP')} KP）</label><input id="${id}" class="input" type="number" min="${CASINO_MIN}" max="${CASINO_MAX}" step="100" value="${value}" inputmode="numeric"></div>`;
const verdict=(label,net)=>`<div role="status" class="casino-verdict ${net>0?'won':net<0?'lost':'draw'}"><span class="verdict-label">${label}</span><strong class="casino-net">${signed(net)}</strong></div>`;
const card=c=>`<span class="playing-card ${c.s===1||c.s===2?'red':''}" aria-label="${SUITS[c.s]} ${RANKS[c.r-1]}"><span class="card-corner">${RANKS[c.r-1]}<small>${SUITS[c.s]}</small></span><b class="card-suit">${SUITS[c.s]}</b><span class="card-corner bottom" aria-hidden="true">${RANKS[c.r-1]}<small>${SUITS[c.s]}</small></span></span>`;
const recentList=(rows,line)=>rows.length?`<div class="asset-card"><h2 class="panel-title">最近の勝負</h2>${rows.map(r=>`<div class="history-entry"><div>${line(r)}</div><div class="helper">${signed(r.net)}</div></div>`).join('')}</div>`:'';
const draft=(drafts,id,value)=>drafts?.[id]??value;

export function minesView(state,{busy=false,count=3,drafts={}}={}){
 const g=state.mines,last=!g?state.minesHistory?.[0]:null;
 const opened=new Set(g?.opened??last?.opened??[]),bombs=new Set(last?.bombs??[]);
 const cells=Array.from({length:MINES_CELLS},(_,i)=>{
  const isOpen=opened.has(i),isBomb=bombs.has(i);
  const face=isOpen?'💎':isBomb?'💣':'';
  return g&&!isOpen?`<button class="mines-cell" data-action="mines-pick" data-cell="${i}" aria-label="${i+1}番のマスを開ける" ${busy?'disabled':''}></button>`
   :`<span class="mines-cell ${isOpen?'safe':''} ${isBomb?'bomb':''}" role="img" aria-label="${isOpen?'安全':isBomb?'地雷':'未開封'}">${face}</span>`;
 }).join('');
 const now=g?minesMultiplier(g.mines,g.opened.length):0,next=g?minesMultiplier(g.mines,g.opened.length+1):0;
 const info=g?`<div class="mines-info"><span>地雷 ${g.mines}個 · ${g.opened.length}マス</span><strong>${g.opened.length?`${now}倍 = ${kp(Math.floor(g.bet*now))}`:`次は ${next}倍`}</strong></div>`:'';
 const arena=`<section class="casino-arena mines-arena ${last?(last.net>0?'win':'lose'):''}" aria-label="マインズ"><div class="casino-masthead"><span>KESO MINES</span>${g?`<span>BET ${kp(g.bet)}</span>`:''}</div>${info}<div class="mines-grid">${cells}</div>${last?verdict(last.net>0?`${last.multiplier}倍で降りた`:'地雷を踏んだ',last.net):''}</section>`;
 if(g)return `${arena}<div class="trade-box casino-controls"><p class="helper">開けるほど倍率が上がる。地雷を踏むと賭け金を失う。最大${MINES_CAP}倍で自動的に降ります。</p><div class="action-row"><button class="action-btn primary" data-action="mines-cashout" ${busy||!g.opened.length?'disabled':''}>${g.opened.length?`${kp(Math.floor(g.bet*now))} で降りる`:'まず1マス開ける'}</button></div></div>`;
 const choice=`<div class="segment mines-count" role="radiogroup" aria-label="地雷の数">${MINES_CHOICES.map(n=>`<button role="radio" data-mines-count="${n}" class="${n===count?'active':''}" aria-checked="${n===count}">${n}個</button>`).join('')}</div>`;
 return `${arena}<div class="trade-box casino-controls"><h3>賭け金と地雷の数</h3><p class="helper">5×5のマスに地雷。安全なマスを開けるほど倍率が上がり、いつでも降りられる。地雷が多いほど一気に増える。</p>${stakeField('mines-amount',draft(drafts,'mines-amount',500))}${choice}<div class="action-row"><button class="action-btn primary casino-play" data-action="mines-start" ${busy?'disabled':''}>はじめる <span>↗</span></button></div></div>${recentList((state.minesHistory??[]).slice(last?1:0,6),r=>`地雷${r.mines}個 · ${r.net>0?`${r.multiplier}倍で降りた`:`${r.opened.length}マス目で爆発`}`)}`;
}

const SYMBOL=Object.fromEntries(SLOT_SYMBOLS.map(([id,face])=>[id,face]));
const slotMultiplier=r=>r?.bet>0?Math.floor(r.payout/r.bet*10)/10:0;
const slotDust=Array.from({length:38},(_,i)=>`<i style="--i:${i};--x:${(i*47)%100}%;--d:${(i*13)%22/10}s"></i>`).join('');
const slotPrize=amount=>Math.round(amount).toLocaleString('ja-JP');
export function slotCeremony(reveal){
 if(!reveal?.done)return '';
 const {done}=reveal,tier=slotWinTier(done)||(done.bonus?.mode==='respin'?'feature':'big');
 const stars=`<div class="slot-confetti" aria-hidden="true">${slotDust}</div>`;
 const close='<button class="slot-close" type="button" data-action="slot-close-reveal" aria-label="演出を閉じる">×</button>';
 if(reveal.type==='bonus'&&done.bonus?.mode==='respin')return templeRespinScene(reveal);
 if(reveal.type==='bonus'){
  const picks=reveal.picks??[],finished=picks.length>=3;
  const doors=[0,1,2].map(i=>{
   const pick=picks.find(p=>p.door===i);
   return `<button class="slot-altar ${pick?'opened':''}" data-action="slot-open-altar" data-altar="${i}" type="button" ${pick||finished?'disabled':''} aria-label="祭壇${i+1}${pick?' 解放済み':''}"><span class="slot-altar-crown">☀</span><span class="slot-altar-number">${pick?slotPrize(pick.award)+'×':'?'}</span><small>${pick?'DISCOVERED':'ALTAR '+(i+1)}</small></button>`;
  }).join('');
  const current=picks.reduce((sum,p)=>sum+p.award,0);
  return `<div class="slot-ceremony slot-temple-scene" role="dialog" aria-modal="true" aria-label="黄金神殿ボーナス">
    ${stars}${close}<div class="slot-sun" aria-hidden="true">☀</div>
    <div class="slot-temple-arch"><div class="slot-temple-kicker">KESO GOLDEN TEMPLE</div><div class="slot-temple-figure" aria-hidden="true">𓂀</div>
    <h2>${finished?'BONUS COMPLETE':'TEMPLE BONUS'}</h2><p>${finished?'すべての祭壇が解放された！':'神殿の祭壇をひとつずつ開けよう'}</p>
    <div class="slot-altar-grid">${doors}</div><div class="slot-temple-total"><small>DISCOVERED</small><strong>${slotPrize(current)}<em>×</em></strong><span>${picks.length} / 3 祭壇</span></div>
    ${finished?'<button type="button" class="slot-ritual-button" data-action="slot-finish-bonus">黄金の祝福を見る ✦</button>':'<p class="slot-temple-note">報酬はスピン時に確定済み。祭壇の選択は演出のみだ。</p>'}</div></div>`;
 }
 const gold=tier==='golden',mega=tier==='mega'||gold;
 const stages=`<div class="slot-win-stages ${tier}">
   ${tier==='feature'?'<div class="slot-win-stage stage-feature">FEATURE WIN</div>':'<div class="slot-win-stage stage-big">BIG WIN</div>'}
   ${mega?'<div class="slot-win-stage stage-mega">MEGA WIN</div>':''}
   ${gold?'<div class="slot-win-stage stage-golden">GOLDEN WIN</div>':''}
  </div>`;
 return `<div class="slot-ceremony slot-win-scene tier-${tier} ${done.bonus?.mode==='respin'?'from-temple':''}" role="dialog" aria-modal="true" aria-label="大当たり！${tier.toUpperCase()} WIN">
    ${templeWinBackdrop(done)}${stars}${close}<div class="slot-win-halo" aria-hidden="true"><div class="slot-win-crown">♛</div></div>
    <div class="slot-win-content"><div class="slot-win-eyebrow">✦ KESO GRAND CELEBRATION ✦</div>${stages}
    <div class="slot-win-amount"><span data-slot-countup="${done.payout}">${slotPrize(done.payout)}</span><small>KP</small></div>
    <p class="slot-win-multiple">${slotMultiplier(done)}× PAYOUT ${done.bonus?'· TEMPLE BONUS':''}${done.jackpot?' · JACKPOT':''}</p>
    <button type="button" class="slot-ritual-button" data-action="slot-close-reveal">次のスピンへ ›</button></div></div>`;
}
export function slotView(state,{busy=false,jackpot=null,drafts={},reveal=null}={}){
 const last=state.slots?.[0],tier=!busy?slotWinTier(last):null;
 const reels=(busy?['cherry','lemon','bell']:last?.reels??['star','seven','diamond']).map((r,i)=>`<span class="slot-reel ${busy?'spinning':''} ${last&&!busy&&last.reels.every(x=>x===r)?'slot-matched':''}" style="--reel:${i}" ${busy?'aria-hidden="true"':`role="img" aria-label="${SYMBOL[r]}"`}><b>${busy?'<span class="slot-spin-strip">🍒<br>🔔<br>7️⃣<br>💎<br>⭐<br>🍋<br>🍒<br>🔔</span>':SYMBOL[r]}</b></span>`).join('');
 const pool=jackpot?`<div class="slot-jackpot"><span>◆ COMMUNITY JACKPOT ◆</span><strong>${kp(jackpot.amount)}</strong><small>賭け金の${JACKPOT_PERCENT}%を積立 · 💎💎💎 で獲得（${JACKPOT_FULL_BET.toLocaleString('ja-JP')} KP以上の賭けで全額）</small></div>`:'<div class="slot-jackpot demo"><span>◆ JACKPOT は本番口座限定 ◆</span></div>';
 const label=last&&!busy?(last.bonus?`黄金神殿の祝福 +${kp(last.bonus.total)}`:last.jackpot?`ジャックポット ${kp(last.jackpot)}！`:last.payout?'当たり':'はずれ'):'';
 const arena=`<section class="casino-arena slot-arena slot-premium ${last&&!busy?(last.net>0?'win':'lose'):''}" aria-label="KESO黄金スロット"><div class="casino-masthead"><span>KESO GOLDEN VAULT</span><span class="slot-mast-light">✦ ✦ ✦</span></div>
 <div class="slot-marquee"><span>★</span><strong>GOLDEN VAULT</strong><span>★</span><small>FORTUNE · TEMPLE · JACKPOT</small></div>
 ${pool}<div class="slot-machine"><div class="slot-machine-top">✧ ✦ ✧　 GOLD REELS 　✧ ✦ ✧</div><div class="slot-window">${reels}</div><div class="slot-machine-bottom"><span>✦</span><span>✦</span><span>✦</span><span>✦</span><span>✦</span></div></div>
 ${tier&&last&&!busy?`<div class="slot-tier-flag flag-${tier}">${tier.toUpperCase()} WIN <span>· ${slotMultiplier(last)}×</span></div>`:''}
 ${label?verdict(label,last.net):`<div class="casino-stage-status" role="status">${busy?'運命のリールが回転中…':'賭け金を入れて黄金を狙え！'}</div>`}
 ${slotCeremony(reveal)}</section>`;
 const table=`<div class="asset-card slot-paytable"><h2 class="panel-title">配当・神殿フィーチャー</h2><div class="slot-feature-card"><strong>💎💎 ＋ 任意の絵柄 → 黄金神殿ボーナス</strong><span>5列×3段の黄金コインを固定して空きマスだけを再抽選。新しいコインで残り3回に回復、0回で精算。15マス全部埋まると特等賞200倍！（その回の払戻総額）</span></div>${SLOT_SYMBOLS.slice().reverse().map(([id,face,,pay])=>`<div class="asset-line"><span>${face}${face}${face}</span><strong>${pay}倍${id==='diamond'?'＋ジャックポット':''}</strong></div>`).join('')}<div class="asset-line"><span>🍒が2つ</span><strong>1.5倍</strong></div><p class="helper">BIG WIN（5倍〜）／MEGA WIN（10倍〜）／GOLDEN WIN（40倍〜）。倍率は掛け金に対する払戻総額で判定。黄金神殿の結果もサーバー側の元のスピンで確定し、再抽選演出で追加決済は発生しない。</p></div>`;
 return `${arena}<div class="trade-box casino-controls">${stakeField('slot-amount',draft(drafts,'slot-amount',500))}<div class="action-row"><button class="action-btn primary casino-play slot-pull" data-action="slot" ${busy||!!reveal?'disabled':''}>${busy?'リール回転中…':reveal?'演出を確認中…':'⚡ SPIN — 黄金を解き放て'} <span>↗</span></button></div></div>${table}`;
}
export function videoPokerView(state,{busy=false,hold=[],drafts={}}={}){
 const h=state.vp,last=!h?state.vpHistory?.[0]:null,shown=h?.cards??last?.cards??[];
 const cards=shown.map((c,i)=>h?`<button class="vp-card ${hold[i]?'held':''}" data-vp-hold="${i}" aria-pressed="${!!hold[i]}" ${busy?'disabled':''}>${card(c)}<span>${hold[i]?'HOLD':'交換'}</span></button>`:`<span class="vp-card">${card(c)}</span>`).join('');
 const arena=`<section class="casino-arena vp-arena ${last?(last.net>0?'win':last.net<0?'lose':''):''}" aria-label="ビデオポーカー"><div class="casino-masthead"><span>KESO POKER</span>${h?`<span>BET ${kp(h.bet)}</span>`:''}</div><div class="vp-hand">${cards||'<p class="helper">カードを配ると5枚並びます</p>'}</div>${last?verdict(VP_NAMES[last.hand],last.net):h?'<div class="casino-stage-status" role="status">残すカードをタップして「交換する」</div>':''}</section>`;
 const table=`<div class="asset-card"><h2 class="panel-title">配当（賭け金込み）</h2>${Object.entries(VP_PAYS).filter(([,p])=>p).map(([k,p])=>`<div class="asset-line"><span>${VP_NAMES[k]}</span><strong>${p}倍</strong></div>`).join('')}</div>`;
 if(h)return `${arena}<div class="trade-box casino-controls"><div class="action-row"><button class="action-btn primary" data-action="vp-draw" ${busy?'disabled':''}>交換する <span>↗</span></button></div></div>${table}`;
 return `${arena}<div class="trade-box casino-controls"><p class="helper">5枚から残すカードを選んで1回だけ交換。ジャック以上のワンペアから払い戻し。</p>${stakeField('vp-amount',draft(drafts,'vp-amount',500))}<div class="action-row"><button class="action-btn primary casino-play" data-action="vp-deal" ${busy?'disabled':''}>配る <span>↗</span></button></div></div>${table}`;
}

export function baccaratView(state,{busy=false,drafts={}}={}){
 const last=state.baccarat?.[0];
 const side=(who,cards,points,win)=>`<div class="bac-side ${win?'won':''}"><div class="bj-seat-label"><strong>${BACCARAT_SIDES[who]}</strong><span class="bj-total">${points??'—'}</span></div><div class="cards">${(cards??[]).map(card).join('')}</div></div>`;
 const arena=`<section class="casino-arena baccarat-arena ${last&&!busy?(last.net>0?'win':last.net<0?'lose':''):''}" aria-label="バカラ"><div class="casino-masthead"><span>KESO BACCARAT</span>${last&&!busy?`<span>${BACCARAT_SIDES[last.side]}に ${kp(last.bet)}</span>`:''}</div>${busy?'<div class="casino-stage-status" role="status">配っています…</div>':''}<div class="bac-table">${side('player',busy?[]:last?.player,busy?null:last?.points.player,!busy&&last?.winner==='player')}${side('banker',busy?[]:last?.banker,busy?null:last?.points.banker,!busy&&last?.winner==='banker')}</div>${last&&!busy?verdict(`${BACCARAT_SIDES[last.winner]}${last.winner==='tie'?'':'の勝ち'}`,last.net):''}</section>`;
 return `${arena}<div class="trade-box casino-controls"><p class="helper">9に近い方が勝ち。プレイヤー2倍・バンカー1.95倍・引き分け9倍（引き分けのときプレイヤー・バンカーへの賭けは返金）。</p>${stakeField('baccarat-amount',draft(drafts,'baccarat-amount',500))}<div class="bj-actions">${Object.entries(BACCARAT_SIDES).map(([id,label])=>`<button class="action-btn ${id==='tie'?'':'primary'}" data-action="baccarat" data-side="${id}" ${busy?'disabled':''}>${label}</button>`).join('')}</div></div>${recentList((state.baccarat??[]).slice(1,6),r=>`${BACCARAT_SIDES[r.side]}に賭け · ${r.points.player}対${r.points.banker}`)}`;
}
