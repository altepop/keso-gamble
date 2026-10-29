import {privateCasinoPanel} from './private-casino-view.js?v=web-655e63d5d0bc71e1';
import {communityPanel,communityRows} from './community-feed.js?v=web-655e63d5d0bc71e1';
import {stockPanel,stockCandles,stockPrice} from './stock-view.js?v=web-655e63d5d0bc71e1';
import {wheelView,covered,redNumbers,outcomeAngle} from './roulette-view.js?v=web-655e63d5d0bc71e1';
import {connectDiscordActivity,isDiscordActivity}from './discord-activity-auth.js?v=web-655e63d5d0bc71e1';
import { createKpClient } from './kp-client.js?v=web-655e63d5d0bc71e1';
import { fmt, fmt0 } from './format.js?v=web-655e63d5d0bc71e1';
import { submitClaim, approveClaim, issueDirective, completeDirective } from './progression.js?v=web-655e63d5d0bc71e1';
import { titleView, homeView, playView, directivesView, escapeHTML } from './progression-views.js?v=web-655e63d5d0bc71e1';
import { genCandles, movingAverage, svgCandles } from './charts.js?v=web-655e63d5d0bc71e1';
import { MARKET, createInitialState, portfolioValue, assets, advanceMarket, trade, spin, spinNumbers, validateNumberBets, grantDemoSalary, cryptoRouletteNumber } from './engine.js?v=web-655e63d5d0bc71e1';
import { KEY, LEGACY_KEY } from './storage.js?v=web-655e63d5d0bc71e1';
import { PUBLIC_SALT, RUN_MS, WEEKLY_LIMIT, openRaceStart, latestRaceStart, raceCard, raceOdds, raceResult, raceTimeline, raceCommentary, raceRuns, placeRaceBet, settleRaceBets, weeklySpent } from './racing.js?v=web-655e63d5d0bc71e1';
import { LUXURY } from './luxury.js?v=web-655e63d5d0bc71e1';
import { raceScreen, racePreview, drawRace, raceElapsed, ownerPanel, luxuryPanel, roastPanel } from './racing-view.js?v=web-655e63d5d0bc71e1';
import { createStore } from './store.js?v=web-655e63d5d0bc71e1';
import { healthPanel } from './health-view.js?v=web-655e63d5d0bc71e1';
import { trendPanel } from './trend-view.js?v=web-655e63d5d0bc71e1';
import { mleagueScreen, mleaguePreview } from './mleague-view.js?v=web-655e63d5d0bc71e1';
import { gamePicker, chinchiroView, blackjackView } from './casino-view.js?v=web-655e63d5d0bc71e1';
import {casinoFrames} from './casino-animation.js?v=web-655e63d5d0bc71e1';
import { playChinchiro, bjStart, bjHit, bjStand, bjDouble, cryptoDie, cryptoCard, cryptoInt } from './casino.js?v=web-655e63d5d0bc71e1';
import { minesStart, minesPick, minesCashout, playSlot, vpDeal, vpDraw, playBaccarat, VP_NAMES } from './casino-more.js?v=web-655e63d5d0bc71e1';
import { minesView, slotView, videoPokerView, baccaratView } from './casino-more-view.js?v=web-655e63d5d0bc71e1';
const $=(s,el=document)=>el.querySelector(s);
const wallet=createKpClient();
const embedded=isDiscordActivity();
document.documentElement.classList.toggle('discord-activity',embedded);
let autoState=embedded?'loading':'idle';
let autoMessage='';
let live=wallet.connected&&!embedded;
let connectionError=live?'口座を読み込んでいます…':'';
let state;
let screen='title';
let activeSymbol=MARKET[0].id;
let tradeSide='buy';
let betType='red';
let betNumber=7;
const numberBets=new Map();
const numberSelected=n=>betType==='number'?numberBets.has(n):covered(betType,betNumber,n);

let rotation=0;
let spinLock=false;
let mutationPending=false;
let detail=null;
let showMA=true;
let renderedMarkup;

const app=$('#app');
const toastEl=document.createElement('div');toastEl.className='toast';toastEl.setAttribute('role','status');toastEl.setAttribute('aria-live','polite');document.body.appendChild(toastEl);

