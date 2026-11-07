import {stockOrderQuote,STOCK_ORDER_VERSION,STOCK_PRICE_SCALE} from './stock-order.js?v=web-63ae2ba614f15494';
import {steamConnectionMessage} from './steam-view.js?v=web-63ae2ba614f15494';
import {relicsPanel} from './relics-view.js?v=web-63ae2ba614f15494';
import {primeRelicAudio,playRelicSound,previewRelicSound,stopRelicSound,setRelicSoundVolume,toggleRelicSound} from './relics-audio.js?v=web-63ae2ba614f15494';
import {relicDefaultView} from './relics-v4.js?v=web-63ae2ba614f15494';
import {privateCasinoPanel} from './private-casino-view.js?v=web-63ae2ba614f15494';
import {communityPanel,communityRows} from './community-feed.js?v=web-63ae2ba614f15494';
import {stockPanel,stockCandles,stockPrice,privateStockOperator} from './stock-view.js?v=web-63ae2ba614f15494';
import {stockStoryChoices,validateCustomStory} from './stock-stories.js?v=web-63ae2ba614f15494';
import {wheelView,covered,redNumbers,outcomeAngle} from './roulette-view.js?v=web-63ae2ba614f15494';
import {makeEscalationWheel} from './escalation-roulette.js?v=web-63ae2ba614f15494';
import {connectDiscordActivity,isDiscordActivity,openSteamLogin,openCompanionGame}from './discord-activity-auth.js?v=web-63ae2ba614f15494';
import { createKpClient } from './kp-client.js?v=web-63ae2ba614f15494';
import { fullRefreshInterval, communityRefreshEnabled, COMMUNITY_REFRESH_INTERVAL } from './live-refresh-policy.js?v=web-63ae2ba614f15494';
import { fmt, fmt0 } from './format.js?v=web-63ae2ba614f15494';
import { submitClaim, approveClaim, issueDirective, completeDirective } from './progression.js?v=web-63ae2ba614f15494';
import { titleView, homeView, playView, directivesView, escapeHTML } from './progression-views.js?v=web-63ae2ba614f15494';
import { genCandles, movingAverage, svgCandles } from './charts.js?v=web-63ae2ba614f15494';
import { MARKET, createInitialState, portfolioValue, assets, advanceMarket, trade, spin, spinNumbers, validateNumberBets, grantDemoSalary, cryptoRouletteNumber } from './engine.js?v=web-63ae2ba614f15494';
import { KEY, LEGACY_KEY } from './storage.js?v=web-63ae2ba614f15494';
import { PUBLIC_SALT, RUN_MS, WEEKLY_LIMIT, openRaceStart, latestRaceStart, raceCard, raceOdds, raceResult, raceTimeline, raceCommentary, raceRuns, placeRaceBet, settleRaceBets, weeklySpent } from './racing.js?v=web-63ae2ba614f15494';
import { LUXURY } from './luxury.js?v=web-63ae2ba614f15494';
import { raceScreen, racePreview, drawRace, raceElapsed, ownerPanel, luxuryPanel, roastPanel } from './racing-view.js?v=web-63ae2ba614f15494';
import { createStore } from './store.js?v=web-63ae2ba614f15494';
import { healthPanel } from './health-view.js?v=web-63ae2ba614f15494';
import { trendPanel } from './trend-view.js?v=web-63ae2ba614f15494';
import { mleagueScreen, mleaguePreview } from './mleague-view.js?v=web-63ae2ba614f15494';
import {duelScreen} from './duel-view.js?v=web-63ae2ba614f15494';
import { gamePicker, chinchiroView, blackjackView } from './casino-view.js?v=web-63ae2ba614f15494';
import {casinoFrames,createRelicRevealGate} from './casino-animation.js?v=web-63ae2ba614f15494';
import { playChinchiro, bjStart, bjHit, bjStand, bjDouble, cryptoDie, cryptoCard, cryptoInt } from './casino.js?v=web-63ae2ba614f15494';
import { showBigWin } from './bigwin.js?v=web-63ae2ba614f15494';
import { audioMixEnabled, audioMixSupported, setAudioMix } from './audio-mix.js?v=web-63ae2ba614f15494';
import { sfxEnabled, toggleSfx, unlockSfx, preloadSfx, play as playSfx, playResult, announce, sfxVolume, setSfxVolume, bgmEnabled, setBgmScene, toggleBgm, BGM_TRACKS } from './sfx.js?v=web-63ae2ba614f15494';
import { minesStart, minesPick, minesCashout, playSlot, slotWinTier, vpDeal, vpDraw, playBaccarat, VP_NAMES } from './casino-more.js?v=web-63ae2ba614f15494';
import { minesView, slotView, videoPokerView, baccaratView } from './casino-more-view.js?v=web-63ae2ba614f15494';
const $=(s,el=document)=>el.querySelector(s);
const wallet=createKpClient();
const embedded=isDiscordActivity();
document.documentElement.classList.toggle('discord-activity',embedded);
let autoState=embedded?'loading':'idle';
let autoMessage='';
let live=wallet.connected&&!embedded;
let steamView=null;
let duelData=null,duelError='',duelActiveId=null,duelGame='othello',duelStake=1000,duelTarget='',duelBusy=false,duelResignConfirm=false,duelLastFetch=0;
let duelPendingAction=null,duelPokerPicks=[],duelOpponentPickerOpen=false,duelLoading=false,duelGomokuPreview=null;
let duelGuessDraft='',duelRiskConfirm=null,duelLastGoodFetch=0,duelRetryNotBefore=0,duelRefreshFailures=0;
const DUEL_PENDING_KEY='keso-duel-action-v1',DUEL_HISTORY_KEY='keso-duel-moves-v1-';
let duelHistoryOwner=null;
function duelStorage(){try{return window.sessionStorage??null;}catch{return null;}}
function saveDuelPending(){
 try{const store=duelStorage();if(store)duelPendingAction?store.setItem(DUEL_PENDING_KEY,JSON.stringify(duelPendingAction)):store.removeItem(DUEL_PENDING_KEY);}catch{}
}
function loadDuelPending(){
 if(duelPendingAction||!state?.selfUserId)return;
 try{const saved=JSON.parse(duelStorage()?.getItem(DUEL_PENDING_KEY)??'null');
  if(saved?.owner===state.selfUserId&&Date.now()-saved.at<7*86400_000&&
   /^[0-9a-f-]{36}$/i.test(saved.id)&&saved.args&&typeof saved.args.action==='string')duelPendingAction=saved;
 }catch{}
}
function loadDuelHistory(){
 const owner=state?.selfUserId;if(!owner||owner===duelHistoryOwner)return;
 duelHistoryOwner=owner;duelRecentMoves.clear();duelMoveHistory.clear();
 try{const entries=JSON.parse(window.localStorage?.getItem(DUEL_HISTORY_KEY+owner)??'[]');
  if(!Array.isArray(entries))return;
  for(const [id,rows] of entries.slice(-25)){
   if(typeof id!=='string'||!Array.isArray(rows))continue;
   const moves=rows.filter(x=>Number.isInteger(x.cell)&&x.cell>=0&&x.cell<225&&
    Number.isInteger(x.version)&&['B','W'].includes(x.color)).slice(-12);
   if(moves.length){duelMoveHistory.set(id,moves);const last=moves.at(-1);duelRecentMoves.set(id,{version:last.version,cell:last.cell});}
  }
 }catch{}
}
function saveDuelHistory(){
 try{window.localStorage?.setItem(DUEL_HISTORY_KEY+state.selfUserId,
  JSON.stringify([...duelMoveHistory.entries()].slice(-25).map(([id,rows])=>[id,rows.slice(-12)])));
 }catch{}
}
const duelRecentMoves=new Map();
const duelMoveHistory=new Map();
// Keep only move markers inferred from a single newly occupied square between two received boards.
// Ambiguous jumps (for example, multiple moves while offline) are never mislabeled.
function observeDuelChanges(fresh){
 const previous=new Map((duelData?.matches??[]).map(m=>[m.id,m]));
 for(const match of fresh.matches??[]){
  const before=previous.get(match.id);
  if(!before||before.version===match.version)continue;
  if(['othello','gomoku'].includes(match.game)&&typeof before.board==='string'&&typeof match.board==='string'&&before.board.length===match.board.length){
   const added=[...match.board].flatMap((cell,i)=>before.board[i]==='.'&&cell!=='.'?[i]:[]);
   if(added.length===1){
    duelRecentMoves.set(match.id,{version:match.version,cell:added[0]});
    const entries=duelMoveHistory.get(match.id)??[];
    duelMoveHistory.set(match.id,[...entries,{version:match.version,cell:added[0],color:match.board[added[0]]}].slice(-12));
     saveDuelHistory();
   }
   else duelRecentMoves.delete(match.id);
  }
  if(before.status==='active'&&match.status==='active'&&before.turn_user!==state.selfUserId&&match.turn_user===state.selfUserId&&screen==='duels'&&!document.hidden)
   toast('決闘の手番になりました。対戦ルームを確認してください。');
 }
 if(duelMoveHistory.size>25)for(const key of [...duelMoveHistory.keys()].slice(0,duelMoveHistory.size-25))duelMoveHistory.delete(key);
 if(duelRecentMoves.size>25)for(const key of [...duelRecentMoves.keys()].slice(0,duelRecentMoves.size-25))duelRecentMoves.delete(key);
}
let sfxVolumeOpen=false; // the 🎚 volume panel next to 効果音 (casino / racing)
let relicProofs=null,relicNotice='',relicLoading=false;
// Each tap is one paid purchase. Never queue taps while a request or reveal is active.
let relicSummonBusy=false,lastRelicSummonTap=0,lastSummonBlockToast=0;
let noteOpen=false; // the tapped-open mode note (see the click listener near the end)
const RELIC_SUMMON_TAP_GAP_MS=1200;
let lastRelicLedgerId=null;
let relicView={...relicDefaultView(),previewMode:'competitive',previewAmount:500},relicReveal=null;
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
let stockShockNotice=null;
let stockShockConfirmation=null;
let luxuryConfirmation=null;
let stockShockSelection={symbol:MARKET[0].id,direction:'up',strength:25,eventId:'auto',headline:'',body:''};
let detail=null;
let showMA=true;
let renderedMarkup;
let activeEscalationOverlay=null;
const escalationSeen=new Set();
function seenEscalationKey(spin){return 'keso:esc-seen:'+state.selfUserId+':'+spin.id;}
function isEscalationSeen(spin){
 const key=seenEscalationKey(spin);
 try{return localStorage.getItem(key)==='1'||escalationSeen.has(key);}catch{return escalationSeen.has(key);}
}
function markEscalationSeen(spin){
 const key=seenEscalationKey(spin);escalationSeen.add(key);
 try{localStorage.setItem(key,'1');}catch{/* A replay stays available in the history on storage-restricted devices. */}
}
function showEscalationWheel(spin){
 if(activeEscalationOverlay)return;
 markEscalationSeen(spin);
 activeEscalationOverlay=makeEscalationWheel(spin,()=>{activeEscalationOverlay=null;queueMicrotask(maybeAutoEscalation);});
}
function maybeAutoEscalation(){
 if(activeEscalationOverlay||!live||screen==='title'||document.hidden||mutationPending||spinLock)return;
 const current=Date.now();
 const spin=state.escalationSpins?.find(s=>current-s.at>=0&&current-s.at<48*3600000&&!isEscalationSeen(s));
 if(spin)showEscalationWheel(spin);
}

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
/** A live account with any KP, bets, claims, horses or relic summons has played before. */
function returningPlayer(s){return Number(s?.cash)!==0||!!(s?.raceBets?.length||s?.mlBets?.length||s?.claims?.length||s?.horses?.length||s?.relics?.totalSummons||s?.trades?.length);}
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
const GROUPS={race:[['race','競馬'],['mleague','Mリーグ'],['casino','カジノ'],['duels','決闘'],['market','株']],directives:[['directives','指名'],['stable','馬主'],['shop','高級品'],['relics','遺物']]};
const groupOf=id=>Object.keys(GROUPS).find(g=>GROUPS[g].some(([s])=>s===id))??id;
function tabsFor(group){return `<div class="sub-tabs">${GROUPS[group].map(([id,label])=>`<button class="sub-tab ${screen===id?'active':''}" data-screen="${id}">${label}</button>`).join('')}</div>`;}
function subTabs(){return tabsFor('race');}

