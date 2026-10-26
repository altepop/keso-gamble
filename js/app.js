import { fmt, fmt0 } from './format.js';
import { submitClaim, approveClaim, issueDirective, completeDirective } from './progression.js';
import { homeView, playView, directivesView } from './progression-views.js';
import { genCandles, movingAverage, svgCandles } from './charts.js';
import { MARKET, createInitialState, portfolioValue, assets, advanceMarket, trade, spin, grantDemoSalary, cryptoRouletteNumber } from './engine.js';
import { KEY, LEGACY_KEY } from './storage.js';
import { createStore } from './store.js';
const $=(s,el=document)=>el.querySelector(s);
let state;
let screen='home';
let activeSymbol=MARKET[0].id;
let tradeSide='buy';
let betType='red';
let rotation=0;
let spinLock=false;
let mutationPending=false;
let detail=null;
let showMA=true;

const app=$('#app');
const toastEl=document.createElement('div');toastEl.className='toast';toastEl.setAttribute('role','status');toastEl.setAttribute('aria-live','polite');document.body.appendChild(toastEl);

let sessionOnly=false;
const store = createStore({
  onChange(next) { state = next; },
  onVolatile() { sessionOnly=true; toast('端末に保存できません。この画面を閉じると変更が失われます'); }
});
state = store.state;
async function commit(update) {
  try { return await store.transact(update); }
  finally { state = store.state; }
}
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastEl._t);toastEl._t=setTimeout(()=>toastEl.classList.remove('show'),1800)}
function clsByChange(v){return v>0?'positive':v<0?'negative':'neutral'}
function arrow(v){return v>0?'↑':v<0?'↓':'→'}
function moneyCompact(n){return fmt0(Math.floor(n))+' KP'}

function playerRows(){
  return MARKET.map(s=>{
    const price=state.prices[s.id];
    const prev=(state.history[s.id].at(-2)??s.initialPrice);
    const diff=price-prev;const pct=(diff/prev)*100;
    return {id:s.id,name:s.name,code:s.ticker,value:price,change:diff,pct,time:'更新',country:'',holding:state.holdings[s.id],category:s.category};
  }).sort((a,b)=>b.value-a.value);
}

function renderRow(item){
  const changeClass=clsByChange(item.change);
  const sign=item.change>0?'+':'';
  return `<div class="row touch" role="button" tabindex="0" data-open="${item.id}" data-kind="${item.kind||'index'}">
    <div><div class="label">${item.country?`<span class="flag">${item.country}</span>`:''}${item.name}</div></div>
    <div>
      <div class="value ${changeClass}">${fmt(item.value)}</div>
      <span class="timestamp">${item.time}</span>
    </div>
    <div>
      <div class="arrow ${changeClass}">${arrow(item.change)}</div>
      <div class="delta ${changeClass}">${sign}${fmt(item.change)}<br>${sign}${fmt(item.pct)}%</div>
    </div>
  </div>`;
}

function screenMarket(){
 return `<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">KPで勝負</h1><span class="badge">${moneyCompact(state.cash)}</span></div></header><div class="sub-tabs"><button class="sub-tab active" data-screen="market">架空株</button><button class="sub-tab" data-screen="casino">カジノ</button></div><div class="market-disclaimer">架空の銘柄に投資するローカル市場。KPは増えることも、減ることもあります。実際の株価とは連動しません。</div><div class="list">${playerRows().map(v=>renderRow({...v,kind:'stock'})).join('')}</div><div class="action-row"><button class="action-btn primary" data-screen="assets">株を売買する</button></div><div class="panel"><div class="card-body"><h2 class="panel-title">勝負の種目</h2><p>架空株 / ルーレット</p><p class="helper">競馬・競輪・競艇などの公営競技型ゲームは今後の拡張候補です。</p></div></div>${bottomNav()}</div>`;
}

