import { CASINO_MIN, CASINO_MAX, RANKS, SUITS } from './casino.js?v=web-fbdbe83640a6b754';
import { MINES_CELLS, MINES_CHOICES, MINES_CAP, minesMultiplier, SLOT_SYMBOLS, JACKPOT_PERCENT, JACKPOT_FULL_BET, VP_PAYS, VP_NAMES, BACCARAT_SIDES } from './casino-more.js?v=web-fbdbe83640a6b754';
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
export function slotView(state,{busy=false,jackpot=null,drafts={}}={}){
 const last=state.slots?.[0];
 const reels=(busy||!last?['seven','seven','seven']:last.reels).map((r,i)=>`<span class="slot-reel ${busy?'spinning':''}" style="--reel:${i}" ${busy?'aria-hidden="true"':`role="img" aria-label="${SYMBOL[r]}"`}><b>${SYMBOL[r]}</b></span>`).join('');
 const pool=jackpot?`<div class="slot-jackpot"><span>みんなの共有ジャックポット</span><strong>${kp(jackpot.amount)}</strong><small>賭け金の${JACKPOT_PERCENT}%が積み上がる · 💎💎💎で獲得（${JACKPOT_FULL_BET.toLocaleString('ja-JP')} KP以上の賭けで全額）</small></div>`:'<div class="slot-jackpot demo"><span>共有ジャックポットは本番口座だけ</span></div>';
 const label=last&&!busy?(last.jackpot?`ジャックポット ${kp(last.jackpot)}！`:last.payout?'当たり':'はずれ'):'';
 const arena=`<section class="casino-arena slot-arena ${last&&!busy?(last.net>0?'win':'lose'):''}" aria-label="スロット"><div class="casino-masthead"><span>KESO SLOTS</span></div>${pool}<div class="slot-window">${reels}</div>${label?verdict(label,last.net):`<div class="casino-stage-status" role="status">${busy?'回転中…':'賭け金を入れて回す'}</div>`}</section>`;
 const table=`<div class="asset-card"><h2 class="panel-title">配当（賭け金込み）</h2>${SLOT_SYMBOLS.slice().reverse().map(([id,face,,pay])=>`<div class="asset-line"><span>${face}${face}${face}</span><strong>${pay}倍${id==='diamond'?'＋ジャックポット':''}</strong></div>`).join('')}<div class="asset-line"><span>🍒が2つ</span><strong>1.5倍</strong></div></div>`;
 return `${arena}<div class="trade-box casino-controls">${stakeField('slot-amount',draft(drafts,'slot-amount',500))}<div class="action-row"><button class="action-btn primary casino-play" data-action="slot" ${busy?'disabled':''}>${busy?'回転中…':'回す'} <span>↗</span></button></div></div>${table}`;
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