// Race playback state. The card, result and odds are pure functions of the race start time.
let raceDraft={type:'win',horse:null,order:[null,null,null]};
// Native confirmation dialogs can silently fail in Discord's iOS webview.
let pendingHorseSale=null;
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
let lastStill=0,lastRaceRefresh=0,raceGateSound=0,raceFinishSound=0,raceSeenRunning=0;
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
  // Gate bell when a race starts while watching, and a chime when one finishes in front of the player.
  if(!watch.finished){if(t<2000&&raceGateSound!==watch.card.id){raceGateSound=watch.card.id;playSfx('gate');}raceSeenRunning=watch.card.id;}
  else if(raceSeenRunning===watch.card.id&&raceFinishSound!==watch.card.id){raceFinishSound=watch.card.id;playSfx('finish');}
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
  let quote;try{if(live)quote=stockOrderQuote({priceUnits:state.stockMarket?.orderQuotes?.[activeSymbol]??price*STOCK_PRICE_SCALE,initialPrice:MARKET.find(s=>s.id===activeSymbol).initialPrice,side:tradeSide,quantity:qty});}catch(error){return escapeHTML(error.message);}
  const gross=quote?.gross??qty*price,fee=quote?.fee??Math.ceil(gross/100);
  if(!Number.isSafeInteger(qty)||qty<1||qty>100000||!Number.isSafeInteger(gross))return '数量は1〜100,000株の整数で入力してください';
  const total=quote?.total??(tradeSide==='buy'?gross+fee:gross-fee);
  const enough=tradeSide==='buy'?total<=state.cash:qty<=state.holdings[activeSymbol];
  return `<div class="asset-line"><span>保有 / 保有KP</span><strong>${state.holdings[activeSymbol]}株 / ${moneyCompact(state.cash)}</strong></div><div class="asset-line"><span>手数料（1%）</span><strong>${moneyCompact(fee)}</strong></div><div class="asset-line"><span>${tradeSide==='buy'?'支払':'受取'}見込</span><strong>${moneyCompact(total)}</strong></div>${enough?'':'<p class="helper">'+(tradeSide==='buy'?'保有KP':'保有株数')+'が不足しています</p>'}${quote?`<p class="helper">注文後の目安 ${moneyCompact(quote.priceAfter)}。数量による値動きを含む合計です。表示額より支払が増える・受取が減る場合は注文を止めます。</p>`:'<p class="helper">約定時の最新価格で計算します。</p>'}`;
}
function tradeHistory(){
  return `<div class="asset-card"><h2 class="panel-title">取引履歴</h2>${state.trades.length?state.trades.map(t=>`<div class="history-entry"><div>${MARKET.find(s=>s.id===t.symbol).name} ${t.side==='buy'?'買付':'売却'} ${fmt0(t.quantity)}株</div><div class="helper">${new Date(t.time).toLocaleString('ja-JP')} / ${t.gross!==undefined?'平均単価':'単価'} ${moneyCompact(t.price)}${t.gross!==undefined?' / 約定額 '+moneyCompact(t.gross):''} / 手数料 ${moneyCompact(t.fee)}</div></div>`).join(''):'<p class="helper">まだ取引はありません。</p>'}</div>`;
}

function tradePanel(){
  const s=MARKET.find(v=>v.id===activeSymbol);
  return `<div class="trade-box"><h3>注文</h3><div class="segment"><button data-trade-side="buy" class="${tradeSide==='buy'?'active':''}">買う</button><button data-trade-side="sell" class="${tradeSide==='sell'?'active':''}">売る</button></div><div class="field"><label for="trade-symbol">銘柄</label><select class="select" id="trade-symbol">${MARKET.map(v=>`<option value="${v.id}" ${v.id===activeSymbol?'selected':''}>${v.name}</option>`).join('')}</select></div><div class="field"><label for="trade-qty">数量（株）</label><input id="trade-qty" class="input" type="number" min="1" max="100000" step="1" value="1"></div><div class="field"><label for="trade-price">現在値</label><input id="trade-price" class="input mono" value="${fmt0(state.prices[s.id])} KP" disabled></div><div class="card-body" id="trade-estimate" aria-live="polite">${tradeEstimate()}</div><div class="action-row"><button class="action-btn primary" data-action="trade">${tradeSide==='buy'?'買付':'売却'}</button></div></div>`;
}

// カジノ: one game at a time (ルーレット・チンチロ・ブラックジャック).
let casinoGame='roulette';
let casinoBusy=false,casinoPresentation=null,casinoStage={},casinoSkipped=false,skipCasinoPause=null;
let slotReveal=null,slotFeatureTimer=null,slotPendingToast=''; // Server-settled slot bonus; playback is not another gambling operation.
const stopTempleReplay=()=>{if(slotFeatureTimer!==null){clearTimeout(slotFeatureTimer);slotFeatureTimer=null;}};
// Slot win reveal sound + announcer, timed to the BIG → MEGA → GOLDEN WIN titles (.stage-* delays 0 / .86s / 1.74s).
let slotCallTimers=[];
function slotWinFanfare(tier){
 slotCallTimers.forEach(clearTimeout);slotCallTimers=[];
 if(!tier){playSfx('slotTempleComplete');return;}
 playSfx(tier==='golden'?'slotGolden':tier==='mega'?'slotMega':'slotBig');
 // The held "WIIIN!" calls are long, so only the top tier is called, as its title lands.
 if(tier==='golden')slotCallTimers.push(setTimeout(()=>announce('Golden win!'),1740));
 else if(tier==='mega')slotCallTimers.push(setTimeout(()=>announce('Mega win!'),860));
 else announce('Big win!');
}
/** A result's sound, or the full big-win show for 8× the bet and up (and jackpots). */
function celebrate(net,bet,{jackpot=false,game}={}){const show=showBigWin(net,bet,{jackpot,game});if(!show)playResult(net,{jackpot});return show||Promise.resolve();}
function toTempleWin(done){stopTempleReplay();slotReveal={type:'win',done};slotWinFanfare(slotWinTier(done));render();}
function runTempleReplay(){
 stopTempleReplay();const current=slotReveal;
 if(!current||current.type!=='bonus'||current.done.bonus?.mode!=='respin')return;
 const bonus=current.done.bonus,step=current.step||0;
 slotFeatureTimer=setTimeout(()=>{
  if(slotReveal!==current||screen!=='casino'||casinoGame!=='slot')return;
  if(current.step>=bonus.steps.length){toTempleWin(current.done);return;}
  current.step++;
  const landed=bonus.steps[current.step-1]?.landed||[];
  playSfx(landed.length?'slotCoin':'slotRespin');
  if(current.step===bonus.steps.length)playSfx('slotTempleComplete');
  render();runTempleReplay();
 },step===0?1450:step>=bonus.steps.length?1550:950);
}
let minesCount=3,vpHold=[false,false,false,false,false];
function screenCasino(){
  const visible=casinoPresentation??state;
  const head=`<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">カジノ</h1><div class="small-actions"><span class="badge">所持 ${moneyCompact(visible.cash)}</span></div></div></header>${subTabs()}${gamePicker(casinoGame)}`;
  if(casinoGame==='chinchiro')return head+chinchiroView(visible,casinoStage,casinoBusy)+bottomNav()+'</div>';
  if(casinoGame==='blackjack')return head+blackjackView(visible,casinoStage,casinoBusy)+bottomNav()+'</div>';
  if(casinoGame==='mines')return head+minesView(visible,{busy:casinoBusy,count:minesCount,drafts})+bottomNav()+'</div>';
  if(casinoGame==='slot')return head+slotView(visible,{busy:casinoBusy,jackpot:live?state.jackpot:null,drafts,reveal:slotReveal})+bottomNav()+'</div>';
  if(casinoGame==='poker')return head+videoPokerView(visible,{busy:casinoBusy,hold:vpHold,drafts})+bottomNav()+'</div>';
  if(casinoGame==='baccarat')return head+baccaratView(visible,{busy:casinoBusy,drafts})+bottomNav()+'</div>';
  const recent=visible.spins?.[0];
  return `${head}<div class="center-panel"><div style="position:relative;width:var(--roulette-size,min(320px,86vw));margin:0 auto 18px"><div class="pointer"></div><div class="roulette-board" id="wheel" style="transform:rotate(${rotation|| (recent?outcomeAngle(recent.outcome):0)}deg)">${wheelView(betType==='number'?'numbers':betType,betNumber,[...numberBets.keys()])}<div class="roulette-center">${recent?recent.outcome:'K'}</div></div></div></div><div class="number-table" aria-label="ルーレットの数字">${Array.from({length:37},(_,n)=>`<button data-number="${n}" aria-pressed="${numberSelected(n)}" class="number-cell ${n===0?'green':redNumbers.has(n)?'red':'black'} ${numberSelected(n)?'selected':''}">${n}${betType==='number'&&numberBets.has(n)?`<small>${numberBets.get(n)} KP</small>`:''}</button>`).join('')}</div><p class="helper">ヨーロピアン式・0は緑。数字36倍／赤黒・偶奇・前半後半2倍／ダズン・列3倍（掛け金込み）。数字は複数選択OK。数字をもう一度タップすると解除。数字ごと100 KP以上、合計100,000 KPまで。</p><div class="bet-grid bet-groups">${[['2倍',[['red','赤'],['black','黒'],['even','偶数'],['odd','奇数'],['low','1〜18'],['high','19〜36']]],['3倍',[['dozen1','1〜12'],['dozen2','13〜24'],['dozen3','25〜36'],['column1','1列目'],['column2','2列目'],['column3','3列目']]],['36倍',[['number','数字指定']]]].map(([group,bets])=>`<div class="bet-group"><span class="bet-group-label">${group}</span><div class="bet-group-buttons">${bets.map(([id,label])=>`<button data-bet="${id}" class="${betType===id?'active':''}">${label}</button>`).join('')}</div></div>`).join('')}</div><div class="trade-box"><h3>ベット</h3>${betType==='number'?`<p class="helper">盤面から数字を選んでください。</p>${[...numberBets].map(([n,amount])=>`<div class="field"><label for="number-stake-${n}">${n} の掛け金</label><input id="number-stake-${n}" data-stake="${n}" class="input" type="number" min="100" max="100000" step="1" value="${amount}"></div>`).join('')}<strong>合計 <span id="number-bet-total">${moneyCompact([...numberBets.values()].reduce((a,b)=>a+b,0))}</span></strong>`:`<div class="field"><label for="bet-amount">賭け金</label><input id="bet-amount" class="input" type="number" min="100" max="100000" step="1" value="500"></div>`}<div class="action-row"><button class="action-btn primary" data-action="spin" ${spinLock?'disabled':''}>ルーレットを回す</button></div></div><div class="result-panel"><p class="result-title ${recent && recent.payout>0?'negative':recent?'positive':''}">${recent ? (recent.payout>0?'的中':'不的中') : '直近結果'}</p><div class="helper">${recent ? `出目 ${recent.outcome} / 賭け ${moneyCompact(recent.amount)} / 払戻 ${moneyCompact(recent.payout)}${recent.bets?'<br>'+recent.bets.map(b=>b.number+': '+moneyCompact(b.amount)).join(' · '):''}` : 'まだ抽選履歴はありません。'}</div></div>${bottomNav()}</div>`;
}