function tradeEstimate(){
  const qty=Number(drafts['trade-qty'] ?? 1);
  const price=state.prices[activeSymbol];
  const gross=qty*price,fee=Math.ceil(gross/100);
  if(!Number.isSafeInteger(qty)||qty<1||qty>100000||!Number.isSafeInteger(gross))return '数量は1〜100,000株の整数で入力してください';
  const total=tradeSide==='buy'?gross+fee:gross-fee;
  const enough=tradeSide==='buy'?total<=state.cash:qty<=state.holdings[activeSymbol];
  return `<div class="asset-line"><span>保有 / 保有KP</span><strong>${state.holdings[activeSymbol]}株 / ${moneyCompact(state.cash)}</strong></div><div class="asset-line"><span>手数料（1%）</span><strong>${moneyCompact(fee)}</strong></div><div class="asset-line"><span>${tradeSide==='buy'?'支払':'受取'}見込</span><strong>${moneyCompact(total)}</strong></div>${enough?'':'<p class="helper">'+(tradeSide==='buy'?'保有KP':'保有株数')+'が不足しています</p>'}<p class="helper">約定時の最新価格で計算します。</p>`;
}
function tradeHistory(){
  return `<div class="asset-card"><h2 class="panel-title">取引履歴</h2>${state.trades.length?state.trades.map(t=>`<div class="history-entry"><div>${MARKET.find(s=>s.id===t.symbol).name} ${t.side==='buy'?'買付':'売却'} ${fmt0(t.quantity)}株</div><div class="helper">${new Date(t.time).toLocaleString('ja-JP')} / 単価 ${moneyCompact(t.price)} / 手数料 ${moneyCompact(t.fee)}</div></div>`).join(''):'<p class="helper">まだ取引はありません。</p>'}</div>`;
}

function tradePanel(){
  const s=MARKET.find(v=>v.id===activeSymbol);
  return `<div class="trade-box"><h3>注文</h3><div class="segment"><button data-trade-side="buy" class="${tradeSide==='buy'?'active':''}">買う</button><button data-trade-side="sell" class="${tradeSide==='sell'?'active':''}">売る</button></div><div class="field"><label for="trade-symbol">銘柄</label><select class="select" id="trade-symbol">${MARKET.map(v=>`<option value="${v.id}" ${v.id===activeSymbol?'selected':''}>${v.name}</option>`).join('')}</select></div><div class="field"><label for="trade-qty">数量（株）</label><input id="trade-qty" class="input" type="number" min="1" max="100000" step="1" value="1"></div><div class="field"><label for="trade-price">現在値</label><input id="trade-price" class="input mono" value="${fmt0(state.prices[s.id])} KP" disabled></div><div class="card-body" id="trade-estimate" aria-live="polite">${tradeEstimate()}</div><div class="action-row"><button class="action-btn primary" data-action="trade">${tradeSide==='buy'?'買付':'売却'}</button></div></div>`;
}

function screenCasino(){
  const recent=state.spins[0];
  return `<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">ルーレット</h1><div class="small-actions"><span class="badge">所持 ${moneyCompact(state.cash)}</span></div></div></header><div class="sub-tabs"><button class="sub-tab" data-screen="market">架空株</button><button class="sub-tab active" data-screen="casino">カジノ</button></div><div class="center-panel"><div style="position:relative;width:min(320px,86vw);margin:0 auto 18px"><div class="pointer"></div><div class="roulette-board" id="wheel" style="transform:rotate(${rotation}deg)"><div class="roulette-center">${recent?recent.outcome:'K'}</div></div></div></div><div class="bet-grid">${[['red','赤'],['black','黒'],['even','偶数'],['odd','奇数'],['number','数字指定']].map(([id,label])=>`<button data-bet="${id}" class="${betType===id?'active':''}">${label}</button>`).join('')}</div><div class="trade-box"><h3>ベット</h3>${betType==='number'?`<div class="field"><label for="bet-number">数字（0〜36）</label><input id="bet-number" class="input" type="number" min="0" max="36" value="7"></div>`:''}<div class="field"><label for="bet-amount">賭け金</label><input id="bet-amount" class="input" type="number" min="100" max="20000" step="1" value="500"></div><div class="action-row"><button class="action-btn primary" data-action="spin" ${spinLock?'disabled':''}>ルーレットを回す</button></div></div><div class="result-panel"><p class="result-title ${recent && recent.payout>0?'negative':recent?'positive':''}">${recent ? (recent.payout>0?'的中':'不的中') : '直近結果'}</p><div class="helper">${recent ? `出目 ${recent.outcome} / 賭け ${moneyCompact(recent.amount)} / 払戻 ${moneyCompact(recent.payout)}` : 'まだ抽選履歴はありません。'}</div></div>${bottomNav()}</div>`;
}