let sessionOnly=false;
const store = createStore({
  onChange(next) { if(!live)state = next; },
  onVolatile() { sessionOnly=true; toast('端末に保存できません。この画面を閉じると変更が失われます'); }
});
state = live?{...createInitialState(),cash:0,serverWallet:true}:store.state;
async function commit(update) {
  if(live)throw Error('本番口座ではこの操作は使えません。');
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

// Bottom tabs and the screens under each. 遊ぶ = 競馬・カジノ・株、使う = 指名・馬主・高級品.
const GROUPS={race:[['race','競馬'],['mleague','Mリーグ'],['casino','カジノ'],['market','株']],directives:[['directives','指名'],['stable','馬主'],['shop','高級品']]};
const groupOf=id=>Object.keys(GROUPS).find(g=>GROUPS[g].some(([s])=>s===id))??id;
function tabsFor(group){return `<div class="sub-tabs">${GROUPS[group].map(([id,label])=>`<button class="sub-tab ${screen===id?'active':''}" data-screen="${id}">${label}</button>`).join('')}</div>`;}
function subTabs(){return tabsFor('race');}

// Race playback state. The card, result and odds are pure functions of the race start time.
let raceDraft={type:'win',horse:null};
// Mリーグ: the chosen game and player, and whether the confirmation is showing.
let mlDraft={match:null,player:null,confirm:false};
// 資産 → システムの状態, loaded only when asked for.
let health=null,healthLoading=false,healthError='';
// メンバーのKP推移 (資産): loaded when the screen opens; sort, highlight and the tapped day are view-only.
let trend=null,trendView={loading:false,error:'',days:7,sort:'now',dir:1,focus:null,day:null};
async function loadTrend(days=trendView.days){
  if(!live||trendView.loading)return;
  trendView={...trendView,loading:true,error:'',days};if(trend&&trend.days.length!==days)trend=null;render();
  try{trend=await wallet.trend(days);if(!trend.members.some(m=>m.id===trendView.focus))trendView.focus=null;trendView.day=null;}catch(error){trendView.error=error.message||'推移を読み込めませんでした';}
  finally{trendView.loading=false;render();}
}
let raceLoop=0;
let raceShown='';
let raceSettling=false;
const reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
const raceBets=()=>({raceBets:state.raceBets??[]});
// Live wallets: the server decides whether the race runs and reveals its seed after the start.
function liveRace(id){const w=state.racing?.watch;return w?.id===id?w:null;}
function raceWatch(now,id){
  const info=live?liveRace(id):null,card={...raceCard(id,PUBLIC_SALT,info?.entries??[]),...(info?.crown?{name:info.crown}:{})};
  if(live&&(!info||(info.runs&&!info.seed)))return {card,runs:false,loading:true};
  if(!(live?info.runs:raceRuns(card,raceBets())))return {card,runs:false};
  const seed=live?info.seed:PUBLIC_SALT,result=raceResult(card,seed),odds=raceOdds(card),timeline=raceTimeline(card,result,seed);
  const watch={card,runs:true,result,odds,timeline,commentary:raceCommentary(card,result,timeline,odds,seed),finished:now>=card.start+RUN_MS,hash:info?.hash};
  if(info)verifySeed(watch,seed,info.hash);
  return watch;
}
// Anyone can check that the revealed seed is the one committed before betting closed.
async function verifySeed(watch,seed,hash){
  try{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(seed));watch.verified=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')===hash;}
  catch{watch.verified=false;}
  if(watchCache===watch)render();
}
let watchCache=null,watchKey='';
function currentWatch(now){
  const id=latestRaceStart(now),info=live?liveRace(id):null;
  const key=`${id}:${live?`${info?.runs}:${info?.seed}:${info?.hash}:${info?.crown}:${(info?.entries??[]).map(e=>e.horseId)}`:raceRuns({id,big:false},raceBets())}:${now>=id+RUN_MS}`;
  if(key!==watchKey){watchKey=key;watchCache=raceWatch(now,id);}
  return watchCache;
}
// The race taking bets, with the owned horses and crown name the server fixed for it.
function openCard(now){
  const id=openRaceStart(now),info=live&&state.racing?.open?.id===id?state.racing.open:null;
  return {...raceCard(id,PUBLIC_SALT,info?.entries??[]),...(info?.crown?{name:info.crown}:{})};
}
function screenRace(){
  const now=Date.now(),openInfo=live&&state.racing?.open?.id===openRaceStart(now)?state.racing.open:null,open=openCard(now),watch=currentWatch(now);
  raceShown=`${open.id}:${watchKey}`;
  const weeklyLeft=WEEKLY_LIMIT-weeklySpent({raceWeek:state.raceWeek??{start:0,spent:0}},now);
  return raceScreen({state,live,watch,open:{card:open,hash:openInfo?.hash??null},openOdds:raceOdds(open),draft:{...raceDraft,amount:drafts['race-amount']},weeklyLeft,tabs:subTabs(),nav:bottomNav()});
}
async function settleRaces(){
  if(live||raceSettling||!(state.raceBets??[]).some(b=>b.status==='pending'&&Date.now()>=b.raceId+RUN_MS))return;
  raceSettling=true;
  try{const settled=await commit(next=>settleRaceBets(next,Date.now()));const won=settled.reduce((sum,b)=>sum+b.payout,0);if(settled.length)toast(won?`馬券的中 +${moneyCompact(won)}`:'馬券は外れました');}
  catch(error){toast(error.message);}
  finally{raceSettling=false;render();}
}
let lastStill=0,lastRaceRefresh=0;
function raceFrame(){
  if(screen!=='race'||detail){raceLoop=0;return;}
  raceLoop=requestAnimationFrame(raceFrame);
  const now=Date.now(),watch=currentWatch(now);
  if(`${openRaceStart(now)}:${watchKey}`!==raceShown){render();settleRaces();}
  // A new race started: fetch the revealed seed now instead of waiting for the 15-second poll.
  if(live&&state.racing&&(state.racing.open?.id!==openRaceStart(now)||state.racing.watch?.id!==latestRaceStart(now))&&now-lastRaceRefresh>5000&&!mutationPending){lastRaceRefresh=now;refreshWallet(false);}
  const open=raceCard(openRaceStart(now)),left=Math.max(0,open.closeAt-now);
  const countdown=$('#race-countdown');if(countdown)countdown.textContent=`${Math.floor(left/60000)}:${String(Math.floor(left/1000)%60).padStart(2,'0')}`;
  if(!watch.runs)return;
  const t=raceElapsed(watch.card,now);
  const clockEl=$('#race-clock');if(clockEl)clockEl.textContent=watch.finished?'確定':`発走から ${Math.floor(t/1000)}秒`;
  const lines=watch.commentary.filter(l=>l.t<=t);
  const list=$('#race-commentary');
  if(list&&list.dataset.count!==String(lines.length)){list.dataset.count=lines.length;list.innerHTML=lines.slice(-3).reverse().map(l=>`<li>${escapeHTML(l.text)}</li>`).join('');}
  const canvas=$('#race-canvas');
  if(!canvas)return;
  // Reduced motion: still frames once a second instead of continuous animation.
  if(reducedMotion?.matches&&!watch.finished&&now-lastStill<1000&&canvas.dataset.drawn)return;
  lastStill=now;canvas.dataset.drawn='1';
  drawRace(canvas,watch.card,watch.timeline,t,new Set(raceBets().raceBets.filter(b=>b.raceId===watch.card.id).map(b=>b.horse)));
}
function ensureRaceLoop(){if(screen==='race'&&!detail&&!raceLoop)raceLoop=requestAnimationFrame(raceFrame);}

function screenMarket(){
 return `<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">株</h1><span class="badge">${moneyCompact(state.cash)}</span></div></header>${subTabs()}<div class="market-disclaimer">KESO TOWNの架空の銘柄。実際の株価とは連動しません。銘柄をタップするとチャート。</div>${stockPanel(state)}<div class="list">${playerRows().map(v=>renderRow({...v,kind:'stock'})).join('')}</div>${tradePanel()}<div class="asset-list">${tradeHistory()}</div>${bottomNav()}</div>`;
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

// カジノ: one game at a time (ルーレット・チンチロ・ブラックジャック).
let casinoGame='roulette';
let casinoBusy=false,casinoPresentation=null,casinoStage={},casinoSkipped=false,skipCasinoPause=null;
let minesCount=3,vpHold=[false,false,false,false,false];
function screenCasino(){
  const visible=casinoPresentation??state;
  const head=`<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">カジノ</h1><div class="small-actions"><span class="badge">所持 ${moneyCompact(visible.cash)}</span></div></div></header>${subTabs()}${gamePicker(casinoGame)}`;
  if(casinoGame==='chinchiro')return head+chinchiroView(visible,casinoStage,casinoBusy)+bottomNav()+'</div>';
  if(casinoGame==='blackjack')return head+blackjackView(visible,casinoStage,casinoBusy)+bottomNav()+'</div>';
  if(casinoGame==='mines')return head+minesView(visible,{busy:casinoBusy,count:minesCount,drafts})+bottomNav()+'</div>';
  if(casinoGame==='slot')return head+slotView(visible,{busy:casinoBusy,jackpot:live?state.jackpot:null,drafts})+bottomNav()+'</div>';
  if(casinoGame==='poker')return head+videoPokerView(visible,{busy:casinoBusy,hold:vpHold,drafts})+bottomNav()+'</div>';
  if(casinoGame==='baccarat')return head+baccaratView(visible,{busy:casinoBusy,drafts})+bottomNav()+'</div>';
  const recent=state.spins[0];
  return `${head}<div class="center-panel"><div style="position:relative;width:var(--roulette-size,min(320px,86vw));margin:0 auto 18px"><div class="pointer"></div><div class="roulette-board" id="wheel" style="transform:rotate(${rotation|| (recent?outcomeAngle(recent.outcome):0)}deg)">${wheelView(betType==='number'?'numbers':betType,betNumber,[...numberBets.keys()])}<div class="roulette-center">${recent?recent.outcome:'K'}</div></div></div></div><div class="number-table" aria-label="ルーレットの数字">${Array.from({length:37},(_,n)=>`<button data-number="${n}" aria-pressed="${numberSelected(n)}" class="number-cell ${n===0?'green':redNumbers.has(n)?'red':'black'} ${numberSelected(n)?'selected':''}">${n}${betType==='number'&&numberBets.has(n)?`<small>${numberBets.get(n)} KP</small>`:''}</button>`).join('')}</div><p class="helper">ヨーロピアン式・0は緑。数字36倍／赤黒・偶奇・前半後半2倍／ダズン・列3倍（掛け金込み）。数字は複数選択OK。数字をもう一度タップすると解除。数字ごと100 KP以上、合計20,000 KPまで。</p><div class="bet-grid">${[['red','赤'],['black','黒'],['even','偶数'],['odd','奇数'],['number','数字指定'],['low','1〜18'],['high','19〜36'],['dozen1','1〜12'],['dozen2','13〜24'],['dozen3','25〜36'],['column1','1列目'],['column2','2列目'],['column3','3列目']].map(([id,label])=>`<button data-bet="${id}" class="${betType===id?'active':''}">${label}</button>`).join('')}</div><div class="trade-box"><h3>ベット</h3>${betType==='number'?`<p class="helper">盤面から数字を選んでください。</p>${[...numberBets].map(([n,amount])=>`<div class="field"><label for="number-stake-${n}">${n} の掛け金</label><input id="number-stake-${n}" data-stake="${n}" class="input" type="number" min="100" max="20000" step="1" value="${amount}"></div>`).join('')}<strong>合計 <span id="number-bet-total">${moneyCompact([...numberBets.values()].reduce((a,b)=>a+b,0))}</span></strong>`:`<div class="field"><label for="bet-amount">賭け金</label><input id="bet-amount" class="input" type="number" min="100" max="20000" step="1" value="500"></div>`}<div class="action-row"><button class="action-btn primary" data-action="spin" ${spinLock?'disabled':''}>ルーレットを回す</button></div></div><div class="result-panel"><p class="result-title ${recent && recent.payout>0?'negative':recent?'positive':''}">${recent ? (recent.payout>0?'的中':'不的中') : '直近結果'}</p><div class="helper">${recent ? `出目 ${recent.outcome} / 賭け ${moneyCompact(recent.amount)} / 払戻 ${moneyCompact(recent.payout)}${recent.bets?'<br>'+recent.bets.map(b=>b.number+': '+moneyCompact(b.amount)).join(' · '):''}` : 'まだ抽選履歴はありません。'}</div></div>${bottomNav()}</div>`;
}

function useScreen(title,body){
  return `<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">${title}</h1><span class="badge">${moneyCompact(state.cash)}</span></div></header>${tabsFor('directives')}${live?`<div class="asset-list">${body}</div>`:'<div class="market-disclaimer">本番のKP口座をつなぐと使えます。</div>'}${bottomNav()}</div>`;
}
function screenStable(){return useScreen('馬主',live?ownerPanel(state,Date.now()):'');}
function screenShop(){return useScreen('高級品',live?luxuryPanel(state):'');}

function screenAssets(){
  return `<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">資産</h1><div class="small-actions">${live?'':'<button class="icon-btn" data-action="reset" aria-label="初期化">↺</button>'}</div></div></header><div class="wallet-strip"><div class="wallet-item"><small>保有KP</small><strong>${moneyCompact(state.cash)}</strong></div><div class="wallet-item"><small>株式評価額</small><strong>${moneyCompact(portfolioValue(state))}</strong></div><div class="wallet-item"><small>純資産</small><strong>${moneyCompact(assets(state))}</strong></div></div>${live?'<div class="market-disclaimer">サーバー口座 · 試合報酬と決済は全端末で共通です。</div>':'<div class="market-disclaimer">端末内のデモ口座</div>'}${live?'':`<details class="panel"><summary class="card-body">開発用：テストKPの補充</summary><div class="action-row"><button class="action-btn" data-action="salary">テスト用KP +600 KP</button></div></details>`}${state.debt?.amount>0?`<div class="market-disclaimer">💸 借KP ${moneyCompact(state.debt.amount)}（${state.debt.intervalMinutes}分ごとに利子${state.debt.interestPercent}%）</div>`:''}<div class="asset-list">${live&&state.privateCasino?privateCasinoPanel(drafts,privateRacePreview,privateRoundMessage):''}<div class="asset-card"><div class="panel-title" style="margin-bottom:10px">保有銘柄</div>${MARKET.map(s=>`<div class="asset-line"><span>${s.name}</span><strong>${state.holdings[s.id]}株 / ${moneyCompact(state.holdings[s.id]*state.prices[s.id])}</strong></div>`).join('')}<div class="action-row"><button class="action-btn" data-screen="market">株を売買する</button></div></div>${tradeHistory()}${live?roastPanel(state):''}${live?trendPanel(trend,trendView):''}${live?healthPanel(health,healthLoading,healthError):''}<div class="asset-card"><h2 class="panel-title">口座</h2>${live?'<div id="connection-slot"></div>':''}<button class="title-back" data-screen="title">タイトルへ戻る</button></div></div>${bottomNav()}</div>`;
}

function bottomNav(){
  const items=[['home','⌂','ホーム'],['play','▶','稼ぐ'],['race','♠','遊ぶ'],['directives','⚑','使う'],['assets','◈','資産']];
  return `<nav class="bottom-nav"><div class="bottom-inner">${items.map(([id,ico,label])=>`<button class="nav-btn ${groupOf(screen)===id?'active':''}" data-screen="${id}"><span class="ico">${ico}</span><span>${label}</span></button>`).join('')}</div></nav>`;
}

function openDetail(kind,id){detail={kind,id};render();$('#modal [data-close]')?.focus();}
function closeDetail(){const id=detail.id;detail=null;render();document.querySelector(`[data-open="${id}"]`)?.focus();}

function detailSheet(){
  if(!detail) return '';
  const s=MARKET.find(v=>v.id===detail.id);
  const item={name:s.name,value:state.prices[s.id],time:new Date().toLocaleDateString('ja-JP'),data:state.stockMarket?stockCandles(state.stockMarket,s.id):genCandles(state.prices[s.id],s.id)};
  const c=item.data.at(-1), ma5=movingAverage(item.data,5).at(-1), ma10=movingAverage(item.data,10).at(-1), ma25=movingAverage(item.data,25).at(-1);
  return `<div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div class="sheet"><div class="sheet-header"><h2 class="sheet-title" id="detail-title">${item.name}</h2><button class="icon-btn" data-close="1" aria-label="閉じる">×</button></div><div class="chart-toolbar"><span>${state.stockMarket?'共通相場の履歴':'日足（疑似データ）'}</span><button class="toolbar-chip" data-action="toggle-ma" aria-pressed="${showMA}">移動平均線 ${showMA?'表示中':'非表示'}</button></div><div class="chart-stats"><div class="stat">高値 <strong>${fmt(c.high)}</strong><br>安値 <strong>${fmt(c.low)}</strong></div><div class="stat">始値 <strong>${fmt(c.open)}</strong><br>終値 <strong>${fmt(c.close)}</strong></div><div class="stat">出来高 <strong>${state.stockMarket?'—':fmt0(c.vol)}</strong><br>日時 <strong>${item.time}</strong></div></div><div class="chart-legend"><span class="legend-short">短期:${fmt(ma5)}</span><span class="legend-mid">中期:${fmt(ma10)}</span><span class="legend-long">長期:${fmt(ma25)}</span></div><div class="chart-note">${state.stockMarket?'5分ごとの株価を表示しています。':'表示価格・日足・移動平均線はデモ用の疑似データ'}</div><div class="candle-wrap"><div class="chart-panel">${svgCandles(item.data,660,560,showMA,state.stockMarket?'共通株価の履歴':'デモ相場のローソク足チャート')}</div></div>${detail.kind==='stock' ? `${state.stockMarket?'':`<div class="depth-section"><div class="depth-head"><strong>板情報</strong><small>参考気配・疑似注文</small></div><div class="depth-label"><span>売数量</span><span>気配（KP）</span><span>買数量</span></div>${Array.from({length:7},(_,i)=>{const level=3-i;const price=Math.max(1,Math.round(item.value+level));const ask=level>0;const bid=level<0;const aVol=(31+i*13)%79+8,bVol=(43+i*17)%83+9;return `<div class="depth-row"><span class="ask">${ask?fmt0(aVol*10):''}</span><strong>${fmt0(price)}</strong><span class="bid">${bid?fmt0(bVol*10):''}</span></div>`}).join('')}</div>`}<div class="action-row"><button class="action-btn primary" data-order-symbol="${detail.id}">この銘柄を注文</button></div>`:''}<div class="close-row"><button class="close-btn" data-close="1">閉じる</button></div></div></div>`;
}

function render(){
  const html = screen==='title'?titleView(state,wallet.remembered,autoState,autoMessage):screen==='home'?homeView(state,bottomNav()):screen==='play'?playView(state,drafts,bottomNav()):screen==='directives'?directivesView(state,drafts,bottomNav(),tabsFor('directives')):screen==='stable'?screenStable():screen==='shop'?screenShop():screen==='market'?screenMarket():screen==='casino'?screenCasino():screen==='mleague'?mleagueScreen({state,live,draft:{...mlDraft,amount:drafts['ml-amount']},tabs:subTabs(),nav:bottomNav()}):screen==='race'?screenRace():screenAssets();
  const openDetails=[...app.querySelectorAll('details')].map(el=>el.open);
  const focusedElement=document.activeElement;
  const focused=focusedElement?.id;
  const focusData=focusedElement && Object.entries(focusedElement.dataset).find(([key])=>['screen','marketTab','marketMode','tradeSide','bet','action','open','raceHorse','raceType'].includes(key));
  const warning=live?connectionError:sessionOnly?'端末に保存できないため、この画面を閉じると変更が失われます。':!navigator.locks?.request?'このブラウザでは安全な保存を利用できません。HTTPS対応の最新ブラウザで開いてください。':'';
  const connection=live?`<div class="kp-connection"><span>${wallet.pending?'通信結果の確認待ち':wallet.remembered?'KP口座 接続中':'KP口座 一時接続'}</span><button data-action="refresh-kp">${wallet.pending?'通信結果を確認':'残高を更新'}</button><button data-action="disconnect-kp">接続を解除</button></div>`:'';
  const withControls=html.includes('<div id="connection-slot"></div>')?html.replace('<div id="connection-slot"></div>',connection):wallet.pending?(html.includes('</header>')?html.replace('</header>','</header>'+connection):connection+html):html; // an unconfirmed payment is shown on every screen, the title included
  const withFeed=live&&screen!=='title'?withControls.replace('</header>','</header>'+communityPanel([],screen==='home')):withControls;
  const markup=withFeed.replace('<div class="screen">','<div class="screen" data-view="'+screen+'">'+(warning?`<div class="storage-warning" role="status">${warning}</div>`:''))+detailSheet();
  // A quote/balance poll must not replace a pressed button when its display is unchanged.
  if(markup===renderedMarkup)return;
  app.innerHTML=markup;renderedMarkup=markup;
  app.querySelectorAll('details').forEach((el,index)=>{el.open=openDetails[index]??el.open;});
  for (const [id,value] of Object.entries(drafts)) { const input=document.getElementById(id); if(input) input.value=value; }
  if(focused&&!casinoBusy) document.getElementById(focused)?.focus();
  else if(focusData&&!casinoBusy){const [key,value]=focusData;const match=[...app.querySelectorAll('button,[data-open]')].find(el=>el.dataset[key]===value);match?.focus();}
  if(detail) $('.screen').inert=true;
  document.body.style.overflow=detail?'hidden':'';
  paintCommunity();
  ensureRaceLoop();
}


async function refreshWallet(resume=false){
 try{if(resume&&wallet.pending)await wallet.resume();state=await wallet.state();connectionError='';if(!detail)render();}
 catch(error){connectionError=error.message;if(!detail)render();if(resume)throw error;}
}
// Live wallets: the server rolls the dice and draws the cards. The demo uses the same rules with the browser's crypto.
const CASINO_DEMO={chinchiro:(s,a)=>playChinchiro(s,a,cryptoDie),'bj-start':(s,a)=>bjStart(s,a,cryptoCard),'bj-hit':s=>bjHit(s,cryptoCard),'bj-stand':s=>bjStand(s,cryptoCard),'bj-double':s=>bjDouble(s,cryptoCard)};
const BJ_RESULTS={win:'勝ち',lose:'負け',push:'引き分け',bust:'バースト',blackjack:'ブラックジャック！','dealer-blackjack':'ディーラーのブラックジャック'};
async function doCasino(action){
  const input=action==='chinchiro'?$('#chinchiro-amount'):action==='bj-start'?$('#bj-amount'):null;
  const amount=input?Number(input.value):undefined;
  if(input&&(!Number.isSafeInteger(amount)||amount<100||amount>20000))throw new Error('賭け金は100〜20,000 KPの整数です');
  if(casinoBusy)return;
  const before=structuredClone({cash:state.cash,chinchiro:state.chinchiro??[],blackjack:state.blackjack??null,bjHistory:state.bjHistory??[]});
  casinoBusy=true;casinoSkipped=!!reducedMotion?.matches;
  casinoPresentation={...before,chinchiro:action==='chinchiro'?[]:before.chinchiro,bjHistory:action==='bj-start'?[]:before.bjHistory};
  casinoStage={phase:'waiting'};render();
  $('.casino-arena')?.scrollIntoView({block:'start',behavior:'auto'});
  try{
    const result=live?await liveOperation(action,input?{amount}:{}):await commit(next=>CASINO_DEMO[action](next,amount));
    for(const frame of casinoFrames(action,before,result)){
      if(casinoSkipped)break;
      casinoPresentation=frame.view;casinoStage=frame.stage;render();
      await new Promise(resolve=>{const timer=setTimeout(()=>{skipCasinoPause=null;resolve();},frame.ms);skipCasinoPause=()=>{clearTimeout(timer);skipCasinoPause=null;resolve();};});
    }
    const signed=n=>(n>0?'+':n<0?'−':'±')+moneyCompact(Math.abs(n));
    if(action==='chinchiro')toast(`${result.net>0?'勝ち':result.net<0?'負け':'分け'} ${signed(result.net)}`);
    else if(result.done)toast(`${BJ_RESULTS[result.done.result]??''} ${signed(result.done.net)}`);
  }finally{casinoBusy=false;casinoPresentation=null;casinoStage={};skipCasinoPause=null;render();
    const nextAction=action==='chinchiro'?'chinchiro':state.blackjack?'bj-hit':'bj-start';
    $(`[data-action="${nextAction}"]`)?.focus({preventScroll:true});
  }
}
// マインズ・スロット・ビデオポーカー・バカラ: the server draws for live wallets, the browser's crypto for the demo.
const MORE_DEMO={'mines-start':(s,a)=>minesStart(s,a.amount,a.mines),'mines-pick':(s,a)=>minesPick(s,a.cell,cryptoInt),'mines-cashout':s=>minesCashout(s,cryptoInt),
 slot:(s,a)=>playSlot(s,a.amount,cryptoInt),'vp-deal':(s,a)=>vpDeal(s,a.amount,cryptoInt),'vp-draw':(s,a)=>vpDraw(s,a.hold,cryptoInt),baccarat:(s,a)=>playBaccarat(s,a.amount,a.side,cryptoCard)};
const MORE_STAKE={'mines-start':'#mines-amount',slot:'#slot-amount','vp-deal':'#vp-amount',baccarat:'#baccarat-amount'};
async function doMoreCasino(action,extra={}){
  if(casinoBusy)return;
  const args={...extra};
  if(MORE_STAKE[action]){const amount=Number($(MORE_STAKE[action])?.value);if(!Number.isSafeInteger(amount)||amount<100||amount>20000)throw new Error('賭け金は100〜20,000 KPの整数です');args.amount=amount;drafts[MORE_STAKE[action].slice(1)]=String(amount);}
  if(action==='mines-start')args.mines=minesCount;
  if(action==='vp-draw')args.hold=[...vpHold];
  const slow=['slot','baccarat'].includes(action)&&!reducedMotion?.matches;
  casinoBusy=slow;if(slow)render();
  try{
    const started=Date.now();
    const result=live?await liveOperation(action,args):await commit(next=>MORE_DEMO[action](next,args));
    if(slow)await new Promise(resolve=>setTimeout(resolve,Math.max(0,(action==='slot'?1100:700)-(Date.now()-started))));
    if(action==='vp-deal'||action==='vp-draw')vpHold=[false,false,false,false,false];
    const done=result?.done;
    if(done){const signed=n=>(n>0?'+':n<0?'−':'±')+moneyCompact(Math.abs(n));
      toast(done.game==='slot'&&done.jackpot?`ジャックポット！ ${signed(done.net)}`:done.game==='video-poker'?`${VP_NAMES[done.hand]} ${signed(done.net)}`:done.game==='mines'&&done.net<0?`地雷… ${signed(done.net)}`:`${done.net>0?'勝ち':done.net<0?'負け':'分け'} ${signed(done.net)}`);}
  }finally{casinoBusy=false;render();}
}
async function liveOperation(action,args){
 if(connectionError)throw Error('残高を更新してから操作してください。');
 const result=await wallet.operate(action,args);
 try{state=await wallet.state();connectionError='';}catch{connectionError='決済済みです。残高を更新してください。';}
 return result;
}

async function doTrade(){
  const symbol=$('#trade-symbol')?.value || activeSymbol; const qty=Number($('#trade-qty')?.value);
  const side=tradeSide;
  activeSymbol=symbol; if(live)await liveOperation('trade',{symbol,side,quantity:qty});else await commit(next => trade(next,symbol,side,qty)); render(); toast(`${MARKET.find(v=>v.id===symbol).name}を${side==='buy'?'買付':'売却'}した`);
}
async function doSpin(){
  if(spinLock) return;
  const bets=[...numberBets].map(([number,amount])=>({number,amount}));
  const amount=betType==='number'?validateNumberBets(bets).total:Number($('#bet-amount')?.value);
  const choice=0;
  if(!Number.isSafeInteger(amount) || amount<100 || amount>20000 || amount>state.cash) throw new Error('賭け額は100〜20,000 KP（所持金以内）');
  if(betType==='number' && (!Number.isInteger(choice)||choice<0||choice>36)) throw new Error('数字は0〜36で指定');
  const lockedType=betType==='number'?'numbers':betType;
  const outcome=live?null:cryptoRouletteNumber();
  spinLock=true;
  let result;
  try { result=live?await liveOperation('spin',{type:lockedType,amount,choice,...(lockedType==='numbers'?{bets}:{})}):await commit(next => lockedType==='numbers'?spinNumbers(next,bets,outcome):spin(next,lockedType,amount,choice,outcome)); }
  catch(error) { spinLock=false; throw error; }
  const wheel=$('#wheel');
  const button=$('[data-action="spin"]'); if(button) button.disabled=true;
  rotation = Math.ceil(rotation/360)*360 + 1440 + outcomeAngle(result.outcome);
  if(wheel) {wheel.style.transition='transform 1.8s cubic-bezier(.15,.82,.14,1)';wheel.style.transform=`rotate(${rotation}deg)`;}
  setTimeout(()=>{try{
      const r=result;
      spinLock=false; render(); toast(r.payout>0?`的中 ${moneyCompact(r.payout)}`:`出目 ${r.outcome}`);
    }catch(err){spinLock=false;render();toast(err.message)}
  },1800);
}

// メンバーのKP推移: tapping (or hovering on a mouse) a day on the chart shows everyone's KP that day.
const trendDay=e=>{const hit=e.target.closest?.('[data-trend-day]');if(!hit)return;const day=Number(hit.dataset.trendDay);if(trendView.day!==day){trendView.day=day;render();}};
addEventListener('click',trendDay);
addEventListener('pointermove',e=>{if(e.pointerType==='mouse')trendDay(e);});
addEventListener('click',async e=>{
  const t=e.target.closest?.('button,[data-open]'); if(!t) return;
  if(t.dataset.action==='casino-skip'){casinoSkipped=true;skipCasinoPause?.();return;}
  if(casinoBusy&&(t.dataset.screen||t.dataset.casinoGame)){toast('演出をスキップすると移動できます');return;}
  const mutates=!!t.dataset.approve || !!t.dataset.complete || ['salary','trade','spin','race-bet','roast-level','horse-buy','horse-sell','luxury','reset','submit-claim','issue-directive','connect-kp','refresh-kp','disconnect-kp','auto-connect-kp','ml-buy','chinchiro','bj-start','bj-hit','bj-stand','bj-double','mines-start','mines-pick','mines-cashout','slot','vp-deal','vp-draw','baccarat','private-round','private-race'].includes(t.dataset.action);
  if(mutates && mutationPending)return;
  if(mutates)mutationPending=true;
  try{
    if(t.dataset.action==='auto-connect-kp'){await automaticConnect();return;}
    if(t.dataset.action==='connect-kp'){state=await wallet.connect($('#kp-connect-code').value);live=true;autoState='connected';autoMessage='';connectionError='';delete drafts['kp-connect-code'];screen='home';render();toast(wallet.remembered?'接続しました。次回は自動で接続します':'接続しました。この環境では閉じると再接続が必要です');return;}
    if(t.dataset.action==='private-round'){
      if(!live||!state.privateCasino)throw Error('この操作は利用できません。');
      const game=$('#private-game').value,args=game==='roulette'?{game,amount:Number($('#private-amount').value),number:Number($('#private-number').value)}:{game,amount:Number($('#private-amount').value),hand:$('#private-hand').value};
      const result=await liveOperation('private-casino',args),net=result.net??result.done?.net??(result.payout-result.amount);
      privateRoundMessage=(net>=0?'+':'')+moneyCompact(net);render();toast(privateRoundMessage);return;
    }
    if(t.dataset.action==='private-race'){
      if(!live||!state.privateCasino)throw Error('この操作は利用できません。');
      privateRacePreview=await wallet.privateRace();render();return;
    }
    if(t.dataset.action==='refresh-kp'){await refreshWallet(true);render();return;}
    if(t.dataset.action==='disconnect-kp'){await wallet.disconnect();autoState=embedded?'paused':'idle';autoMessage='';live=false;trend=null;trendView={...trendView,error:'',focus:null,day:null};privateRacePreview=null;privateRoundMessage='';connectionError='';state=store.state;screen='title';render();return;}
    if(t.dataset.casinoGame){if(spinLock){toast('抽選中は切り替えられません');return;}casinoGame=t.dataset.casinoGame;render();return;}
    if(t.dataset.screen){if(spinLock){toast('抽選中は画面を切り替えられません');return;}detail=null;screen=t.dataset.screen;render();if(screen==='race')settleRaces();return;}
    if(t.dataset.action==='load-trend'){await loadTrend(Number(t.dataset.days));return;}
    if(t.dataset.trendSort){const key=t.dataset.trendSort;trendView.dir=trendView.sort===key?-trendView.dir:1;trendView.sort=key;render();return;}
    if(t.dataset.trendFocus){trendView.focus=trendView.focus===t.dataset.trendFocus?null:t.dataset.trendFocus;render();return;}
    if(t.dataset.raceHorse){raceDraft.horse=Number(t.dataset.raceHorse);render();return;}
    if(t.dataset.mlPlayer){mlDraft={match:t.dataset.mlMatch,player:t.dataset.mlPlayer,confirm:false};render();$('.ml-order')?.scrollIntoView({block:'center'});$('#ml-amount')?.focus({preventScroll:true});return;}
    if(t.dataset.action==='ml-confirm'){const amount=Number($('#ml-amount')?.value);if(!Number.isSafeInteger(amount)||amount<100||amount%100!==0)throw new Error('金額は100 KP以上、100 KP単位です');drafts['ml-amount']=String(amount);mlDraft.confirm=true;render();$('.ml-order')?.scrollIntoView({block:'center'});return;}
    if(t.dataset.action==='load-health'){healthLoading=true;healthError='';render();try{health=await wallet.health();}catch(error){healthError=error.message||'状態を確認できませんでした';}finally{healthLoading=false;render();}return;}
    if(t.dataset.action==='ml-cancel'){mlDraft.confirm=false;render();return;}
    if(t.dataset.action==='ml-buy'){
      const f=state.mleague?.fixtures.find(x=>x.id===mlDraft.match),p=f?.players.find(x=>x.name===mlDraft.player);if(!p)throw new Error('選手を選び直してください');
      let bet;try{({bet}=await liveOperation('ml-bet',{match:f.id,player:p.name,type:'last',amount:Number(drafts['ml-amount']),odds:p.odds}));}
      catch(error){mlDraft.confirm=false;try{state=await wallet.state();}catch{}throw error;} // show the current odds after a refusal
      mlDraft={match:null,player:null,confirm:false};delete drafts['ml-amount'];render();toast(`${bet.player}のラスを買いました（${(bet.odds/10).toFixed(1)}倍）`);return;
    }
    if(t.dataset.raceType){raceDraft.type=t.dataset.raceType;render();return;}
    if(t.dataset.action==='horse-buy'){const {horse}=await liveOperation('horse-buy',{box:t.dataset.box,name:$('#horse-name')?.value??''});delete drafts['horse-name'];render();toast(`${horse.name}（${horse.gradeLabel}）が仲間入りしました`);return;}
    if(t.dataset.action==='horse-sell'){if(!confirm('この馬を売りますか？売ると戻せません'))return;const {sold}=await liveOperation('horse-sell',{horseId:t.dataset.horse});render();toast(`売却しました（+${moneyCompact(sold.refund)}）`);return;}
    if(t.dataset.action==='luxury'){
      const item=LUXURY.find(i=>i.id===t.dataset.item);if(!item||!confirm(`${item.label}を${moneyCompact(stockPrice(item.price,state.stockBenefits))}で買いますか？`))return;
      await liveOperation('luxury',{item:item.id,target:$('#lux-target')?.value,text:$('#lux-text')?.value,title:$('#lux-title')?.value,horseId:$('#lux-horse')?.value});
      render();toast(`${item.label}を買いました`);return;
    }
    if(t.dataset.action==='roast-level'){await liveOperation('roast-level',{level:t.dataset.level});render();toast('煽りレベルを変更しました');return;}
    if(t.dataset.action==='race-bet'){
      const now=Date.now(),raceId=openRaceStart(now),args={raceId,type:raceDraft.type,horse:raceDraft.horse,amount:Number($('#race-amount')?.value)};
      const bet=live?(await liveOperation('race-bet',args)).bet:await commit(next=>placeRaceBet(next,args,now));
      render();toast(`${bet.horse}番の馬券を買いました（${(bet.odds/10).toFixed(1)}倍）`);return;
    }
    if(t.dataset.open){openDetail(t.dataset.kind,t.dataset.open);return;}
    if(t.dataset.orderSymbol){activeSymbol=t.dataset.orderSymbol;detail=null;screen='market';render();document.getElementById('trade-qty')?.scrollIntoView({block:'center'});return;}
    if(t.dataset.close){closeDetail();return;}
    if(t.dataset.action==='toggle-ma'){showMA=!showMA;render();$('[data-action="toggle-ma"]')?.focus();return;}
    if(t.dataset.tradeSide){tradeSide=t.dataset.tradeSide;render();return;}
    if(t.dataset.number!==undefined){if(spinLock)return;betType='number';betNumber=Number(t.dataset.number);if(numberBets.has(betNumber))numberBets.delete(betNumber);else numberBets.set(betNumber,100);render();return;}
    if(t.dataset.bet){if(spinLock)return;betType=t.dataset.bet;render();return;}
    if(t.dataset.action==='submit-claim'){
      const data={activity:$('#claim-activity').value,reference:$('#claim-reference').value,game:$('#claim-game')?.value,achievement:$('#claim-achievement')?.value};
      await commit(next=>submitClaim(next,data));delete drafts['claim-reference'];render();toast('確認待ちに追加しました。まだKPは支給されません');return;
    }
    if(t.dataset.approve){const reward=await commit(next=>approveClaim(next,Number(t.dataset.approve)));render();toast(`デモ確認：+${moneyCompact(reward)}`);return;}
    if(t.dataset.action==='issue-directive'){
      const data={target:$('#directive-target').value,task:$('#directive-task').value,game:$('#directive-game')?.value,achievement:$('#directive-achievement')?.value};
      if(live)await liveOperation('directive',data);else await commit(next=>issueDirective(next,data));render();toast(live?'指名しました。Discordにも順次お知らせします':'デモ指令を発行しました（外部送信なし）');return;
    }
    if(t.dataset.complete){await commit(next=>completeDirective(next,Number(t.dataset.complete)));render();toast('デモで達成済みにしました');return;}
    if(t.dataset.action==='salary'){await commit(next => grantDemoSalary(next));render();toast('テスト用KP +600 KP');return;}
    if(t.dataset.action==='trade'){await doTrade();return;}
    if(t.dataset.action==='spin'){await doSpin();return;}
    if(['chinchiro','bj-start','bj-hit','bj-stand','bj-double'].includes(t.dataset.action)){await doCasino(t.dataset.action);return;}
    if(t.dataset.minesCount){minesCount=Number(t.dataset.minesCount);render();return;}
    if(t.dataset.vpHold){const i=Number(t.dataset.vpHold);vpHold[i]=!vpHold[i];render();return;}
    if(['mines-start','mines-pick','mines-cashout','slot','vp-deal','vp-draw','baccarat'].includes(t.dataset.action)){await doMoreCasino(t.dataset.action,t.dataset.action==='mines-pick'?{cell:Number(t.dataset.cell)}:t.dataset.action==='baccarat'?{side:t.dataset.side}:{});return;}
    if(t.dataset.action==='reset'){if(confirm('データを初期化しますか？')){await commit(next => Object.assign(next,createInitialState()));for(const key of Object.keys(drafts))delete drafts[key];renderedMarkup=undefined;render();toast('初期化した')}return;}

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
  if(e.target.dataset.stake!==undefined&&!spinLock){const n=Number(e.target.dataset.stake),amount=Number(e.target.value);numberBets.set(n,amount);document.querySelector('#number-bet-total').textContent=moneyCompact([...numberBets.values()].reduce((a,b)=>a+b,0));const badge=document.querySelector(`[data-number="${n}"] small`);if(badge)badge.textContent=amount+' KP';}
  if(['private-game','private-amount','private-number','private-hand'].includes(e.target.id))drafts[e.target.id]=e.target.value;
  if(e.target.id==='private-game'){delete drafts['private-hand'];render();}
  if(e.target.id==='horse-name')drafts['horse-name']=e.target.value;
  if(e.target.id==='ml-amount'){drafts['ml-amount']=e.target.value;const preview=$('#ml-preview');if(preview)preview.textContent=mleaguePreview(state,{...mlDraft,amount:e.target.value});}
  if(e.target.id==='race-amount'){drafts['race-amount']=e.target.value;const preview=$('#race-preview');if(preview){const open=openCard(Date.now());preview.innerHTML=racePreview(open,raceOdds(open),{...raceDraft,amount:e.target.value});}}
  if (e.target.id==='kp-connect-code'||['trade-qty','bet-amount','chinchiro-amount','bj-amount','mines-amount','slot-amount','vp-amount','baccarat-amount'].includes(e.target.id)||e.target.id.startsWith('claim-')||e.target.id.startsWith('directive-')) drafts[e.target.id] = e.target.value;
  if(e.target.id==='trade-qty')$('#trade-estimate').innerHTML=tradeEstimate();
});
const drafts = {};
let privateRacePreview=null,privateRoundMessage='';
// Live wallets: every 15 s only a tiny "did anything change?" check; the full state is fetched when it changed, and at
// least once a minute (race card, Mリーグ status and voice status move with time). Nothing is fetched while hidden.
// This small read is independent of wallet/animation polling and never replaces the game form.
let communityEntries=[],communityBusy=false,communityOwner=null,communityStatus='確認中…';
function paintCommunity(){
 const list=$('.community-entries'),status=$('.community-status');
 if(!list)return;
 const html=communityRows(communityEntries);
 if(list.innerHTML!==html)list.innerHTML=html;
 if(status)status.textContent=communityStatus;
}
async function refreshCommunity(){
 if(document.hidden||!live||!wallet.connected||communityBusy)return;
 const owner=state.selfUserId;
 if(communityOwner!==owner){communityEntries=[];communityOwner=owner;}
 communityBusy=true;
 try{
  const data=await wallet.feed();
  if(!live||state.selfUserId!==owner)return;
  communityEntries=data.entries;communityStatus='更新 '+new Date().toLocaleTimeString('ja-JP');
 }catch{communityStatus='更新が止まっています。自動で再接続します。';}
 finally{communityBusy=false;paintCommunity();}
}
setInterval(refreshCommunity,5000);
addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCommunity();});
const FULL_EVERY=60000;let lastPulse=null,lastFull=0;
async function refreshLive(){
  if(document.hidden)return;
  let pulse=null;
  try{pulse=await wallet.pulse();}catch{/* an older server or a network blip: fall back to the full state */}
  if(pulse!==null&&pulse===lastPulse&&Date.now()-lastFull<FULL_EVERY&&!connectionError)return;
  await refreshWallet(false);
  if(!connectionError){lastPulse=pulse;lastFull=Date.now();}
}
async function refreshMarket() {
  if(spinLock||mutationPending||autoState==='loading') return;
  if(live){await refreshLive();return;}
  settleRaces();
  try { const steps=await commit(next => advanceMarket(next)); if(steps && !detail)render(); }
  catch(error) { toast(error.message); }
}
addEventListener('storage', e => {
  if(!live&&(e.key === null || [KEY,LEGACY_KEY].includes(e.key))) {
    store.refresh();
    if(!spinLock && !detail)render();
  }
});
addEventListener('visibilitychange', () => { if(!document.hidden)refreshMarket(); });
setInterval(refreshMarket,15000);
async function automaticConnect(){
 mutationPending=true;autoState='loading';autoMessage='';connectionError='';screen='title';render();
 try{
  const result=await connectDiscordActivity(wallet);
  if(result.kind==='connected'){state=result.state;live=true;autoState='connected';}
  else{autoState='manual';if(wallet.connected){state=await wallet.state();live=true;}else{live=false;state=store.state;}}
 }catch(error){live=false;state=store.state;autoState='error';autoMessage=/[ぁ-んァ-ヶ一-龯]/.test(error?.message??'')?error.message:'Discordに接続できませんでした。もう一度お試しください。';}
 finally{mutationPending=false;render();}
}
render();
if(embedded)automaticConnect();else refreshMarket();