function useScreen(title,body,{preview=false}={}){
  return `<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">${title}</h1><span class="badge">${moneyCompact(state.cash)}</span></div></header>${tabsFor('directives')}${live||preview?`<div class="asset-list">${body}</div>`:'<div class="market-disclaimer">本番のKP口座をつなぐと使えます。</div>'}${bottomNav()}</div>`;
}
function screenStable(){return useScreen('馬主',live?ownerPanel(state,Date.now(),pendingHorseSale):'');}
function screenShop(){return useScreen('高級品',luxuryPanel(state,{readonly:!live,confirmation:luxuryConfirmation}),{preview:true});}
function screenRelics(){return useScreen('遺物',relicsPanel(state,{proofs:relicProofs,notice:relicNotice,loading:relicLoading,view:relicView,reveal:relicReveal,summonBusy:relicSummonBusy||wallet.pending}));}

function audioMixCard(){
  const on=audioMixEnabled();
  return `<div class="asset-card"><h2 class="panel-title">📱 iPhone：動画・音楽を止めない（実験）</h2><p class="helper">iPhoneでActivityを開くと、ピクチャインピクチャの動画や音楽が止まることがあります（Discordアプリ側の動作）。オンにすると、ほかのアプリの音と一緒に鳴らすようiPhoneに伝えます。効くかは端末とDiscordの版によります。Discordの通話の聞こえ方が変わったらオフにしてください。</p>${audioMixSupported()?'':'<p class="helper">この端末・アプリでは設定できません。</p>'}<div class="action-row"><button type="button" class="action-btn ${on?'primary':''}" data-action="audio-mix-toggle" aria-pressed="${on}">${on?'オン（タップでオフ）':'オフ（タップでオン）'}</button></div><p class="helper">変更後は、Activityを閉じて開き直すと確実です。</p></div>`;
}
function screenAssets(){
  return `<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">資産</h1><div class="small-actions">${live?'':'<button class="icon-btn" data-action="reset" aria-label="初期化">↺</button>'}</div></div></header><div class="wallet-strip"><div class="wallet-item"><small>保有KP</small><strong>${moneyCompact(state.cash)}</strong></div><div class="wallet-item"><small>株式評価額</small><strong>${moneyCompact(portfolioValue(state))}</strong></div><div class="wallet-item"><small>純資産</small><strong>${moneyCompact(assets(state))}</strong></div></div>${live?'<div class="market-disclaimer">サーバー口座 · 試合報酬と決済は全端末で共通です。</div>':'<div class="market-disclaimer">端末内のデモ口座</div>'}${live?'':`<details class="panel"><summary class="card-body">開発用：テストKPの補充</summary><div class="action-row"><button class="action-btn" data-action="salary">テスト用KP +600 KP</button></div></details>`}${state.debt?.amount>0?`<div class="market-disclaimer">💸 借KP ${moneyCompact(state.debt.amount)}（${state.debt.intervalMinutes}分ごとに利子${state.debt.interestPercent}%）</div>`:''}<div class="asset-list">${live&&state.privateCasino?privateStockOperator(MARKET,{selection:stockShockSelection,notice:stockShockNotice,confirmation:stockShockConfirmation,events:state.marketEvents}):''}${live&&state.privateCasino?privateCasinoPanel(drafts,privateRacePreview,privateRoundMessage):''}<div class="asset-card"><div class="panel-title" style="margin-bottom:10px">保有銘柄</div>${MARKET.map(s=>`<div class="asset-line"><span>${s.name}</span><strong>${state.holdings[s.id]}株 / ${moneyCompact(state.holdings[s.id]*state.prices[s.id])}</strong></div>`).join('')}<div class="action-row"><button class="action-btn" data-screen="market">株を売買する</button></div></div>${tradeHistory()}${live?roastPanel(state):''}${live?trendPanel(trend,trendView):''}${live?healthPanel(health,healthLoading,healthError):''}${audioMixCard()}<div class="asset-card"><h2 class="panel-title">口座</h2>${live?'<div id="connection-slot"></div>':''}<button class="title-back" data-screen="title">タイトルへ戻る</button></div></div>${bottomNav()}</div>`;
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
  const activeDuel=duelData?.matches?.find(r=>r.id===duelActiveId)||duelData?.matches?.find(r=>r.status==='active'||r.status==='pending')||duelData?.matches?.[0];
  const gomokuPreviewCell=duelGomokuPreview&&activeDuel&&duelGomokuPreview.id===activeDuel.id&&duelGomokuPreview.version===activeDuel.version&&activeDuel.turn_user===state.selfUserId?duelGomokuPreview.cell:null;
  let html = screen==='title'?titleView(state,wallet.remembered,autoState,autoMessage,wallet.connected):screen==='home'?homeView(state,bottomNav()):screen==='play'?playView(state,drafts,bottomNav(),steamView):screen==='directives'?directivesView(state,drafts,bottomNav(),tabsFor('directives')):screen==='stable'?screenStable():screen==='shop'?screenShop():screen==='relics'?screenRelics():screen==='market'?screenMarket():screen==='casino'?screenCasino():screen==='duels'?duelScreen({info:duelData,user:state.selfUserId,live,cash:state.cash,selectedId:duelActiveId,game:duelGame,stake:duelStake,target:duelTarget,busy:duelBusy,error:duelError,confirmResign:duelResignConfirm,pokerPicks:duelPokerPicks,fallbackMembers:state.members??[],opponentPickerOpen:duelOpponentPickerOpen,loading:duelLoading,gomokuPreviewCell,recentMoves:duelRecentMoves,localMoveHistory:duelMoveHistory,guessDraft:duelGuessDraft,
riskConfirm:duelRiskConfirm===`create:${duelGame}:${duelTarget}:${duelStake}`?'create':activeDuel&&duelRiskConfirm===`accept:${activeDuel.id}:${activeDuel.version}:${activeDuel.stake}`?'accept':'',nav:bottomNav()}):screen==='mleague'?mleagueScreen({state,live,draft:{...mlDraft,amount:drafts['ml-amount']},tabs:subTabs(),nav:bottomNav()}):screen==='race'?screenRace():screenAssets();
  // 効果音 switch for the casino and racing screens (off unless the player turns it on).
  setBgmScene(screen==='casino'||screen==='race'?screen:'');
  if((screen==='casino'||screen==='race')&&sfxEnabled())preloadSfx(); // fetch the rendered sounds before the first win
  if(screen==='casino'||screen==='race'){
   const on=sfxEnabled(),open=on&&sfxVolumeOpen;
   const slider=(kind,label)=>`<label class="sfx-volume-row"><span>${label}</span><input type="range" min="0" max="100" step="5" value="${sfxVolume(kind)}" data-sfx-volume="${kind}" aria-label="${label}の音量"><output data-sfx-volume-value="${kind}">${sfxVolume(kind)}%</output></label>`;
   html=html.replace('</h1>',`</h1><span class="sfx-controls"><button type="button" class="sfx-toggle" data-action="sfx-toggle" aria-pressed="${on}" title="カジノ・競馬の効果音">${on?'🔊':'🔇'}<span>効果音</span></button>${on?`<button type="button" class="sfx-volume-btn" data-action="sfx-volume" aria-expanded="${open}" aria-controls="sfx-volume-panel" title="音量">🎚<span>音量</span></button>`:''}${open?`<div class="sfx-volume-panel" id="sfx-volume-panel" role="group" aria-label="音量">${slider('effects','効果音')}${slider('voice','実況ボイス')}${slider('bgm','BGM')}<button type="button" class="action-btn" data-action="bgm-toggle" aria-pressed="${bgmEnabled()}">${bgmEnabled()?'BGMをオフにする':'BGMをオンにする'}</button><p>BGMは初期オフ。小音量で通話を優先。PeriTune（むつき醒）／CC BY 4.0。競馬：Fight2、カジノ：Enchanter2。<a href="https://peritune.com/about/" target="_blank" rel="noopener noreferrer">利用条件</a></p></div>`:''}</span>`);
  }
  const previousView=app.querySelector('.screen')?.dataset.view;
  // Do not carry an expanded home feed into a different screen: closed
  // disclosures must not trigger 10-second D1 polling in the background.
  const communityOpen=previousView===screen?app.querySelector('details.community-feed')?.open:undefined;
  const openDetails=[...app.querySelectorAll('details:not(.community-feed)')].map(el=>el.open);
  const focusedElement=document.activeElement;
  const focused=focusedElement?.id;
  const duelGuessSelection=focused==='duel-guess'?[focusedElement.selectionStart,focusedElement.selectionEnd]:null;
  const focusData=focusedElement && Object.entries(focusedElement.dataset).find(([key])=>['screen','marketTab','marketMode','tradeSide','bet','action','open','raceHorse','raceType'].includes(key));
  const warning=live?connectionError:sessionOnly?'端末に保存できないため、この画面を閉じると変更が失われます。':!navigator.locks?.request?'このブラウザでは安全な保存を利用できません。HTTPS対応の最新ブラウザで開いてください。':'';
  const connection=live?`<div class="kp-connection"><span>${wallet.pending?'通信結果の確認待ち':wallet.remembered?'KP口座 接続中':'KP口座 一時接続'}</span><button data-action="refresh-kp">${wallet.pending?'通信結果を確認':'残高を更新'}</button><button data-action="disconnect-kp">接続を解除</button></div>`:'';
  const withControls=html.includes('<div id="connection-slot"></div>')?html.replace('<div id="connection-slot"></div>',connection):wallet.pending?(html.includes('</header>')?html.replace('</header>','</header>'+connection):connection+html):html; // an unconfirmed payment is shown on every screen, the title included
  const withFeed=live&&screen!=='title'&&screen!=='duels'?withControls.replace('</header>','</header>'+communityPanel([],screen==='home')):withControls;
  const markup=withFeed.replace('<div class="screen">','<div class="screen" data-view="'+screen+'">'+(warning?`<div class="storage-warning" role="status">${warning}</div>`:''))+detailSheet();
  // A quote/balance poll must not replace a pressed button when its display is unchanged.
  if(markup===renderedMarkup)return;
  // Tells the guide (guide/activity-guide.js) that this KP account has already played, so no first-run tour.
  document.documentElement.dataset.kesoReturning=live&&returningPlayer(state)?'1':'';
  const oldGomoku=app.querySelector('[data-duel-board-scroll]');
  const oldBoardScroll=oldGomoku?{id:oldGomoku.dataset.duelBoardScroll,left:oldGomoku.scrollLeft,top:oldGomoku.scrollTop}:null;
  app.innerHTML=markup;renderedMarkup=markup;
  const newGomoku=app.querySelector('[data-duel-board-scroll]');
  if(newGomoku){
    if(oldBoardScroll?.id===newGomoku.dataset.duelBoardScroll){newGomoku.scrollLeft=oldBoardScroll.left;newGomoku.scrollTop=oldBoardScroll.top;}
    else{newGomoku.scrollLeft=(newGomoku.scrollWidth-newGomoku.clientWidth)/2;newGomoku.scrollTop=(newGomoku.scrollHeight-newGomoku.clientHeight)/2;}
  }
  if(noteOpen)app.querySelector('.market-disclaimer')?.classList.add('open');
  app.querySelectorAll('details:not(.community-feed)').forEach((el,index)=>{el.open=openDetails[index]??el.open;});
  if(communityOpen!==undefined){const feed=app.querySelector('details.community-feed');if(feed)feed.open=communityOpen;}
  for (const [id,value] of Object.entries(drafts)) { const input=document.getElementById(id); if(input) input.value=value; }
  if(focused&&!casinoBusy) document.getElementById(focused)?.focus();
  if(duelGuessSelection){const input=document.getElementById('duel-guess');if(input&&duelGuessSelection[0]!==null&&duelGuessSelection[1]!==null)input.setSelectionRange(...duelGuessSelection);}
  else if(focusData&&!casinoBusy){const [key,value]=focusData;const match=[...app.querySelectorAll('button,[data-open]')].find(el=>el.dataset[key]===value);match?.focus();}
  if(detail) $('.screen').inert=true;
  document.body.style.overflow=detail?'hidden':'';
  paintCommunity();
  // Count-up is only presentation: the actual KP was already committed.
  const counter=$('[data-slot-countup]');
  if(counter&&!counter.dataset.counting){
    counter.dataset.counting='1';
    const target=Number(counter.dataset.slotCountup),duration=slotReveal?.type==='win'?(slotReveal.done.bonus?.mode==='respin'?(slotWinTier(slotReveal.done)==='golden'?6300:5300):(slotWinTier(slotReveal.done)==='golden'?2400:1450)):1100;
    if(Number.isSafeInteger(target)&&target>=0&&!reducedMotion?.matches){
      const started=performance.now();
      const tick=now=>{
        if(!counter.isConnected)return;
        const x=Math.min(1,(now-started)/duration),eased=1-(1-x)**3;
        counter.textContent=Math.floor(target*eased).toLocaleString('ja-JP');
        if(x<1)requestAnimationFrame(tick);else counter.textContent=target.toLocaleString('ja-JP');
      };
      counter.textContent='0';requestAnimationFrame(tick);
    }
  }
  ensureRaceLoop();
  if(live&&screen!=='title'&&Array.isArray(state.escalationSpins))queueMicrotask(maybeAutoEscalation);
}