function screenAssets(){
  return `<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">資産</h1><div class="small-actions"><button class="icon-btn" data-action="reset" aria-label="初期化">↺</button></div></div></header><div class="wallet-strip"><div class="wallet-item"><small>保有KP</small><strong>${moneyCompact(state.cash)}</strong></div><div class="wallet-item"><small>株式評価額</small><strong>${moneyCompact(portfolioValue(state))}</strong></div><div class="wallet-item"><small>純資産</small><strong>${moneyCompact(assets(state))}</strong></div></div><div class="market-disclaimer">端末内の仮想口座。通話時間計測・他ユーザーとの共有は未対応</div><details class="panel"><summary class="card-body">開発用：テストKPの補充</summary><div class="action-row"><button class="action-btn" data-action="salary">テスト用KP +600 KP</button></div></details><div class="asset-list"><div class="asset-card"><div class="panel-title" style="margin-bottom:10px">保有銘柄</div>${MARKET.map(s=>`<div class="asset-line"><span>${s.name}</span><strong>${state.holdings[s.id]}株 / ${moneyCompact(state.holdings[s.id]*state.prices[s.id])}</strong></div>`).join('')}</div>${tradePanel()}${tradeHistory()}</div>${bottomNav()}</div>`;
}

function bottomNav(){
  const items=[['home','⌂','ホーム'],['play','▶','稼ぐ'],['market','↗','勝負'],['directives','⚑','指令'],['assets','◈','資産']];
  return `<nav class="bottom-nav"><div class="bottom-inner">${items.map(([id,ico,label])=>`<button class="nav-btn ${(screen===id||(id==='market'&&screen==='casino'))?'active':''}" data-screen="${id}"><span class="ico">${ico}</span><span>${label}</span></button>`).join('')}</div></nav>`;
}

function openDetail(kind,id){detail={kind,id};render();$('#modal [data-close]')?.focus();}
function closeDetail(){const id=detail.id;detail=null;render();document.querySelector(`[data-open="${id}"]`)?.focus();}

function detailSheet(){
  if(!detail) return '';
  const s=MARKET.find(v=>v.id===detail.id);
  const item={name:s.name,value:state.prices[s.id],time:new Date().toLocaleDateString('ja-JP'),data:genCandles(state.prices[s.id],s.id)};
  const c=item.data.at(-1), ma5=movingAverage(item.data,5).at(-1), ma10=movingAverage(item.data,10).at(-1), ma25=movingAverage(item.data,25).at(-1);
  return `<div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div class="sheet"><div class="sheet-header"><h2 class="sheet-title" id="detail-title">${item.name}</h2><button class="icon-btn" data-close="1" aria-label="閉じる">×</button></div><div class="chart-toolbar"><span>日足（疑似データ）</span><button class="toolbar-chip" data-action="toggle-ma" aria-pressed="${showMA}">移動平均線 ${showMA?'表示中':'非表示'}</button></div><div class="chart-stats"><div class="stat">高値 <strong>${fmt(c.high)}</strong><br>安値 <strong>${fmt(c.low)}</strong></div><div class="stat">始値 <strong>${fmt(c.open)}</strong><br>終値 <strong>${fmt(c.close)}</strong></div><div class="stat">出来高 <strong>${fmt0(c.vol)}</strong><br>日時 <strong>${item.time}</strong></div></div><div class="chart-legend"><span class="legend-short">短期:${fmt(ma5)}</span><span class="legend-mid">中期:${fmt(ma10)}</span><span class="legend-long">長期:${fmt(ma25)}</span></div><div class="chart-note">表示価格・日足・移動平均線はデモ用の疑似データ</div><div class="candle-wrap"><div class="chart-panel">${svgCandles(item.data,660,560,showMA)}</div></div>${detail.kind==='stock' ? `<div class="depth-section"><div class="depth-head"><strong>板情報</strong><small>参考気配・疑似注文</small></div><div class="depth-label"><span>売数量</span><span>気配（KP）</span><span>買数量</span></div>${Array.from({length:7},(_,i)=>{const level=3-i;const price=Math.max(1,Math.round(item.value+level));const ask=level>0;const bid=level<0;const aVol=(31+i*13)%79+8,bVol=(43+i*17)%83+9;return `<div class="depth-row"><span class="ask">${ask?fmt0(aVol*10):''}</span><strong>${fmt0(price)}</strong><span class="bid">${bid?fmt0(bVol*10):''}</span></div>`}).join('')}</div><div class="action-row"><button class="action-btn primary" data-order-symbol="${detail.id}">この銘柄を注文</button></div>`:''}<div class="close-row"><button class="close-btn" data-close="1">閉じる</button></div></div></div>`;
}