function showRelicReward(bonus,base=0,names=[]){
 if(!Number.isFinite(bonus)||bonus<=0)return;
 document.getElementById('relic-kp-award')?.remove();
 const el=document.createElement('div');el.id='relic-kp-award';el.className='relic-kp-award';
 el.setAttribute('role','status');el.setAttribute('aria-live','polite');
 const title=document.createElement('strong');title.textContent='✦ 遺物ボーナス ＋'+Math.floor(bonus).toLocaleString('ja-JP')+' KP';
 const info=document.createElement('span');info.textContent=base>0?'報酬 '+Math.floor(base).toLocaleString('ja-JP')+' KP → 合計 '+Math.floor(base+bonus).toLocaleString('ja-JP')+' KP':'確定済みの追加KPを獲得';
 const source=document.createElement('small');source.textContent=(names??[]).slice(0,3).join(' ／ ');
 const close=document.createElement('button');close.type='button';close.textContent='閉じる';close.addEventListener('click',()=>el.remove());
 el.append(title,info,source,close);document.body.appendChild(el);
 setTimeout(()=>el.remove(),6500);
}
const relicRewardGate=createRelicRevealGate(showRelicReward);
function observeRelicLedger(){
 const latest=Array.isArray(state?.ledger)?state.ledger.find(row=>row.kind==='relic'):null;
 if(!latest)return;
 const id=String(latest.id??latest.at??'');
 if(lastRelicLedgerId!==null&&id&&lastRelicLedgerId!==id&&Number(latest.delta)>0)relicRewardGate.notify(Number(latest.delta));
 lastRelicLedgerId=id;
}

async function refreshWallet(resume=false){
 try{if(resume&&wallet.pending)await wallet.resume();state=await wallet.state();observeRelicLedger();connectionError='';if(!detail)render();}
 catch(error){connectionError=error.message;if(!detail)render();if(resume)throw error;}
}
// Live wallets: the server rolls the dice and draws the cards. The demo uses the same rules with the browser's crypto.
const CASINO_DEMO={chinchiro:(s,a)=>playChinchiro(s,a,cryptoDie),'bj-start':(s,a)=>bjStart(s,a,cryptoCard),'bj-hit':s=>bjHit(s,cryptoCard),'bj-stand':s=>bjStand(s,cryptoCard),'bj-double':s=>bjDouble(s,cryptoCard)};
const BJ_RESULTS={win:'勝ち',lose:'負け',push:'引き分け',bust:'バースト',blackjack:'ブラックジャック！','dealer-blackjack':'ディーラーのブラックジャック'};
async function doCasino(action){
  const input=action==='chinchiro'?$('#chinchiro-amount'):action==='bj-start'?$('#bj-amount'):null;
  const amount=input?Number(input.value):undefined;
  if(input&&(!Number.isSafeInteger(amount)||amount<100||amount>100000))throw new Error('賭け金は100〜100,000 KPの整数です');
  if(casinoBusy)return;
  const before=structuredClone({cash:state.cash,chinchiro:state.chinchiro??[],blackjack:state.blackjack??null,bjHistory:state.bjHistory??[]});
  relicRewardGate.begin(); // Preserve dice/card suspense until all reveal frames have finished.
  casinoBusy=true;casinoSkipped=!!reducedMotion?.matches;
  casinoPresentation={...before,chinchiro:action==='chinchiro'?[]:before.chinchiro,bjHistory:action==='bj-start'?[]:before.bjHistory};
  casinoStage={phase:'waiting'};render();unlockSfx();
  $('.casino-arena')?.scrollIntoView({block:'start',behavior:'auto'});
  try{
    const result=live?await liveOperation(action,input?{amount}:{}):await commit(next=>CASINO_DEMO[action](next,amount));
    for(const frame of casinoFrames(action,before,result)){
      if(casinoSkipped)break;
      casinoPresentation=frame.view;casinoStage=frame.stage;render();
      const phase=frame.stage?.phase;if(phase==='rolling')playSfx('dice');else if(phase==='landing')playSfx('diceStop');else if(phase==='dealing')playSfx('card');else if(phase==='settled'&&action==='chinchiro')await celebrate(frame.stage.net,amount,{game:'chinchiro'});
      await new Promise(resolve=>{const timer=setTimeout(()=>{skipCasinoPause=null;resolve();},frame.ms);skipCasinoPause=()=>{clearTimeout(timer);skipCasinoPause=null;resolve();};});
    }
    const signed=n=>(n>0?'+':n<0?'−':'±')+moneyCompact(Math.abs(n));
    if(action==='chinchiro'&&casinoSkipped)await celebrate(result.net,amount,{game:'chinchiro'});
    if(action!=='chinchiro'&&result.done)await celebrate(result.done.net,result.done.bet,{game:'blackjack'});
    if(action==='chinchiro')toast(`${result.net>0?'勝ち':result.net<0?'負け':'分け'} ${signed(result.net)}`);
    else if(result.done)toast(`${BJ_RESULTS[result.done.result]??''} ${signed(result.done.net)}`);
  }finally{casinoBusy=false;casinoPresentation=null;casinoStage={};skipCasinoPause=null;render();
    relicRewardGate.finish();
    const nextAction=action==='chinchiro'?'chinchiro':state.blackjack?'bj-hit':'bj-start';
    $(`[data-action="${nextAction}"]`)?.focus({preventScroll:true});
  }
}
// マインズ・スロット・ビデオポーカー・バカラ: the server draws for live wallets, the browser's crypto for the demo.
const MORE_DEMO={'mines-start':(s,a)=>minesStart(s,a.amount,a.mines),'mines-pick':(s,a)=>minesPick(s,a.cell,cryptoInt),'mines-cashout':s=>minesCashout(s,cryptoInt),
 slot:(s,a)=>playSlot(s,a.amount,cryptoInt),'vp-deal':(s,a)=>vpDeal(s,a.amount,cryptoInt),'vp-draw':(s,a)=>vpDraw(s,a.hold,cryptoInt),baccarat:(s,a)=>playBaccarat(s,a.amount,a.side,cryptoCard)};
const MORE_STAKE={'mines-start':'#mines-amount',slot:'#slot-amount','vp-deal':'#vp-amount',baccarat:'#baccarat-amount'};
async function doMoreCasino(action,extra={}){
  if(casinoBusy||slotReveal)return;
  const args={...extra};
  if(MORE_STAKE[action]){const amount=Number($(MORE_STAKE[action])?.value);if(!Number.isSafeInteger(amount)||amount<100||amount>100000)throw new Error('賭け金は100〜100,000 KPの整数です');args.amount=amount;drafts[MORE_STAKE[action].slice(1)]=String(amount);}
  if(action==='mines-start')args.mines=minesCount;
  if(action==='vp-draw')args.hold=[...vpHold];
  const slow=['slot','baccarat'].includes(action)&&!reducedMotion?.matches;
  // The server settles before the animation. Keep wallet and result history masked.
  casinoPresentation=structuredClone(state);relicRewardGate.begin();
  let keepGateForSlot=false;
  casinoBusy=true;render();
  unlockSfx();if(action==='slot')playSfx('reel',{duration:slow?1.1:.4});else if(['baccarat','vp-deal','vp-draw'].includes(action))playSfx('card');else if(action==='mines-start')playSfx('chip');
  try{
    const started=Date.now();
    const result=live?await liveOperation(action,args):await commit(next=>MORE_DEMO[action](next,args));
    if(slow)await new Promise(resolve=>setTimeout(resolve,Math.max(0,(action==='slot'?1100:700)-(Date.now()-started))));
    if(action==='vp-deal'||action==='vp-draw')vpHold=[false,false,false,false,false];
    const done=result?.done;
    if(action==='slot')playSfx('reelStop');
    if(action==='mines-pick')playSfx(done&&done.net<0?'boom':'gem');
    if(done&&action==='slot'){
      if(done.bonus){slotReveal=done.bonus.mode==='respin'?{type:'bonus',done,step:0}:{type:'bonus',done,picks:[]};playSfx('slotTemple');if(done.bonus.mode==='respin')runTempleReplay();}
      else{
        const tier=slotWinTier(done);
        if(tier){slotReveal={type:'win',done};slotWinFanfare(tier);}
        else await celebrate(done.net,done.bet,{jackpot:!!done.jackpot,game:'slot'});
      }
      keepGateForSlot=Boolean(slotReveal);
    }else if(done&&!(action==='mines-pick'&&done.net<0)){
      await new Promise(resolve=>setTimeout(resolve,60));
      await celebrate(done.net,done.bet,{game:done.game});
    }
    if(done){
      const signed=n=>(n>0?'+':n<0?'−':'±')+moneyCompact(Math.abs(n));
      const message=done.game==='slot'&&done.jackpot?`ジャックポット！ ${signed(done.net)}`:done.game==='video-poker'?`${VP_NAMES[done.hand]} ${signed(done.net)}`:done.game==='mines'&&done.net<0?`地雷… ${signed(done.net)}`:`${done.net>0?'勝ち':done.net<0?'負け':'分け'} ${signed(done.net)}`;
      if(keepGateForSlot)slotPendingToast=message;else toast(message);
    }
  }finally{
    casinoBusy=false;
    if(!keepGateForSlot)casinoPresentation=null;
    render();
    if(!keepGateForSlot)relicRewardGate.finish();
  }
}
async function liveOperation(action,args){
 if(connectionError)throw Error('残高を更新してから操作してください。');
 const result=await wallet.operate(action,args);
 try{state=await wallet.state();observeRelicLedger();connectionError='';}catch{connectionError='決済済みです。残高を更新してください。';}
 if(Number(result?.relicBonus)>0){
  const actual=state?.relics?.lastNativeEffect;
  relicRewardGate.notify(Number(result.relicBonus),Number(actual?.amount??0),actual?.names??[]);
 }
 // 負けにも遺物の倍率がかかる（カジノ・株・競馬・Mリーグ、上限つき）。
 if(Number(result?.relicPenalty)>0)toast(`🩸 遺物の反動 −${Number(result.relicPenalty).toLocaleString('ja-JP')} KP（負けにも装備中の遺物の倍率がかかります）`);
 return result;
}

async function doTrade(){
  const symbol=$('#trade-symbol')?.value || activeSymbol; const qty=Number($('#trade-qty')?.value);
  const side=tradeSide;
  activeSymbol=symbol; if(live){const quote=stockOrderQuote({priceUnits:state.stockMarket?.orderQuotes?.[symbol]??state.prices[symbol]*STOCK_PRICE_SCALE,initialPrice:MARKET.find(s=>s.id===symbol).initialPrice,side,quantity:qty});try{await liveOperation('trade',{symbol,side,quantity:qty,pricingVersion:STOCK_ORDER_VERSION,limit:quote.total});}catch(error){if(error.message?.includes('株価が変わった')){try{state=await wallet.state();render();}catch{connectionError='株価を更新できません。残高を更新してください。';render();}}throw error;}}else await commit(next => trade(next,symbol,side,qty)); render(); toast(`${MARKET.find(v=>v.id===symbol).name}を${side==='buy'?'買付':'売却'}した`);
}
async function doSpin(){
  if(spinLock)return;
  const bets=[...numberBets].map(([number,amount])=>({number,amount}));
  const amount=betType==='number'?validateNumberBets(bets).total:Number($('#bet-amount')?.value);
  const choice=0;
  if(!Number.isSafeInteger(amount)||amount<100||amount>100000||amount>state.cash)throw new Error('賭け額は100〜100,000 KP（所持金以内）');
  if(betType==='number'&&(!Number.isInteger(choice)||choice<0||choice>36))throw new Error('数字は0〜36で指定');
  const lockedType=betType==='number'?'numbers':betType;
  const outcome=live?null:cryptoRouletteNumber();
  casinoPresentation=structuredClone(state);relicRewardGate.begin();
  spinLock=true;unlockSfx();
  try{
    const result=live?await liveOperation('spin',{type:lockedType,amount,choice,...(lockedType==='numbers'?{bets}:{})}):await commit(next=>lockedType==='numbers'?spinNumbers(next,bets,outcome):spin(next,lockedType,amount,choice,outcome));
    const wheel=$('#wheel'),button=$('[data-action="spin"]');if(button)button.disabled=true;
    rotation=Math.ceil(rotation/360)*360+1440+outcomeAngle(result.outcome);
    if(wheel){wheel.style.transition='transform 1.8s cubic-bezier(.15,.82,.14,1)';wheel.style.transform=`rotate(${rotation}deg)`;}
    playSfx('spin',{duration:1.8});
    await new Promise(resolve=>setTimeout(resolve,1800));
    playSfx('land');
    casinoPresentation=null;render();
    await new Promise(resolve=>setTimeout(resolve,140));
    await celebrate((result.payout??0)-amount,amount,{game:'roulette'});
    toast(result.payout>0?`的中 ${moneyCompact(result.payout)}`:`出目 ${result.outcome}`);
  }finally{
    spinLock=false;casinoPresentation=null;render();relicRewardGate.finish();
  }
}