function render(){
  const html = screen==='home'?homeView(state,bottomNav()):screen==='play'?playView(state,drafts,bottomNav()):screen==='directives'?directivesView(state,drafts,bottomNav()):screen==='market'?screenMarket():screen==='casino'?screenCasino():screenAssets();
  const openDetails=[...app.querySelectorAll('details')].map(el=>el.open);
  const focusedElement=document.activeElement;
  const focused=focusedElement?.id;
  const focusData=focusedElement && Object.entries(focusedElement.dataset).find(([key])=>['screen','marketTab','marketMode','tradeSide','bet','action','open'].includes(key));
  const warning=sessionOnly?'端末に保存できないため、この画面を閉じると変更が失われます。':!navigator.locks?.request?'このブラウザでは安全な保存を利用できません。HTTPS対応の最新ブラウザで開いてください。':'';
  app.innerHTML = html.replace('<div class="screen">','<div class="screen">'+(warning?`<div class="storage-warning" role="status">${warning}</div>`:'')) + detailSheet();
  app.querySelectorAll('details').forEach((el,index)=>{el.open=openDetails[index]??false;});
  for (const [id,value] of Object.entries(drafts)) { const input=document.getElementById(id); if(input) input.value=value; }
  if(focused) document.getElementById(focused)?.focus();
  else if(focusData){const [key,value]=focusData;const match=[...app.querySelectorAll('button,[data-open]')].find(el=>el.dataset[key]===value);match?.focus();}
  if(detail) $('.screen').inert=true;
  document.body.style.overflow=detail?'hidden':'';
}

async function doTrade(){
  const symbol=$('#trade-symbol')?.value || activeSymbol; const qty=Number($('#trade-qty')?.value);
  const side=tradeSide;
  activeSymbol=symbol; await commit(next => trade(next,symbol,side,qty)); render(); toast(`${MARKET.find(v=>v.id===symbol).name}を${side==='buy'?'買付':'売却'}した`);
}
async function doSpin(){
  if(spinLock) return;
  const amount=Number($('#bet-amount')?.value);
  const choice=betType==='number'?($('#bet-number')?.value === '' ? NaN : Number($('#bet-number')?.value)):0;
  if(!Number.isSafeInteger(amount) || amount<100 || amount>20000 || amount>state.cash) throw new Error('賭け額は100〜20,000 KP（所持金以内）');
  if(betType==='number' && (!Number.isInteger(choice)||choice<0||choice>36)) throw new Error('数字は0〜36で指定');
  const lockedType=betType;
  const outcome=cryptoRouletteNumber();
  spinLock=true;
  let result;
  try { result=await commit(next => spin(next,lockedType,amount,choice,outcome)); }
  catch(error) { spinLock=false; throw error; }
  const wheel=$('#wheel');
  const button=$('[data-action="spin"]'); if(button) button.disabled=true;
  rotation += 1440 + Math.floor(Math.random()*360);
  if(wheel) {wheel.style.transition='transform 1.8s cubic-bezier(.15,.82,.14,1)';wheel.style.transform=`rotate(${rotation}deg)`;}
  setTimeout(()=>{try{
      const r=result;
      spinLock=false; render(); toast(r.payout>0?`的中 ${moneyCompact(r.payout)}`:`出目 ${r.outcome}`);
    }catch(err){spinLock=false;render();toast(err.message)}
  },1800);
}