// メンバーのKP推移: tapping (or hovering on a mouse) a day on the chart shows everyone's KP that day.
const trendDay=e=>{const hit=e.target.closest?.('[data-trend-day]');if(!hit)return;const day=Number(hit.dataset.trendDay);if(trendView.day!==day){trendView.day=day;render();}};
addEventListener('click',trendDay);
addEventListener('pointermove',e=>{if(e.pointerType==='mouse')trendDay(e);});
// Client-only filter state; no D1 requests for typing or paging.
for(const eventName of ['input','change'])addEventListener(eventName,e=>{
 if(eventName==='input'&&screen==='duels'&&e.target.id==='duel-guess'){duelGuessDraft=e.target.value;return;}
 if(eventName==='change'&&screen==='duels'&&e.target.id==='duel-bid-count'){
  const match=duelData?.matches?.find(x=>x.id===duelActiveId),face=document.getElementById('duel-bid-face');
  if(match?.game==='bluffdice'&&face){
   try{const bid=JSON.parse(match.board).bid,count=Number(e.target.value);
    for(const option of face.options)option.disabled=!!bid&&(count<bid.count||(count===bid.count&&Number(option.value)<=bid.face));
    if(face.selectedOptions[0]?.disabled)face.value=[...face.options].find(o=>!o.disabled)?.value??'';
   }catch{}
  }return;
 }
 if(eventName==='change'&&screen==='duels'&&['duel-game','duel-stake','duel-target'].includes(e.target.id)){
  if(e.target.id==='duel-game'){duelGame=e.target.value;duelGuessDraft='';}
  if(e.target.id==='duel-stake')duelStake=Number(e.target.value);
  if(e.target.id==='duel-target')duelTarget=e.target.value;
  duelRiskConfirm=null;render();return;
 }
 const sfxSlider=e.target.closest?.('[data-sfx-volume]');
 if(sfxSlider&&(screen==='casino'||screen==='race')){
  const kind=sfxSlider.dataset.sfxVolume,n=setSfxVolume(kind,sfxSlider.value);
  const output=document.querySelector(`[data-sfx-volume-value="${kind}"]`);if(output)output.textContent=n+'%';
  // Letting go plays a sample at the new level: a win chime, or the MEGA WIN call.
  if(eventName==='change'&&kind!=='bgm')kind==='voice'?announce('Mega win!'):playSfx('win');
  return;
 }
 const audioVolume=e.target.closest?.('[data-relic-sound-volume]');
 if(audioVolume&&screen==='relics'){
  if(eventName==='input'){
   const n=setRelicSoundVolume(audioVolume.value);
   const output=document.querySelector('#relic-v9-volume-value');
   if(output)output.textContent=n+'%';
  }
  return;
 }
 const preview=e.target.closest?.('[data-relic-preview]');
 if(preview&&screen==='relics'&&eventName==='change'){
  const key=preview.dataset.relicPreview;
  if(key==='mode'||key==='amount'){
   relicView=key==='mode'
    ?{...relicView,previewMode:preview.value,previewAmount:preview.value==='spikerush'?40:500}
    :{...relicView,previewAmount:Number(preview.value)};
   render();
  }
  return;
 }
 const exchangeEl=e.target.closest?.('[data-relic-exchange-filter]');
 if(exchangeEl&&screen==='relics'){
  const key=exchangeEl.dataset.relicExchangeFilter;
  if(!['exchangeQuery','exchangeOwnership','exchangeSort','exchangeSelected'].includes(key))return;
  if(eventName==='input'&&key!=='exchangeQuery')return;
  if(eventName==='change'&&key==='exchangeQuery')return;
  const caret=key==='exchangeQuery'?[exchangeEl.selectionStart,exchangeEl.selectionEnd]:null;
  relicView={...relicView,[key]:exchangeEl.value};
  render();
  if(caret){
   const field=document.querySelector('#relic-exchange-search');
   field?.focus({preventScroll:true});
   if(caret[0]!==null&&caret[1]!==null)field?.setSelectionRange(caret[0],caret[1]);
  }
  return;
 }
 const el=e.target.closest?.('[data-relic-filter]');
 if(!el||screen!=='relics')return;
 const key=el.dataset.relicFilter;
 if(!['query','source','rarity','mode','sort','ownership'].includes(key))return;
 if(eventName==='input'&&key!=='query')return;
 if(eventName==='change'&&key==='query')return;
 const caret=key==='query'?[el.selectionStart,el.selectionEnd]:null;
 relicView={...relicView,[key]:el.value,...(key==='ownership'&&el.value==='unowned'?{equippedOnly:false}:{}),page:0};
 render();
 if(caret){
  const field=document.querySelector('#relic-search');
  field?.focus({preventScroll:true});
  if(caret[0]!==null&&caret[1]!==null)field?.setSelectionRange(caret[0],caret[1]);
 }
});
addEventListener('click',async e=>{
  const t=e.target.closest?.('button,[data-open]'); if(!t) return;
  if(t.dataset.duelTargetToggle){duelOpponentPickerOpen=!duelOpponentPickerOpen;render();return;}
  if(t.dataset.duelTargetOption){duelTarget=t.dataset.duelTargetOption;duelRiskConfirm=null;duelOpponentPickerOpen=false;render();return;}
  if(t.dataset.duelSelect){duelActiveId=t.dataset.duelSelect;duelResignConfirm=false;duelPokerPicks=[];duelGuessDraft='';duelRiskConfirm=null;duelGomokuPreview=null;render();return;}
  if(t.dataset.duelCard!==undefined){const i=Number(t.dataset.duelCard);if(!Number.isInteger(i)||i<0||i>4)return;if(duelPokerPicks.includes(i))duelPokerPicks=duelPokerPicks.filter(x=>x!==i);else if(duelPokerPicks.length<3)duelPokerPicks=[...duelPokerPicks,i];else{toast('交換できるのは3枚までだ');return;}render();return;}
  if(t.dataset.duelRefresh){await refreshDuel(true);return;}
  if(t.dataset.duelCancelCell!==undefined){duelGomokuPreview=null;render();return;}
  if(t.dataset.duelCell!==undefined||t.dataset.duelConfirmCell!==undefined){
   const chosen=duelData?.matches?.find(r=>r.id===duelActiveId)||duelData?.matches?.find(r=>r.status==='active'||r.status==='pending')||duelData?.matches?.[0];
   if(chosen?.game==='gomoku'){
    const cell=Number(t.dataset.duelCell??t.dataset.duelConfirmCell);
    if(!Number.isSafeInteger(cell)||cell<0||cell>=225)return;
    if(t.dataset.duelCell!==undefined){
     if(duelBusy||chosen.status!=='active'||chosen.turn_user!==state.selfUserId)return;
     duelGomokuPreview={id:chosen.id,version:chosen.version,cell};render();return;
    }
    if(duelGomokuPreview?.id!==chosen.id||duelGomokuPreview.version!==chosen.version||duelGomokuPreview.cell!==cell||chosen.turn_user!==state.selfUserId){
     duelGomokuPreview=null;render();toast('盤面が更新された。もう一度マスを選択してください。');return;
    }
   }
  }
  if(t.dataset.duelAct||t.dataset.duelCell!==undefined||t.dataset.duelConfirmCell!==undefined){
   const action=t.dataset.duelCell!==undefined||t.dataset.duelConfirmCell!==undefined?'move':t.dataset.duelAct;
   if(action==='resign-preview'){duelResignConfirm=true;render();return;}
   if(action==='resign-cancel'){duelResignConfirm=false;render();return;}
   if(duelBusy||!live||!wallet.connected){toast('接続状態または対戦操作を確認してください。');return;}
   const match=duelData?.matches?.find(x=>x.id===duelActiveId)||duelData?.matches?.find(x=>x.status==='active'||x.status==='pending')||duelData?.matches?.[0];
   const highStakeKey=action==='create'&&duelStake>=50000?`create:${duelGame}:${duelTarget}:${duelStake}`:
      action==='accept'&&match?.stake>=50000?`accept:${match.id}:${match.version}:${match.stake}`:null;
    if(highStakeKey&&duelRiskConfirm!==highStakeKey){duelRiskConfirm=highStakeKey;render();return;}
    duelRiskConfirm=null;
    const mini=t.dataset.duelMini;
   const move=action!=='move'?{}:mini==='hitblow'?{guess:document.getElementById('duel-guess')?.value??''}:
     mini==='bid'?{choice:'bid',count:Number(document.getElementById('duel-bid-count')?.value),face:Number(document.getElementById('duel-bid-face')?.value)}:
     mini==='challenge'?{choice:'challenge'}:mini==='poker'?{cells:[...duelPokerPicks]} :{cell:Number(t.dataset.duelConfirmCell??t.dataset.duelCell)};
   const args=action==='create'?{action,game:duelGame,opponent:duelTarget,stake:duelStake}:
    {action,duel:match?.id,version:match?.version,...move};
   if(!duelPendingAction||JSON.stringify(duelPendingAction.args)!==JSON.stringify(args))duelPendingAction={id:crypto.randomUUID(),args};
   duelBusy=true;duelError='';render();
   try{
    const result=await wallet.duelAction({...duelPendingAction.args,id:duelPendingAction.id});
    duelPendingAction=null;duelActiveId=result.match.id;duelResignConfirm=false;duelPokerPicks=[];duelGomokuPreview=null;duelOpponentPickerOpen=false;if(action==='move')duelGuessDraft='';
    try{const [next,info]=await Promise.all([wallet.state(),wallet.duels()]);observeDuelChanges(info);state=next;duelData=info;}
    catch{duelError='対戦操作は確定したが、最新の盤面または口座の取得に失敗した。更新を押してください。';}
    toast(action==='create'?'挑戦状を送った！':action==='accept'?'決闘開始！':'盤面を更新した');
   }catch(error){
    duelError='通信結果または操作内容を確認できません。更新してから、必要に応じて同じ操作を再試行してください。 '+(error.message??'');duelGomokuPreview=null;
    try{duelData=await wallet.duels();}catch{}
   }finally{duelBusy=false;render();}
   return;
  }
  if(t.dataset.action==='audio-mix-toggle'){const on=!audioMixEnabled();setAudioMix(on);render();toast(on?'オンにしました。Activityを開き直してから動画を再生してみてください':'オフにしました');return;}
  if(sfxVolumeOpen&&t.dataset.action!=='sfx-volume'&&!t.closest('.sfx-volume-panel')){sfxVolumeOpen=false;document.querySelector('.sfx-volume-panel')?.remove();document.querySelector('[data-action=sfx-volume]')?.setAttribute('aria-expanded','false');}
  if(t.dataset.action==='sfx-volume'){sfxVolumeOpen=!sfxVolumeOpen;render();return;}
  if(t.dataset.action==='bgm-toggle'){const on=toggleBgm(screen);render();toast(on?'BGMをオンにしました（通話に配慮して小音量）':'BGMをオフにしました');return;}
  if(t.dataset.action==='sfx-toggle'){const on=toggleSfx();if(!on)sfxVolumeOpen=false;render();toast(on?'効果音をオンにしました（カジノ・競馬）':'効果音をオフにしました');return;}
  if(t.matches('[data-bet],[data-race-horse],[data-race-type],[data-race-amount],[data-casino-game],[data-mines-count],[data-number]'))playSfx('tick');
  if(t.dataset.action==='casino-skip'){casinoSkipped=true;skipCasinoPause?.();return;}
  if(casinoBusy&&(t.dataset.screen||t.dataset.casinoGame)){toast('演出をスキップすると移動できます');return;}
  const mutates=!!t.dataset.approve || !!t.dataset.complete || ['relic-market-list','relic-market-cancel','relic-market-buy-confirm','steam-library','steam-status','steam-link','steam-open','steam-confirm','steam-disconnect','steam-game','salary','trade','spin','race-bet','roast-level','horse-buy','horse-sell-approve','luxury-approve','reset','submit-claim','issue-directive','connect-kp','restore-kp','refresh-kp','disconnect-kp','auto-connect-kp','ml-buy','chinchiro','bj-start','bj-hit','bj-stand','bj-double','mines-start','mines-pick','mines-cashout','slot','vp-deal','vp-draw','baccarat','private-round','private-race','stock-shock','stock-shock-approve','stock-guerrilla-toggle','relic-summon','relic-equip','relic-auto-equip','relic-save-preset','relic-overwrite-preset','relic-load-preset','relic-remove-preset','relic-rename-preset','relic-claim-steam','relic-claim-unite','relic-recycle','relic-shop','relic-voucher','relic-voucher-buy'].includes(t.dataset.action);
  if(mutates && mutationPending){
    if(t.dataset.action==='relic-summon'&&Date.now()-lastSummonBlockToast>1200){toast('召喚結果を確認中。連打しても追加購入されません');lastSummonBlockToast=Date.now();}
    return;
  }
  if(mutates)mutationPending=true;
  try{
    if(t.dataset.escSpin){
      const spin=state.escalationSpins?.find(s=>s.id===t.dataset.escSpin);
      if(spin)showEscalationWheel(spin);
      return;
    }
    if(t.dataset.companion){await openCompanionGame(t.dataset.companion);return;}
    if(t.dataset.action==='relic-tab'){
      if(!['collection','gear','summon','records','exchange','market'].includes(t.dataset.tab))return;
      relicView={...relicView,section:t.dataset.tab};
      render();
      document.querySelector('.relic-v8-nav')?.scrollIntoView({block:'start',behavior:'auto'});
      return;
    }
    if(t.dataset.action==='relic-ownership'){
      if(!['all','owned','unowned'].includes(t.dataset.ownership))return;
      relicView={...relicView,ownership:t.dataset.ownership,equippedOnly:false,page:0};
      render();return;
    }
    if(t.dataset.action==='relic-open-exchange'){
      relicView={...relicView,section:'exchange',exchangeOwnership:'all',exchangeQuery:'',exchangeSelected:t.dataset.relic??''};
      render();
      document.querySelector('.relic-v8-nav')?.scrollIntoView({block:'start',behavior:'auto'});
      return;
    }
    if(t.dataset.action==='relic-layout'){
      relicView={...relicView,layout:t.dataset.layout==='list'?'list':'grid',page:0};
      render();
      return;
    }
    if(t.dataset.action==='relic-equipped-only'){
      relicView={...relicView,equippedOnly:!relicView.equippedOnly,ownership:'owned',page:0};
      render();
      return;
    }
    if(t.dataset.action==='relic-sound-toggle'){
      toggleRelicSound();render();return;
    }
    if(t.dataset.action==='relic-sound-preview'){
      // No KP operation or D1 read. The trusted preview tap also unlocks iOS sound.
      if(!primeRelicAudio()){toast('効果音をオンにして音量を上げてください。');return;}
      if(!previewRelicSound(t.dataset.tier))toast('音声の自動再生が制限された場合は、もう一度試聴をタップしてください。');
      return;
    }
    if(t.dataset.action==='relic-reveal-skip'){
      const panel=app.querySelector('.relic-reveal');
      panel?.classList.add('relic-reveal-instant');
      stopRelicSound();
      panel?.querySelector('[data-action="relic-reveal-close"]')?.focus();
      return;
    }
    if(t.dataset.action==='relic-reveal-sound'){
      primeRelicAudio();if(!playRelicSound(relicReveal))toast('端末の制限で音を再生できない場合がある。サウンド設定を確認してください。');
      return;
    }
    if(t.dataset.action==='relic-reveal-close'){stopRelicSound();relicReveal=null;lastRelicSummonTap=Date.now();render();return;} // the anti-repeat gap counts from closing the result, however long it stayed open
    if(t.dataset.action==='relic-page'){relicView.page=Number(t.dataset.page)||0;render();document.querySelector('.relic-v8-viewbar')?.scrollIntoView({block:'start',behavior:'auto'});return;}
    if(t.dataset.action==='relic-replay'){
      const idx=Number(t.dataset.historyIndex);
      const history=state.relics?.summonHistory;
      if(Array.isArray(history)&&Number.isInteger(idx)&&history[idx]){
        primeRelicAudio();relicReveal=history[idx];render();playRelicSound(relicReveal);
      }
      return;
    }
    if(t.dataset.action?.startsWith('relic-')){
      if(!live||!wallet.connected)throw Error('遺物は本番KP口座への接続が必要です。');
      const action=t.dataset.action==='relic-market-buy-confirm'?'relic-market-buy':t.dataset.action;
      if(action==='relic-market-buy-preview'){relicView.marketConfirmation=t.dataset.listing;render();return;}
      if(action==='relic-market-buy-abort'){relicView.marketConfirmation=null;render();return;}
      if(action==='relic-voucher-buy'){
        const name=$('#relic-voucher-name')?.value??'';
        const {horse}=await liveOperation('horse-buy',{box:'normal',name,useVoucher:true});
        relicProofs=await wallet.relics().catch(()=>relicProofs);
        relicNotice=horse.name+'（'+horse.gradeLabel+'）を引換券で迎えた。';
        render();toast(relicNotice);return;
      }
      if(action==='relic-summon'){
        if(relicReveal){toast('召喚結果を閉じてから次を引いてください');return;}
        const now=Date.now();
        if(relicSummonBusy||now-lastRelicSummonTap<RELIC_SUMMON_TAP_GAP_MS){toast('連打防止中。少し間を空けてください');return;}
        lastRelicSummonTap=now;
        primeRelicAudio(); // iOS: unlock sound during the trusted tap.
        relicSummonBusy=true;
        render(); // immediately disable purchase buttons and show the pending state.
      }
      const presetSelected=$('#relic-preset')?.value??'';
      const presetName=$('#relic-preset-name')?.value??'';
      const args=action==='relic-summon'?{count:Number(t.dataset.count)}:
       action==='relic-equip'?{relic:t.dataset.relic??'',slot:Number((relicView.section==='collection'?$('#relic-slot-gallery')?.value:$('#relic-slot')?.value)??0)}:
       action==='relic-auto-equip'?{goal:$('#relic-goal')?.value??'all'}:
       action==='relic-recycle'?{relic:$('#relic-recycle-id')?.value??'',count:Number($('#relic-recycle-count')?.value??1)}:
       action==='relic-shop'?{relic:$('#relic-shop-id')?.value??''}:
       action==='relic-voucher'?{}:
       action==='relic-market-list'?{relic:$('#relic-market-id')?.value??'',price:Number($('#relic-market-price')?.value??0)}:
       ['relic-market-buy','relic-market-cancel'].includes(action)?{listing:t.dataset.listing??''}:
       action==='relic-save-preset'?{preset:presetName}:
       action==='relic-overwrite-preset'?{preset:presetSelected}:
       action==='relic-rename-preset'?{preset:presetSelected,newName:presetName}:
       ['relic-load-preset','relic-remove-preset'].includes(action)?{preset:presetSelected}:
       action==='relic-claim-steam'?{event:t.dataset.event}:{tier:t.dataset.tier};
      const result=await liveOperation(action,args);
      if(['relic-equip','relic-auto-equip','relic-save-preset','relic-overwrite-preset','relic-load-preset','relic-remove-preset','relic-rename-preset','relic-claim-steam','relic-claim-unite','relic-recycle','relic-shop','relic-voucher','relic-market-list','relic-market-buy','relic-market-cancel'].includes(action)){
       try{relicProofs=await wallet.relics();}catch(error){relicNotice='装備は更新したが、効果一覧を再取得できなかった。'+(error.message??'');}
      }
      if(action==='relic-summon')relicReveal=result;
      if(action.startsWith('relic-market-'))relicView.marketConfirmation=null;
      relicNotice=action==='relic-market-list'?'「'+result.name+'」を闇市に出品した。':action==='relic-market-buy'?'「'+result.name+'」を'+result.paid.toLocaleString('ja-JP')+'KPで購入した。':action==='relic-market-cancel'?'「'+result.name+'」の出品を取り下げた。':action==='relic-recycle'?result.recycled+'個を欠片にして、'+result.gained+'欠片獲得した。':action==='relic-shop'?result.item.name+'を'+result.cost+'欠片で交換した。':action==='relic-voucher'?'My馬引換券を交換した。所持'+result.horseVouchers+'枚。':action==='relic-save-preset'?'「'+result.name+'」を保存した。':action==='relic-overwrite-preset'?'「'+result.name+'」を上書きした。':action==='relic-rename-preset'?'「'+result.name+'」に改名した。':action==='relic-load-preset'?'装備をプリセットから復元した。':action==='relic-remove-preset'?'プリセットを削除した。':action==='relic-auto-equip'?`おまかせ装備完了。4枠の合計戦力 ${result.power}`:action==='relic-summon'?`${result.count}連召喚：${result.cost.toLocaleString('ja-JP')} KPを使用。${result.highlights?.length?'大当たり '+result.highlights.map(v=>v.name).join('、'):'獲得遺物を図鑑に追加した。'}`:action==='relic-equip'?`装備変更完了。戦力 ${result.power}`:`${result.item.name} を獲得した。`;
      render();
      if(action==='relic-summon')playRelicSound(relicReveal);
      toast(relicNotice);return;
    }
    if(t.dataset.action==='stock-guerrilla-toggle'){
      if(!live||!state.privateCasino)throw Error('この操作は利用できません。');
      const enabled=state.marketEvents?.enabled===false;
      const result=await wallet.operate('stock-guerrilla-toggle',{enabled});
      state=await wallet.state();render();
      toast(result.enabled?'自動ゲリライベントを有効にしました':'自動ゲリライベントを停止しました');
      return;
    }
    if(t.dataset.action==='stock-shock-cancel'){
      stockShockConfirmation=null;
      stockShockNotice=null;
      render();
      return;
    }
    if(t.dataset.action==='stock-shock'||t.dataset.action==='stock-shock-approve'){
      if(!live||!state.privateCasino)throw Error('この操作は利用できません。');
      const symbol=$('#admin-stock-symbol')?.value,direction=$('#admin-stock-direction')?.value,strength=Number($('#admin-stock-strength')?.value);
      const stock=MARKET.find(s=>s.id===symbol);
      if(!stock||!['up','down'].includes(direction)||![10,25,50].includes(strength))throw Error('操作内容を確認してください。');
      const label=direction==='up'?'上昇':'下落';
      const mode=$('#admin-stock-news')?.value??'auto';
      const headline=$('#admin-stock-headline')?.value??stockShockSelection.headline??'';
      const body=$('#admin-stock-body')?.value??stockShockSelection.body??'';
      stockShockSelection={symbol,direction,strength,eventId:mode,headline,body};
      // Discord iOS embeds may silently suppress native window.confirm.
      // The operator always previews the *actual* fictional bulletin in-page
      // before the server mutates the shared market.
      if(t.dataset.action==='stock-shock'){
        const choices=stockStoryChoices(symbol,direction);
        const chosen=mode==='custom'
          ?{eventId:'custom',...validateCustomStory(headline,body)}
          :(()=>{const selected=mode==='auto'?choices[Math.floor(Math.random()*choices.length)]:choices.find(v=>v.id===mode);
             if(!selected)throw Error('ニュースを選び直してください。');
             return {eventId:selected.id,headline:selected.headline,body:selected.body};})();
        stockShockConfirmation={symbol,direction,strength,...chosen,mode};
        stockShockNotice=null;
        render();
        $('.stock-shock-confirmation')?.scrollIntoView({block:'nearest',behavior:'auto'});
        return;
      }
      if(!stockShockConfirmation||stockShockConfirmation.symbol!==symbol||
         stockShockConfirmation.direction!==direction||stockShockConfirmation.strength!==strength||
         stockShockConfirmation.mode!==mode||
         (mode==='custom'&&(stockShockConfirmation.headline!==validateCustomStory(headline,body).headline||
          stockShockConfirmation.body!==validateCustomStory(headline,body).body)))
        throw Error('操作条件が変更されました。もう一度確認してください。');
      const bulletin=stockShockConfirmation;
      stockShockConfirmation=null;
      t.disabled=true;t.textContent='送信中…';
      const pendingNotice=$('#stock-shock-notice');
      if(pendingNotice){pendingNotice.hidden=false;pendingNotice.className='stock-shock-notice waiting';pendingNotice.textContent='株価操作を送信しています…';}
      try{
        // "受け付けました" is shown only after the Worker confirms the durable write.
        // If the follow-up state refresh fails, the operation was still successful.
        const result=await wallet.operate('stock-shock',{symbol,direction,strength,eventId:bulletin.eventId,...(bulletin.eventId==='custom'?{headline:bulletin.headline,body:bulletin.body}:{})});
        const completed=`✅ 株価操作を受け付けました。${stock.name}を${strength}%${label}：${moneyCompact(result.before)} → ${moneyCompact(result.after)}\n【架空速報】${result.headline??bulletin.headline}`;
        stockShockNotice={kind:'success',text:completed};
        try{state=await wallet.state();connectionError='';}
        catch{connectionError='株価操作は完了していますが、最新の状態を取得できませんでした。残高を更新してください。';
          stockShockNotice={kind:'warning',text:completed+'。ただし最新の株価の再取得に失敗しました。残高を更新してください。'};}
        render();toast('株価操作を受け付けました');
      }catch(error){
        // A timeout may occur after the Worker committed the event. Never claim a
        // failed operation or offer a second shock until the pending ID is checked.
        stockShockNotice=wallet.pending
          ?{kind:'warning',text:'⚠️ 通信結果を確認できませんでした。操作済みの可能性があります。もう一度実行せず、「通信結果を確認」で確かめてください。'}
          :{kind:'error',text:'❌ 株価操作は受け付けられませんでした。'+(error.message||'操作内容を確認してください。')};
        render();toast(stockShockNotice.text);
      }
      return;
    }
    if(t.dataset.action==='auto-connect-kp'){await automaticConnect();return;}
    if(t.dataset.action?.startsWith('steam-')){
      if(!live||!wallet.connected)throw Error('先にKP口座へ接続してください。');
      const action=t.dataset.action;try{
        if(action==='steam-open'){if(!wallet.steamLinkRequest)throw Error('Steam接続をやり直してください。');await openSteamLogin(wallet.steamLinkRequest.url);return;}
        if(action==='steam-disconnect'&&!confirm('Steamの監視を止めますか？ 入金済みのKPと支給記録は残ります。'))return;
        steamView={...(steamView??{}),loading:true,error:'',notice:''};render();
        if(action==='steam-library'){const library=await wallet.steamLibrary();steamView={...(steamView??{}),library:library.games};}
        if(action==='steam-link')await wallet.startSteam();
        if(action==='steam-confirm')await wallet.confirmSteam();
        if(action==='steam-disconnect')await wallet.disconnectSteam();
        if(action==='steam-game')await wallet.steamGame(Number(t.dataset.app),t.dataset.active==='true');
        const status=await wallet.steamStatus(),pending=await wallet.steamPending();const notice=action==='steam-status'?steamConnectionMessage(status,pending,wallet.steamLinkRequest):'';steamView={...(steamView??{}),status,pending,link:wallet.steamLinkRequest,error:'',notice,loading:false};if(notice)toast(status.account?.active?'Steam接続済みです。':pending?.verified?'Steamの本人確認が届きました。':'Steamはまだ接続できていません。画面の案内をご確認ください。');
      }catch(error){steamView={...(steamView??{}),link:wallet.steamLinkRequest,error:error.message||'Steam接続を確認できません。',notice:'',loading:false};toast('Steam接続を確認できません。画面の案内をご確認ください。');}
      render();return;
    }
    if(t.dataset.action==='restore-kp'){state=await wallet.restoreStoredSession();live=true;autoState='connected';autoMessage='';connectionError='';screen='home';render();toast('保存済みのKP口座に再接続しました');return;}
    if(t.dataset.action==='connect-kp'){state=await wallet.connect($('#kp-connect-code').value);live=true;autoState='connected';autoMessage='';connectionError='';delete drafts['kp-connect-code'];screen='home';render();toast(wallet.remembered?'接続しました。次回は自動で接続します':'接続しました。この環境では閉じると再接続が必要です');return;}
    if(t.dataset.action==='private-round'){
      if(!live||!state.privateCasino)throw Error('この操作は利用できません。');
      const game=$('#private-game').value,args=game==='roulette'?{game,amount:Number($('#private-amount').value),number:Number($('#private-number').value)}:{game,amount:Number($('#private-amount').value),hand:$('#private-hand').value};
      const result=await liveOperation('private-casino',args),net=result.net??result.done?.net??(result.payout-result.amount);
      privateRoundMessage=(net>=0?'+':'')+moneyCompact(net);
      // The owner triggered a REAL, server-settled feature. Replay its exact timeline
      // in the regular slot view; the UI must not create a second wager or award.
      if(game==='slot'&&result.done?.bonus?.mode==='respin'){
        stopTempleReplay();casinoGame='slot';screen='casino';casinoBusy=false;
        slotReveal={type:'bonus',done:result.done,step:0};
        playSfx('slotTemple');render();runTempleReplay();
        toast('黄金神殿フィーチャー発動！');return;
      }
      render();toast(privateRoundMessage);return;
    }
    if(t.dataset.action==='private-race'){
      if(!live||!state.privateCasino)throw Error('この操作は利用できません。');
      privateRacePreview=await wallet.privateRace();render();return;
    }
    if(t.dataset.action==='refresh-kp'){await refreshWallet(true);render();return;}
    if(t.dataset.action==='disconnect-kp'){stopTempleReplay();slotReveal=null;slotPendingToast='';casinoPresentation=null;relicRewardGate.cancel();await wallet.disconnect();autoState=embedded?'paused':'idle';autoMessage='';live=false;trend=null;trendView={...trendView,error:'',focus:null,day:null};privateRacePreview=null;privateRoundMessage='';steamView=null;relicProofs=null;relicNotice='';stopRelicSound();relicReveal=null;relicView={...relicDefaultView(),previewMode:'competitive',previewAmount:500};connectionError='';state=store.state;screen='title';duelData=null;duelActiveId=null;duelPendingAction=null;duelOpponentPickerOpen=false;duelGomokuPreview=null;render();return;}
    if(t.dataset.casinoGame){if(spinLock||casinoBusy||slotReveal){toast('演出を閉じてから切り替えてください');return;}casinoGame=t.dataset.casinoGame;render();return;}
    if(t.dataset.screen){if(spinLock||casinoBusy||slotReveal){toast('演出を閉じてから切り替えてください');return;}detail=null;pendingHorseSale=null;luxuryConfirmation=null;screen=t.dataset.screen;render();if(screen==='duels')await refreshDuel(true);else duelOpponentPickerOpen=false;if(screen==='relics'&&live){relicLoading=true;render();try{relicProofs=await wallet.relics();}catch(error){relicNotice='実績データの取得に失敗した。'+(error.message??'');}finally{relicLoading=false;render();}}if(screen==='race')settleRaces();return;}
    if(t.dataset.action==='slot-close-reveal'){
      stopTempleReplay();slotReveal=null;casinoPresentation=null;render();
      relicRewardGate.finish();if(slotPendingToast){toast(slotPendingToast);slotPendingToast='';}
      $('[data-action="slot"]')?.focus({preventScroll:true});return;
    }
    if(t.dataset.action==='slot-feature-skip'){
      if(slotReveal?.type!=='bonus'||slotReveal.done.bonus?.mode!=='respin')return;
      toTempleWin(slotReveal.done);return;
    }
    if(t.dataset.action==='slot-open-altar'){
      if(!slotReveal||slotReveal.type!=='bonus'||slotReveal.picks.length>=3)return;
      const door=Number(t.dataset.altar);
      if(!Number.isInteger(door)||door<0||door>2||slotReveal.picks.some(p=>p.door===door))return;
      const award=slotReveal.done.bonus.awards[slotReveal.picks.length];
      slotReveal.picks.push({door,award});
      playSfx('slotAltar');render();return;
    }
    if(t.dataset.action==='slot-finish-bonus'){
      if(!slotReveal||slotReveal.type!=='bonus'||slotReveal.picks.length!==3)return;
      const done=slotReveal.done;
      slotReveal={type:'win',done};
      const tier=slotWinTier(done)||'big';
      slotWinFanfare(tier);render();return;
    }
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
    if(t.dataset.raceAmount){const input=$('#race-amount');if(input){input.value=t.dataset.raceAmount;input.dispatchEvent(new Event('input',{bubbles:true}));}return;}
    if(t.dataset.action==='horse-buy'){const {horse}=await liveOperation('horse-buy',{box:t.dataset.box,name:$('#horse-name')?.value??''});delete drafts['horse-name'];pendingHorseSale=null;render();toast(`${horse.name}（${horse.gradeLabel}）が仲間入りしました`);return;}
    if(t.dataset.action==='horse-sell'){
      const horse=state.horses?.find(h=>h.id===t.dataset.horse&&!h.retired_at);
      if(!live||!horse)throw Error('売れる馬が見つかりません。');
      pendingHorseSale=horse.id;render();return;
    }
    if(t.dataset.action==='horse-sell-cancel'){pendingHorseSale=null;render();return;}
    if(t.dataset.action==='horse-sell-approve'){
      const horse=state.horses?.find(h=>h.id===pendingHorseSale&&!h.retired_at);
      if(!live||!horse||horse.id!==t.dataset.horse)throw Error('売れる馬が見つかりません。');
      const {sold}=await liveOperation('horse-sell',{horseId:horse.id});
      pendingHorseSale=null;render();toast(`売却しました（+${moneyCompact(sold.refund)}）`);return;
    }
    if(t.dataset.action==='luxury'){
      if(!live||!wallet.connected)throw Error('高級品の購入には本番KP口座への接続が必要です。');
      const item=LUXURY.find(i=>i.id===t.dataset.item);if(!item)throw Error('品目を選んでください。');
      const args={item:item.id,target:$('#lux-target')?.value??'',text:$('#lux-text')?.value??'',title:$('#lux-title')?.value??'',horseId:$('#lux-horse')?.value??''};
      if(item.needs==='target'&&!args.target)throw Error('相手を選んでください。');
      if(item.needs==='text'&&!args.text.trim())throw Error('レース名を入力してください。');
      if(item.needs==='horse'||item.needs==='retired')if(!args.horseId)throw Error('馬を選んでください。');
      luxuryConfirmation={item:item.id,args,price:stockPrice(item.price,state.stockBenefits)};
      render();
      $('.luxury-confirmation')?.scrollIntoView({block:'nearest',behavior:'auto'});
      return;
    }
    if(t.dataset.action==='luxury-cancel'){luxuryConfirmation=null;render();return;}
    if(t.dataset.action==='luxury-approve'){
      if(!live||!wallet.connected||!luxuryConfirmation)throw Error('購入内容をもう一度確認してください。');
      const pending=luxuryConfirmation,item=LUXURY.find(i=>i.id===pending.item);
      if(!item)throw Error('品目を選び直してください。');
      await liveOperation('luxury',pending.args);
      luxuryConfirmation=null;
      render();toast(`${item.label}を買いました`);return;
    }
    if(t.dataset.action==='roast-level'){await liveOperation('roast-level',{level:t.dataset.level});render();toast('煽りレベルを変更しました');return;}
    if(t.dataset.action==='race-bet'){unlockSfx();
      const now=Date.now(),raceId=openRaceStart(now),args={raceId,type:raceDraft.type,horse:raceDraft.type==='trifecta'?raceDraft.order:raceDraft.horse,amount:Number($('#race-amount')?.value)};
      const bet=live?(await liveOperation('race-bet',args)).bet:await commit(next=>placeRaceBet(next,args,now));
      playSfx('ticket');render();toast(`${Array.isArray(bet.horse)?bet.horse.join('→')+' 3連単':bet.horse+'番'}の馬券を買いました（${(bet.odds/10).toFixed(1)}倍）`);return;
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
  finally { if(mutates)mutationPending=false;
    if(t.dataset.action==='relic-summon'){relicSummonBusy=false;render();}
  }
});

addEventListener('input',e=>{
 if(e.target.id==='admin-stock-headline'||e.target.id==='admin-stock-body'){
  stockShockSelection[e.target.id==='admin-stock-headline'?'headline':'body']=e.target.value;
  stockShockConfirmation=null;$('.stock-shock-confirmation')?.remove();
 }
});
addEventListener('change',e=>{
 if(['admin-stock-symbol','admin-stock-direction','admin-stock-strength','admin-stock-news','admin-stock-headline','admin-stock-body'].includes(e.target.id)){
  const needsRender=['admin-stock-symbol','admin-stock-direction','admin-stock-news'].includes(e.target.id);
  const symbol=$('#admin-stock-symbol')?.value,direction=$('#admin-stock-direction')?.value;
  stockShockSelection={symbol,direction,strength:Number($('#admin-stock-strength')?.value),
   eventId:['admin-stock-symbol','admin-stock-direction'].includes(e.target.id)?'auto':$('#admin-stock-news')?.value,
   headline:$('#admin-stock-headline')?.value??stockShockSelection.headline??'',
   body:$('#admin-stock-body')?.value??stockShockSelection.body??''};
  stockShockNotice=null;stockShockConfirmation=null;
  if(needsRender)render();
  else{
   $('.stock-shock-confirmation')?.remove();
   const notice=$('#stock-shock-notice');if(notice){notice.textContent='';notice.hidden=true;}
  }
 }
 if(e.target.id==='trade-symbol'){activeSymbol=e.target.value;render();}
 if(['lux-target','lux-title','lux-horse'].includes(e.target.id)){
   drafts[e.target.id]=e.target.value;
   if(luxuryConfirmation){luxuryConfirmation=null;$('.luxury-confirmation')?.remove();}
 }
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
  if(['lux-target','lux-text','lux-title','lux-horse'].includes(e.target.id)){
    drafts[e.target.id]=e.target.value;
    if(luxuryConfirmation){luxuryConfirmation=null;$('.luxury-confirmation')?.remove();}
  }
  if(e.target.id==='ml-amount'){drafts['ml-amount']=e.target.value;const preview=$('#ml-preview');if(preview)preview.textContent=mleaguePreview(state,{...mlDraft,amount:e.target.value});}
  if(e.target.dataset.raceOrder!==undefined){const idx=Number(e.target.dataset.raceOrder);raceDraft.order[idx]=e.target.value?Number(e.target.value):null;const el=$('#race-preview');if(el){const card=openCard(Date.now());el.innerHTML=racePreview(card,raceOdds(card),{...raceDraft,amount:drafts['race-amount']});}return;}
  if(e.target.id==='race-amount'){drafts['race-amount']=e.target.value;const preview=$('#race-preview');if(preview){const open=openCard(Date.now());preview.innerHTML=racePreview(open,raceOdds(open),{...raceDraft,amount:e.target.value});}}
  if(e.target.id==='steam-game-search'){if(steamView){steamView.search=e.target.value;render();}return;}
  if (e.target.id==='kp-connect-code'||['trade-qty','bet-amount','chinchiro-amount','bj-amount','mines-amount','slot-amount','vp-amount','baccarat-amount'].includes(e.target.id)||e.target.id.startsWith('claim-')||e.target.id.startsWith('directive-')) drafts[e.target.id] = e.target.value;
  if(e.target.id==='trade-qty')$('#trade-estimate').innerHTML=tradeEstimate();
});
const drafts = {};
let privateRacePreview=null,privateRoundMessage='';
// Live wallets: a cheap 15-second change pulse always updates KP when it changes.
// Only race/Mリーグ/market/stable require 60s full refresh; other screens force
// it every 120s, reducing heavy D1 reads while preserving reactive balances.
// Nothing is fetched while hidden.
// This small read is independent of wallet/animation polling and never replaces the game form.
let communityEntries=[],communityBusy=false,communityOwner=null,communityStatus='確認中…',lastCommunityPoll=0,communityConserveUntil=0;
// Keep five-second freshness checks, but download the 40-row feed only on change.
let communityRevision=null,communityFullAt=0;
function paintCommunity(){
 const list=$('.community-entries'),status=$('.community-status');
 if(!list)return;
 const html=communityRows(communityEntries);
 if(list.innerHTML!==html)list.innerHTML=html;
 if(status)status.textContent=communityStatus;
}
async function refreshCommunity(){
 // The title screen has no community panel; never poll the DB for an invisible feed.
 if(communityBusy||!live||!communityRefreshEnabled(screen,document.querySelector('details.community-feed')?.open,!document.hidden,wallet.connected))return;
 const owner=state.selfUserId;
 if(communityOwner!==owner){communityEntries=[];communityOwner=owner;communityRevision=null;communityFullAt=0;lastCommunityPoll=0;}
 if(Date.now()<communityConserveUntil||Date.now()-lastCommunityPoll<COMMUNITY_REFRESH_INTERVAL)return;
 lastCommunityPoll=Date.now();communityBusy=true;
 try{
  // Force a full fetch each minute so renamed members and older servers
  // are handled even when no wallet operation has been appended.
  const since=communityRevision!==null&&Date.now()-communityFullAt<60000?communityRevision:undefined;
  const data=await wallet.feed(since);
  if(!live||state.selfUserId!==owner)return;
  if(!data.unchanged){
    communityEntries=data.entries;
    communityRevision=Number.isSafeInteger(data.revision)?data.revision:null;
    communityFullAt=Date.now();
  }
  if(data.conserve){
   // D1 soft budget mode explicitly only pauses optional community history.
   // Do not retry the endpoint every ten seconds until the quota resets.
   communityConserveUntil=Date.now()+60000;
   communityStatus='D1節約モード：取引履歴の自動取得を一時停止中。KPとランキングは通常どおり更新';
  }else{
   communityConserveUntil=0;
   communityStatus='更新 '+new Date().toLocaleTimeString('ja-JP');
  }
 }catch{communityStatus='更新が止まっています。自動で再接続します。';}
 finally{communityBusy=false;paintCommunity();}
}
// Poll only while the user is actually looking at the community feed.
// The closed disclosure on other screens causes ZERO feed requests.
setInterval(refreshCommunity,COMMUNITY_REFRESH_INTERVAL);
addEventListener('click',e=>{if(e.target.closest?.('.community-feed > summary'))setTimeout(refreshCommunity,0);});
// Long mode notes show two lines; a tap opens the rest (and keeps it open across refreshes until tapped again).
addEventListener('click',e=>{const note=e.target.closest?.('.market-disclaimer');if(!note)return;noteOpen=!noteOpen;note.classList.toggle('open',noteOpen);});
addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCommunity();});
let lastPulse=null,lastFull=0;
async function refreshLive(){
  if(document.hidden)return;
  let pulse=null;
  try{pulse=await wallet.pulse();}catch{/* an older server or a network blip: fall back to the full state */}
  if(pulse!==null&&pulse===lastPulse&&Date.now()-lastFull<fullRefreshInterval(screen)&&!connectionError)return;
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
async function refreshDuel(force=false){
 if(screen!=='duels'||!live||document.hidden||duelBusy||!wallet.connected)return;
 const now=Date.now();const active=duelData?.matches?.some(m=>m.status==='active'&&m.deadline_at>now);
 const pending=duelData?.matches?.some(m=>m.status==='pending'&&m.deadline_at>now);
 // Preserve 10-second updates during play but reduce idle reads: 20s for invites, 30s otherwise.
 const cadence=active?10000:pending?20000:30000;
 if(!force&&now-duelLastFetch<cadence)return;
 duelLastFetch=now;duelLoading=true;render();
 try{
  const fresh=await wallet.duels();
  if(screen!=='duels'||!live)return;
  observeDuelChanges(fresh);duelData=fresh;duelError='';
  if(!duelActiveId||!fresh.matches.some(r=>r.id===duelActiveId)){
   duelActiveId=fresh.matches.find(r=>r.status==='active'||r.status==='pending')?.id??fresh.matches[0]?.id??null;
  }
  render();
 }catch(error){duelError='対戦情報を取得できませんでした。通信状況を確認して「更新」を押してください。'+(error?.message?'（'+error.message+'）':'');render();}
 finally{duelLoading=false;render();}
}
setInterval(()=>{if(screen==='duels')refreshDuel();},10000);
// Countdown updates are purely in-browser and do not query D1.
setInterval(()=>{
 if(screen!=='duels'||document.hidden)return;
 for(const element of document.querySelectorAll('[data-duel-timer]')){
  const remaining=Math.max(0,Math.ceil((Number(element.dataset.duelTimer)-Date.now())/1000));
  element.textContent=remaining?`残り ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`:'時間切れ（精算確認中）';
 }
},1000);
// When an Activity resumes after being backgrounded, refresh once if its data is stale.
// The existing 10-second poll remains the maximum active cadence.
addEventListener('visibilitychange',()=>{if(!document.hidden&&screen==='duels'&&Date.now()-duelLastFetch>=6000)refreshDuel(true);});
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