addEventListener('click',async e=>{
  const t=e.target.closest?.('button,[data-open]'); if(!t) return;
  const mutates=!!t.dataset.approve || !!t.dataset.complete || ['salary','trade','spin','reset','submit-claim','issue-directive'].includes(t.dataset.action);
  if(mutates && mutationPending)return;
  if(mutates)mutationPending=true;
  try{
    if(t.dataset.screen){if(spinLock){toast('抽選中は画面を切り替えられません');return;}detail=null;screen=t.dataset.screen;render();return;}
    if(t.dataset.open){openDetail(t.dataset.kind,t.dataset.open);return;}
    if(t.dataset.orderSymbol){activeSymbol=t.dataset.orderSymbol;detail=null;screen='assets';render();return;}
    if(t.dataset.close){closeDetail();return;}
    if(t.dataset.action==='toggle-ma'){showMA=!showMA;render();$('[data-action="toggle-ma"]')?.focus();return;}
    if(t.dataset.tradeSide){tradeSide=t.dataset.tradeSide;render();return;}
    if(t.dataset.bet){if(spinLock)return;betType=t.dataset.bet;render();return;}
    if(t.dataset.action==='submit-claim'){
      const data={activity:$('#claim-activity').value,reference:$('#claim-reference').value,game:$('#claim-game')?.value,achievement:$('#claim-achievement')?.value};
      await commit(next=>submitClaim(next,data));delete drafts['claim-reference'];render();toast('確認待ちに追加しました。まだKPは支給されません');return;
    }
    if(t.dataset.approve){const reward=await commit(next=>approveClaim(next,Number(t.dataset.approve)));render();toast(`デモ確認：+${moneyCompact(reward)}`);return;}
    if(t.dataset.action==='issue-directive'){
      const data={target:$('#directive-target').value,task:$('#directive-task').value,game:$('#directive-game')?.value,achievement:$('#directive-achievement')?.value};
      await commit(next=>issueDirective(next,data));render();toast('デモ指令を発行しました（外部送信なし）');return;
    }
    if(t.dataset.complete){await commit(next=>completeDirective(next,Number(t.dataset.complete)));render();toast('デモで達成済みにしました');return;}
    if(t.dataset.action==='salary'){await commit(next => grantDemoSalary(next));render();toast('テスト用KP +600 KP');return;}
    if(t.dataset.action==='trade'){await doTrade();return;}
    if(t.dataset.action==='spin'){await doSpin();return;}
    if(t.dataset.action==='reset'){if(confirm('データを初期化しますか？')){await commit(next => Object.assign(next,createInitialState()));for(const key of Object.keys(drafts))delete drafts[key];render();toast('初期化した')}return;}

  }catch(err){render();toast(err.message||'操作に失敗した');}
  finally { if(mutates)mutationPending=false; }
});

addEventListener('change',e=>{
 if(e.target.id==='trade-symbol'){activeSymbol=e.target.value;render();}
 if(['claim-activity','directive-task','directive-target'].includes(e.target.id)){drafts[e.target.id]=e.target.value;render();}
})
// Preserve drafts and focus across quote refreshes and tab/side changes.
addEventListener('keydown', e => {
  if (detail) {
    if(e.key==='Escape'){e.preventDefault();closeDetail();return;}
    if(e.key==='Tab'){
      const controls=[...$('#modal').querySelectorAll('button:not(:disabled),select,input,[tabindex="0"]')];
      const first=controls[0],last=controls.at(-1);
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
    }
  } else if(e.target.matches?.('[data-open]') && ['Enter',' '].includes(e.key)){
    e.preventDefault();e.target.click();
  }
});
addEventListener('input', e => {
  if (['trade-qty','bet-amount','bet-number'].includes(e.target.id)||e.target.id.startsWith('claim-')||e.target.id.startsWith('directive-')) drafts[e.target.id] = e.target.value;
  if(e.target.id==='trade-qty')$('#trade-estimate').innerHTML=tradeEstimate();
});
const drafts = {};
async function refreshMarket() {
  if(spinLock) return;
  try { const steps=await commit(next => advanceMarket(next)); if(steps && !detail)render(); }
  catch(error) { toast(error.message); }
}
addEventListener('storage', e => {
  if(e.key === null || [KEY,LEGACY_KEY].includes(e.key)) {
    store.refresh();
    if(!spinLock && !detail)render();
  }
});
addEventListener('visibilitychange', () => { if(!document.hidden)refreshMarket(); });
setInterval(refreshMarket,15000);
render();
refreshMarket();
