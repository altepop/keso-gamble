import {summarizeDuelRenderSamples} from './duel-latency-samples.js?v=p5a';
import {describeDuelIssue} from './duel-status-help.js?v=p3d';
import {DUEL_POKER_HAND_ORDER,DUEL_BLUFF_BID_RULES,summarizeVisibleOthelloCorners} from './duel-insights.js?v=p3c';
import {getDuelBeginnerRules} from './duel-beginner.js?v=p3a';
// Progressive visual enhancement only. Never sends actions, determines winners or reads KP.
// A factual score summary from the visible server-confirmed 8x8 board.
// A larger lead is NOT a prediction of the game winner.
export function summarizeOthelloPosition(state){
 if(!Array.isArray(state)||state.length!==64||state.some(c=>!['.','B','W'].includes(c)))return null;
 const black=state.filter(c=>c==='B').length,white=state.filter(c=>c==='W').length,empty=64-black-white;
 const lead=black===white?'石数は同数':black>white?'黒が'+(black-white)+'枚多い':'白が'+(white-black)+'枚多い';
 return {black,white,empty,lead};
}
export function classifyOthelloTransition(previous, next) {
  if (!Array.isArray(previous) || !Array.isArray(next) || previous.length !== 64 || next.length !== 64) return null;
  let placed = -1;
  const flipped = [];
  for (let i = 0; i < 64; i++) {
    const a = previous[i], b = next[i];
    if (!['.', 'B', 'W'].includes(a) || !['.', 'B', 'W'].includes(b)) return null;
    if (a === b) continue;
    if (a === '.' && b !== '.') {
      if (placed !== -1) return null; // Multiple moves received after an inactive tab.
      placed = i;
    } else if (a !== '.' && b !== '.' && a !== b) {
      flipped.push({index: i, from: a});
    } else return null; // A stone vanished: changed match or corrupted state.
  }
  return placed === -1 ? null : {placed, flipped};
}
function readBoard(board) {
  const squares = [...board.querySelectorAll('.duel-square')];
  if (squares.length !== 64) return null;
  return {squares, state: squares.map(square => square.classList.contains('black') ? 'B' : square.classList.contains('white') ? 'W' : '.')};
}
// Pure transition detector. Never animate reconnect snapshots containing
// multiple moves, illegal gravity, changed matches or a disappearing chip.
export function classifyConnect4Transition(previous,next){
 if(typeof previous!=='string'||typeof next!=='string'||previous.length!==42||next.length!==42
    ||!/^[.ab]{42}$/.test(previous)||!/^[.ab]{42}$/.test(next))return null;
 let added=-1;
 for(let i=0;i<42;i++){
  if(previous[i]===next[i])continue;
  if(previous[i]!=='.'||!['a','b'].includes(next[i])||added!==-1)return null;
  added=i;
 }
 if(added===-1)return null;
 const row=Math.floor(added/7),column=added%7;
 if(row<5&&previous[(row+1)*7+column]==='.')return null;
 return {index:added,row,column,side:next[added]};
}
// Round-reveal animation is strictly cosmetic and only runs when exactly one
// server-confirmed challenge follows a previously observed live bid.
export function classifyBluffReveal(before,after){
 if(!before||!after||!before.id||before.id!==after.id||
    !Number.isSafeInteger(before.version)||after.version!==before.version+1||
    !Number.isSafeInteger(before.history)||after.history!==before.history+1||
    !before.bid||typeof after.last!=='string')return null;
 const parts=after.last.split(':');
 if(parts.length!==4||parts.slice(1).join(':')!==before.bid)return null;
 if(!Number.isInteger(Number(parts[0]))||Number(parts[0])<1)return null;
 return {round:Number(parts[0]),version:after.version};
}
// The reveal may animate only after a newly observed confirmed second swap.
// Reconnection snapshots and resign/timeout never manufacture showdown cards.
export function classifyPokerReveal(before,after){
 if(!before||!after||!before.id||before.id!==after.id||
  !Number.isSafeInteger(before.version)||after.version!==before.version+1||
  before.revealed||!after.revealed||after.done!=='1:1')return null;
 if(before.done!=='1:0'&&before.done!=='0:1')return null;
 return {id:after.id,version:after.version};
}
// A new visible deduction may animate only after one confirmed server turn.
// Never replay older guesses on reconnect or expose private codes.
export function classifyHitBlowFeedback(before,after){
 if(!before||!after||!before.id||before.id!==after.id||
  !Number.isSafeInteger(before.version)||after.version!==before.version+1||
  !Number.isSafeInteger(before.count)||after.count!==before.count+1||
  typeof after.last!=='string')return null;
 const parts=after.last.split(':');
 if(parts.length!==4||!['a','b'].includes(parts[0])||
  !/^[0-9]{4}$/.test(parts[1])||new Set(parts[1]).size!==4)return null;
 const hit=Number(parts[2]),blow=Number(parts[3]);
 if(!Number.isInteger(hit)||!Number.isInteger(blow)||hit<0||blow<0||hit+blow>4)return null;
 return {id:after.id,version:after.version,hit,blow,key:after.last};
}
// Only one newly observed server-confirmed stone is a new last move.
// Full reconnect snapshots and corrupted board changes must never fabricate one.
export function classifyGomokuTransition(previous,next){
 if(typeof previous!=='string'||typeof next!=='string'||previous.length!==225||next.length!==225||
  !/^[.BW]{225}$/.test(previous)||!/^[.BW]{225}$/.test(next))return null;
 let index=-1;
 for(let i=0;i<225;i++){
  if(previous[i]===next[i])continue;
  if(index!==-1||previous[i]!=='.'||!['B','W'].includes(next[i]))return null;
  index=i;
 }
 return index<0?null:{index,color:next[index],row:Math.floor(index/15)+1,column:index%15+1};
}

// A shared, read-only journey guide. The only inputs are already-visible,
// server-backed screen states; no guessing turn ownership or optimistic results.
export function describeDuelJourney({stage='setup',outgoing=false,myTurn=false,retry=false,refreshing=false,canRematch=false}={}){
 const phases=['招待','対戦','結果・再戦'];
 const step=stage==='setup'||stage==='pending'?0:stage==='active'?1:2;
 let title='相手を選んで申し込む',detail='ゲーム・相手・賭けKPを確認して招待する。';
 if(stage==='pending'){
   title=outgoing?'相手の承諾待ち':'対戦の招待が届いた';
   detail=outgoing?'承諾されると対戦が始まる。':'相手と賭けKPを確認して承諾する。';
 }else if(stage==='active'){
   title=myTurn?'あなたの番':'相手の番';
   detail=myTurn?'盤面の操作で着手する。確定までは結果に反映されない。':'相手の確定した着手が届くのを待つ。';
 }else if(stage==='finished'){
   title='対戦終了・結果確定';
   detail=canRematch?'結果を確認し、同じ相手・金額で再戦を準備できる。':'結果を確認し、必要なら別の対戦を申し込める。';
 }
 if(retry){title='前回の操作結果が未確認';detail='同じ操作IDで結果を確認する。新しい操作を送らない。';}
 else if(refreshing){detail='最新情報を更新中。盤面と結果はサーバー確定表示を優先する。';}
 return {step,phases,title,detail,stage};
}

// Presentation-only invite readiness derived from visible UI values. Never
// creates invitations, changes stake, reads auth secrets or calls an API.
export function describeInviteReadiness({hasMembers=true,hasOpponent=false,canAfford=null,busy=false,retry=false,highStake=false}={}){
 if(retry)return {type:'hold',title:'前回の操作結果を先に確認',detail:'未確認の操作がある間は新しい招待を送らない。'};
 if(!hasMembers)return {type:'waiting',title:'対戦相手の確認待ち',detail:'候補が表示されない場合は対戦情報を更新する。'};
 if(!hasOpponent)return {type:'choose',title:'まず相手を選択',detail:'対戦相手の欄をタップして、遊ぶ相手を選ぶ。'};
 if(canAfford===false)return {type:'low',title:'この賭け金ではKPが不足',detail:'賭け金を下げるか、KPを貯めてから申し込む。'};
 if(busy)return {type:'hold',title:'操作の完了を確認中',detail:'同じ操作を続けて送らず、画面の更新を確認する。'};
 if(canAfford===true)return {type:'ready',title:highStake?'高額のため再確認が必要':'招待の準備ができた',detail:highStake?'対戦相手と賭けKPを確認してから送る。':'申し込み時にはKPは減らず、相手が承認すると対戦が始まる。'};
 return {type:'waiting',title:'選択内容を確認',detail:'対戦相手と賭けKPを確認してから申し込む。'};
}

/* A read-only connectivity explanation. Navigator.online says only whether
   the browser reports a network interface, never that Discord/Worker responds. */
export function describeDuelConnection({online=true,retry=false,refreshing=false,recovered=false}={}){
 if(retry)return {type:'retry',heading:'対戦操作の結果が未確認',description:'新しい着手を送らず、「前回の操作を確認」から同じ操作IDの結果を確認する。'};
 if(!online)return {type:'offline',heading:'ブラウザがオフライン',description:'確定前の着手を繰り返し送らない。接続が戻ってから対戦情報を更新して確認する。'};
 if(recovered)return {type:'recovered',heading:'ブラウザの接続が戻った',description:'サーバーの同期はまだ確認していない。「更新」で確定した盤面を確認する。'};
 if(refreshing)return {type:'refreshing',heading:'対戦情報を更新中',description:'着手・結果はサーバーが確定した情報だけを表示する。'};
 return null;
}

/* A rematch is only a form prefill, never a second game or KP transaction. */
export function describeRematchGuide({finished=false,available=false,prepared=false}={}){
 if(!finished||!available)return null;
 return prepared
  ?{step:1,title:'再戦の内容を確認中',description:'ゲーム・相手・賭けKPをフォームで確認し、申込ボタンを押すと新しい招待を送る。自動では開始しない。'}
  :{step:0,title:'同じ条件で、もう一戦',description:'再戦の準備ボタンでゲーム・相手・賭けKPを入力できる。押しただけでは招待もKPの操作も発生しない。'};
}

/* Six-game next-action guidance derived only from already-rendered controls.
   Never computes outcomes, inspects opponent secrets, or submits a move. */
export function describeDuelActionHint({game='',canAct=false,available=0,selected=false,count=0,guessValid=false,canChallenge=false}={}){
 if(!canAct)return null;
 switch(game){
  case 'othello':return {title:'オセロ：置く場所を選ぶ',detail:available>0?'光る'+available+'か所から置きたいマスをタップする。':'着手可能なマスは現在表示されていない。'};
  case 'gomoku':return {title:'五目並べ：選択して確定',detail:selected?'選んだマスを「ここに置く」で確定する。取り消しも可能だ。':'マスをタップして位置を選び、次に「ここに置く」で確定する。'};
  case 'connect4':return {title:'四目並べ：列を選ぶ',detail:'上の▼から置きたい列をタップする。現在選択できる列は'+available+'列。'};
  case 'hitblow':return {title:'Hit & Blow：4桁を予想',detail:guessValid?'異なる数字4桁が揃った。「予想を確定」で送信する。':'重複しない数字4桁を入力する。先頭に0も使える。'};
  case 'bluffdice':return {title:'ブラフダイス：次の宣言',detail:canChallenge?'個数と出目を上げて宣言するか、相手の宣言を疑う。':'個数・出目を選んで宣言する。'};
  case 'poker':return {title:'ポーカー：交換を選ぶ',detail:'交換予定'+count+'枚。0〜3枚の交換対象を選び、確定ボタンで送信する。'};
  default:return null;
 }
}

// Only classify labels already displayed by the official duel room. Not a
// replacement for server status or an attempt to count unloaded history.
export function classifyVisibleDuelHistoryLabel(label){
 const after=String(label??'').split('·').at(-1)?.trim()??'';
 if(after==='終了')return 'finished';
 if(after==='対局中'||after==='招待中')return 'ongoing';
 return 'other';
}
export function summarizeLoadedDuelHistory(labels=[]){
 if(!Array.isArray(labels))return null;
 const counts={all:labels.length,ongoing:0,finished:0};
 for(const label of labels){
  const state=classifyVisibleDuelHistoryLabel(label);
  if(state==='ongoing'||state==='finished')counts[state]++;
 }
 return counts;
}
function enhance(root) {
  let previous = null, motion = null, lastBoard = null, lastOthello = null;
  let c4Previous=null,c4Motion=null,lastC4Board=null;
  let bluffPrevious=null,bluffMotion=null,lastBluffTable=null;
  let pokerPrevious=null,pokerMotion=null,lastPokerTable=null;
  let hbPrevious=null,hbMotion=null,lastHbTable=null;
  let gomokuPrevious=null,gomokuLast=null,gomokuBoard=null;
  const gomokuZoom=new Map();
  const zoomLevels=[44,52,60,72];
  // Record only a local gesture followed by a same-match confirmed single move.
  // Read-only, memory-only. These values cannot establish opponent-side latency.
  function recordConfirmedLocalMove(game,id,now){
    const tap=root.__duelPendingTap;
    if(!tap||tap.game!==game||tap.id!==id)return;
    delete root.__duelPendingTap;
    const ms=Math.round(now-tap.at);
    if(document.hidden||ms<0||ms>20000)return;
    const samples=Array.isArray(root.__duelRenderSamples)?root.__duelRenderSamples:[];
    samples.push({game,ms,confirmed:true,method:'local-gesture-to-confirmed-render'});
    if(samples.length>100)samples.splice(0,samples.length-100);
    root.__duelRenderSamples=samples;
    root.__duelRenderSummary=summarizeDuelRenderSamples(samples);
  }
  function scanHitBlow(){
   const table=root.querySelector('.duel-hb-table[data-hb-match]');
   if(!table){hbPrevious=null;hbMotion=null;lastHbTable=null;return;}
   if(table===lastHbTable)return;
   lastHbTable=table;
   // Phase 7: fold nonessential guidance while preserving actual game controls.
   const supplementary=table.querySelector('.duel-hb-intro');
   if(supplementary && !supplementary.closest('[data-duel-mobile-detail="hitblow"]')){
     const details=document.createElement('details');
     details.dataset.duelMobileDetail='hitblow';
     details.className='duel-mobile-detail';
     const heading=document.createElement('summary');
     heading.textContent='推理の説明';
     supplementary.before(details);
     details.append(heading,supplementary);
   }

   const now=performance.now();
   const current={id:table.dataset.hbMatch,version:Number(table.dataset.hbVersion),
      count:Number(table.dataset.hbHistoryCount),last:table.dataset.hbLast};
   const change=hbPrevious&&now-hbPrevious.at<20000&&!document.hidden
      ?classifyHitBlowFeedback(hbPrevious,current):null;
   hbPrevious={...current,at:now};
   if(change)hbMotion={...change,started:now};
   const elapsed=hbMotion?now-hbMotion.started:Infinity;
   const row=table.querySelector('.duel-hb-row');
   if(!row||!hbMotion||hbMotion.id!==current.id||hbMotion.version!==current.version||
      hbMotion.key!==current.last||elapsed>=1200||document.hidden||
      matchMedia('(prefers-reduced-motion: reduce)').matches){
     if(elapsed>=1200)hbMotion=null;
     return;
   }
   row.style.setProperty('--hb-feedback-delay',(-elapsed)+'ms');
   row.classList.add('duel-hb-feedback-new');
   const win=table.querySelector('.duel-hb-code-reveal');
   if(win&&hbMotion.hit===4){
      win.style.setProperty('--hb-feedback-delay',(-elapsed)+'ms');
      win.classList.add('duel-hb-victory-new');
   }
  }
  function scanPoker(){
   const table=root.querySelector('.duel-poker-table[data-poker-match]');
   if(!table){pokerPrevious=null;pokerMotion=null;lastPokerTable=null;return;}
   if(table===lastPokerTable)return;
   lastPokerTable=table;
   // Phase 7: fold nonessential guidance while preserving actual game controls.
   const supplementary=table.querySelector('.duel-poker-guide');
   if(supplementary && !supplementary.closest('[data-duel-mobile-detail="poker"]')){
     const details=document.createElement('details');
     details.dataset.duelMobileDetail='poker';
     details.className='duel-mobile-detail';
     const heading=document.createElement('summary');
     heading.textContent='役と交換の補足';
     supplementary.before(details);
     details.append(heading,supplementary);
   }

   const now=performance.now();
   const current={id:table.dataset.pokerMatch,version:Number(table.dataset.pokerVersion),
     revealed:table.dataset.pokerRevealed==='true',done:table.dataset.pokerDone};
   const change=pokerPrevious&&now-pokerPrevious.at<20000&&!document.hidden
     ?classifyPokerReveal(pokerPrevious,current):null;
   pokerPrevious={...current,at:now};
   if(change)pokerMotion={...change,started:now};
   const elapsed=pokerMotion?now-pokerMotion.started:Infinity;
   const scene=table.querySelector('.duel-poker-showdown');
   if(!scene||!pokerMotion||pokerMotion.id!==current.id||pokerMotion.version!==current.version||
      elapsed>=1500||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches){
     if(elapsed>=1500)pokerMotion=null;
     return;
   }
   scene.style.setProperty('--poker-reveal-delay',(-elapsed)+'ms');
   scene.querySelectorAll('.duel-poker-reveal-card').forEach((card,i)=>{
     card.style.setProperty('--poker-stagger',(i%5*65+(i>=5?135:0))+'ms');
   });
   scene.classList.add('duel-poker-arrival');
  }
  function scanBluffDice(){
   const table=root.querySelector('.duel-bluff-table[data-bluff-match]');
   if(!table){bluffPrevious=null;bluffMotion=null;lastBluffTable=null;return;}
   if(table===lastBluffTable)return;
   lastBluffTable=table;
   // Phase 7: fold nonessential guidance while preserving actual game controls.
   const supplementary=table.querySelector('.duel-bluff-odds');
   if(supplementary && !supplementary.closest('[data-duel-mobile-detail="bluffdice"]')){
     const details=document.createElement('details');
     details.dataset.duelMobileDetail='bluffdice';
     details.className='duel-mobile-detail';
     const heading=document.createElement('summary');
     heading.textContent='確率・判断の補足';
     supplementary.before(details);
     details.append(heading,supplementary);
   }

   const now=performance.now();
   const current={
    id:table.dataset.bluffMatch,
    version:Number(table.dataset.bluffVersion),
    history:Number(table.dataset.bluffHistoryCount),
    bid:table.dataset.bluffBid,
    last:table.dataset.bluffLast
   };
   const change=bluffPrevious&&now-bluffPrevious.at<20000&&!document.hidden
      ?classifyBluffReveal(bluffPrevious,current):null;
   bluffPrevious={...current,at:now};
   if(change)bluffMotion={...change,id:current.id,last:current.last,started:now};
   const elapsed=bluffMotion?now-bluffMotion.started:Infinity;
   const scene=table.querySelector('.duel-bluff-showdown');
   if(!scene||!bluffMotion||bluffMotion.id!==current.id||
      bluffMotion.version!==current.version||bluffMotion.last!==current.last||
      elapsed>=1400||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches){
     if(elapsed>=1400)bluffMotion=null;
     return;
   }
   scene.style.setProperty('--duel-bluff-delay',(-elapsed)+'ms');
   scene.querySelectorAll('.duel-bluff-reveal-dice .duel-bluff-die').forEach((die,i)=>{
     die.style.setProperty('--duel-bluff-die-stagger',(i%5*65+(i>=5?135:0))+'ms');
   });
   scene.classList.add('duel-bluff-reveal-animated');
  }
  function scanConnect4(){
    const board=root.querySelector('.duel-connect4-board[data-c4-match]');
    if(!board){c4Previous=null;c4Motion=null;lastC4Board=null;return;}
    if(board===lastC4Board)return;
    lastC4Board=board;
    const cells=[...board.querySelectorAll('.duel-connect4-space')];
    if(cells.length!==42){c4Previous=null;c4Motion=null;return;}
    const id=board.dataset.c4Match;
    const version=Number(board.dataset.c4Version);
    const state=cells.map(cell=>cell.classList.contains('a')?'a':cell.classList.contains('b')?'b':'.').join('');
    const now=performance.now();
    const change=c4Previous&&c4Previous.id===id&&version===c4Previous.version+1
      &&now-c4Previous.at<20000&&!document.hidden
      ?classifyConnect4Transition(c4Previous.state,state):null;
    c4Previous={id,version,state,at:now};
    if(change){c4Motion={...change,id,version,state,started:now};recordConfirmedLocalMove('connect4',id,now);}
    // The same confirmed move may be rerendered after a KP refresh. Resume
    // its progress; do not animate untouched chips or overwrite server state.
    const move=c4Motion,elapsed=move?now-move.started:Infinity;
    if(!move||move.id!==id||move.version!==version||move.state!==state||elapsed>1100
       ||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches){
      if(move&&elapsed>1100)c4Motion=null;
      return;
    }
    const cell=cells[move.index];
    const from=board.getBoundingClientRect(),to=cell.getBoundingClientRect();
    const fallDistance=Math.max(to.height, to.top-from.top+to.height+14);
    const duration=460+move.row*62;
    cell.style.setProperty('--c4-drop-distance',fallDistance.toFixed(1)+'px');
    cell.style.setProperty('--c4-drop-duration',duration+'ms');
    cell.style.setProperty('--c4-drop-delay',(-Math.min(elapsed,duration))+'ms');
    cell.classList.add('duel-c4-new-chip');
  }

  function scanGomoku(){
    const board=root.querySelector('.duel-board.duel-gomoku[data-gomoku-match]');
    if(!board){gomokuPrevious=null;gomokuLast=null;gomokuBoard=null;return;}
    const scroll=board.closest('[data-duel-board-scroll]');
    if(!scroll)return;
    const id=board.dataset.gomokuMatch;
    const version=Number(board.dataset.gomokuVersion);
    const index=gomokuZoom.get(id)??0;
    const width=zoomLevels[index]*15;
    // The Activity reconstructs the DOM on every accepted snapshot; preserve
    // the visible board centre when reapplying a previously chosen zoom.
    if(board.style.width!==width+'px'){
      const replaced=board!==gomokuBoard;
      const left=scroll.scrollLeft,top=scroll.scrollTop;
      const beforeWidth=board.getBoundingClientRect().width||660;
      const centreX=(left+scroll.clientWidth/2)/beforeWidth;
      const centreY=(top+scroll.clientHeight/2)/beforeWidth;
      board.style.setProperty('width',width+'px','important');
      board.style.setProperty('min-width',width+'px','important');
      board.style.setProperty('max-width','none','important');
      // The app already restores old pixel offsets after rerender. Keep those
      // exact offsets for a replaced node, or each automatic refresh drifts.
      // Only a direct local zoom click should scale around the visual centre.
      scroll.scrollLeft=replaced?left:centreX*width-scroll.clientWidth/2;
      scroll.scrollTop=replaced?top:centreY*width-scroll.clientHeight/2;
    }
    const arena=board.closest('.duel-arena');
    const output=arena?.querySelector('[data-gomoku-zoom-label]');
    if(output){const label=Math.round(zoomLevels[index]/44*100)+'%';if(output.textContent!==label)output.textContent=label;}
    const plus=arena?.querySelector('[data-gomoku-zoom-action="in"]');
    const minus=arena?.querySelector('[data-gomoku-zoom-action="out"]');
    if(plus)plus.disabled=index===zoomLevels.length-1;
    if(minus)minus.disabled=index===0;
    if(board!==gomokuBoard){
      gomokuBoard=board;
      const cells=[...board.querySelectorAll('.duel-square')];
      if(cells.length!==225){gomokuPrevious=null;gomokuLast=null;return;}
      const state=cells.map(cell=>cell.classList.contains('black')?'B':cell.classList.contains('white')?'W':'.').join('');
      const now=performance.now();
      const before=gomokuPrevious;
      const change=before&&before.id===id&&version===before.version+1&&
        now-before.at<20000&&!document.hidden
        ?classifyGomokuTransition(before.state,state):null;
      // After any version change without exactly one observed legal new cell,
      // forget the earlier last-move marker rather than label an old move new.
      if(before&&(before.id!==id||before.version!==version)&&!change)gomokuLast=null;
      gomokuPrevious={id,version,state,at:now};
      if(change){gomokuLast={...change,id,version,state,started:now};recordConfirmedLocalMove('gomoku',id,now);}
    }
    const last=gomokuLast;
    const status=arena?.querySelector('[data-gomoku-last-status]');
    if(!last||last.id!==id||last.version!==version||last.state!==gomokuPrevious?.state){
      if(status){const message='新しい確定手を観測したら、その場所を強調する。';if(status.textContent!==message)status.textContent=message;}
      return;
    }
    const newest=board.querySelector('.duel-square[data-duel-cell="'+last.index+'"]');
    if(!newest)return;
    newest.classList.add('duel-gomoku-last-confirmed');
    if(status){const message='直前の確定手：'+last.row+'行 '+last.column+'列（'+(last.color==='B'?'黒':'白')+'）';if(status.textContent!==message)status.textContent=message;}
    const elapsed=performance.now()-last.started;
    if(elapsed<850&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      newest.style.setProperty('--gomoku-move-delay',(-elapsed)+'ms');
      newest.classList.add('duel-gomoku-confirmed-motion');
    }
  }


  function scanInviteReadiness(){
    const form=root.querySelector('.duel-new');
    const button=form?.querySelector('[data-duel-act="create"]');
    if(!form||!button)return;
    const picked=form.querySelector('[data-duel-target-toggle] > span')?.textContent?.trim()||'';
    const hasOpponent=!!picked&&picked!=='相手を選択'&&!picked.includes('読み込み中');
    const hasMembers=!form.querySelector('.duel-opponent-help[role="status"]');
    const stake=Number(form.querySelector('#duel-stake')?.value);
    const displayed=root.querySelector('.topbar .badge')?.textContent||'';
    const match=/^\s*([\d,]+)\s*KP/.exec(displayed);
    const cash=match?Number(match[1].replaceAll(',','')):NaN;
    const canAfford=Number.isSafeInteger(cash)&&Number.isSafeInteger(stake)&&stake>0?cash>=stake:null;
    const retry=!!root.querySelector('[data-duel-retry]');
    const busy=button.disabled&&hasOpponent&&canAfford===true;
    const highStake=stake>=50000;
    const state=describeInviteReadiness({hasMembers,hasOpponent,canAfford,busy,retry,highStake});
    const signature=JSON.stringify(state);
    let notice=form.querySelector('[data-duel-invite-guide]');
    if(!notice){
      notice=document.createElement('div');
      notice.className='duel-invite-guide';
      notice.dataset.duelInviteGuide='1';
      notice.setAttribute('role','status');
      notice.setAttribute('aria-live','polite');
      button.before(notice);
    }
    if(notice.dataset.duelInviteSignature===signature)return;
    notice.dataset.duelInviteSignature=signature;
    notice.dataset.duelInviteType=state.type;
    notice.innerHTML='<strong>'+state.title+'</strong><span>'+state.detail+'</span>';
  }
  // This enhancement never sends moves, changes selection, or modifies wallet state.

  let preparedRematchId=null;
  function scanRematchGuide(){
    const current=root.querySelector('.duel-current');
    const control=current?.querySelector('[data-duel-rematch]');
    const finished=!!current?.querySelector('.duel-result');
    if(!control||!finished){preparedRematchId=null;return;}
    const matchId=control.dataset.duelRematch;
    const state=describeRematchGuide({finished,available:true,prepared:preparedRematchId===matchId});
    if(!state)return;
    const parent=control.closest('.duel-rematch .card-body');
    if(!parent)return;
    let guide=parent.querySelector('[data-duel-rematch-guide]');
    if(!guide){
      guide=document.createElement('section');
      guide.dataset.duelRematchGuide='1';guide.className='duel-rematch-guide';
      guide.setAttribute('role','status');guide.setAttribute('aria-live','polite');
      control.before(guide);
    }
    if(guide.dataset.duelRematchStep===String(state.step))return;
    guide.dataset.duelRematchStep=String(state.step);
    const labels=['結果確認','申込内容確認','新しい招待'];
    guide.innerHTML='<details class="duel-rematch-steps"><summary>再戦までの3ステップ</summary><ol class="duel-rematch-progress" aria-label="再戦までの流れ">'+labels.map((label,i)=>
      '<li'+(i===state.step?' aria-current="step"':'')+' class="'+(i===state.step?'current':'')+'">'+label+'</li>').join('')+
      '</ol></details><strong>'+state.title+'</strong><p>'+state.description+'</p>';
  }
  function scanDuelJourney(){
    const current=root.querySelector('.duel-current');
    const intro=root.querySelector('.duel-intro');
    const form=root.querySelector('.duel-new');
    const anchor=current||intro||form;
    if(!anchor)return;
    const arena=current?.querySelector('.duel-arena');
    const finished=!!arena?.querySelector('.duel-result')||arena?.querySelector('.duel-state')?.textContent?.trim()==='終了';
    const stage=arena?(finished?'finished':'active'):current?'pending':'setup';
    const outgoing=!![...(current?.querySelectorAll('h2.panel-title')??[])].some(heading=>heading.textContent?.includes('相手の返答待ち'));
    const turnText=arena?.querySelector('.duel-turn')?.textContent||'';
    const myTurn=turnText.includes('あなたの番');
    const retry=!!root.querySelector('[data-duel-retry]');
    const refreshing=!!root.querySelector('.duel-sync')?.textContent?.includes('更新中');
    const canRematch=!!current?.querySelector('[data-duel-rematch]');
    const state=describeDuelJourney({stage,outgoing,myTurn,retry,refreshing,canRematch});
    const signature=JSON.stringify(state);
    const screen=anchor.closest('.screen');
    if(!screen)return;
    let rail=screen.querySelector(':scope > [data-duel-journey]');
    if(!rail){
      rail=document.createElement('section');
      rail.className='duel-journey';
      rail.dataset.duelJourney='1';
      rail.setAttribute('aria-label','決闘の進行');
      anchor.before(rail);
    }
    if(rail.dataset.duelJourneySignature===signature)return;
    rail.dataset.duelJourneyStage=stage;
    rail.dataset.duelJourneySignature=signature;
    // Fixed Japanese copy only; no names, private cards, guessed moves or user HTML.
    rail.innerHTML='<ol class="duel-journey-steps" aria-label="進行段階">'+state.phases.map((name,index)=>
      '<li class="duel-journey-step '+(index===state.step?'is-current':index<state.step?'is-done':'is-next')+'"'+
      (index===state.step?' aria-current="step"':'')+'><span aria-hidden="true">'+(index+1)+'</span>'+name+'</li>').join('')+
      '</ol><p class="duel-journey-title" role="status" aria-live="polite">'+state.title+
      '</p><p class="duel-journey-help">'+state.detail+'</p>';
  }

  let connectionRecovered=false, browserOnline=navigator.onLine!==false;
  function scanDuelConnection(){
    const screen=root.querySelector('.screen');
    const rail=screen?.querySelector(':scope > [data-duel-journey]');
    if(!screen||!rail)return;
    const sync=root.querySelector('.duel-sync')?.textContent||'';
    const refreshing=sync.includes('更新中');
    const retry=!!root.querySelector('[data-duel-retry]');
    const info=describeDuelConnection({online:browserOnline,retry,refreshing,recovered:connectionRecovered});
    let bar=screen.querySelector(':scope > [data-duel-connection]');
    if(!info){bar?.remove();return;}
    if(!bar){
      bar=document.createElement('section');
      bar.dataset.duelConnection='1';bar.className='duel-connection';
      bar.setAttribute('role','status');bar.setAttribute('aria-live','polite');
      rail.after(bar);
    }
    const key=JSON.stringify(info);
    if(bar.dataset.duelConnectionKey===key)return;
    bar.dataset.duelConnectionKey=key;
    bar.dataset.duelConnectionType=info.type;
    bar.innerHTML='<strong>'+info.heading+'</strong><span>'+info.description+'</span>';
  }

  function scanGameHint(){
    const arena=root.querySelector('.duel-current .duel-arena');
    if(!arena)return;
    let note=arena.querySelector('[data-duel-action-hint]');
    const turn=arena.querySelector('.duel-turn.my-turn');
    if(!turn){note?.remove();return;}
    const game=arena.querySelector('.duel-board.duel-othello')?'othello':
     arena.querySelector('.duel-board.duel-gomoku')?'gomoku':
     arena.querySelector('.duel-connect4-board')?'connect4':
     arena.querySelector('.duel-hb-table')?'hitblow':
     arena.querySelector('.duel-bluff-table')?'bluffdice':
     arena.querySelector('.duel-poker-table')?'poker':'';
    const available=game==='othello'?arena.querySelectorAll('.duel-othello .duel-square.available').length:
     game==='connect4'?arena.querySelectorAll('.duel-connect4-head button:not(:disabled)').length:0;
    const guess=String(arena.querySelector('#duel-guess')?.value??'');
    const guessValid=/^[0-9]{4}$/.test(guess)&&new Set(guess).size===4;
    const selected=!!arena.querySelector('.duel-gomoku-selection [data-duel-confirm-cell]');
    const count=game==='poker'?arena.querySelectorAll('.duel-poker-hand-card.selected').length:0;
    const canChallenge=!!arena.querySelector('[data-duel-mini="challenge"]');
    const state=describeDuelActionHint({game,canAct:true,available,selected,count,guessValid,canChallenge});
    if(!state){note?.remove();return;}
    if(!note){
      note=document.createElement('p');note.className='duel-action-hint';
      note.dataset.duelActionHint='1';note.setAttribute('role','status');
      note.setAttribute('aria-live','polite');turn.after(note);
    }
    const key=state.title+'|'+state.detail;
    if(note.dataset.duelActionKey===key)return;
    note.dataset.duelActionKey=key;
    note.textContent=state.title+'　'+state.detail;
  }

  function scanBeginnerRules(){
    // Static explanation only, keyed to the chosen game and the published
    // game name. No hidden hand, authenticated response or new game action.
    const areas=[
      {container:root.querySelector('.duel-new .card-body'),anchor:root.querySelector('.duel-new .duel-mode-guide'),game:root.querySelector('#duel-game')?.value},
      {container:root.querySelector('.duel-current .duel-arena'),anchor:root.querySelector('.duel-current .duel-arena-head'),game:null}
    ];
    const names={オセロ:'othello',五目並べ:'gomoku',四目並べ:'connect4','Hit & Blow':'hitblow',ブラフダイス:'bluffdice','5カード・ドローポーカー':'poker','5カードポーカー':'poker'};
    for(const area of areas){
      if(!area.container||!area.anchor)continue;
      const game=area.game??names[area.container.querySelector('.duel-tag')?.textContent?.trim()];
      const rules=getDuelBeginnerRules(game);
      const existing=area.container.querySelector(':scope > [data-duel-beginner]');
      if(!rules){existing?.remove();continue;}
      if(existing?.dataset.duelBeginner===game)continue;
      existing?.remove();
      const details=document.createElement('details');
      details.className='duel-beginner';details.dataset.duelBeginner=game;
      const heading=document.createElement('summary');
      heading.textContent='はじめての'+rules.name+'｜勝ち方・初手・注意点';
      details.append(heading);
      const list=document.createElement('dl');
      for(const [term,explain] of [['勝利条件',rules.win],['最初にすること',rules.first],['覚えておくこと',rules.caution]]){
        const dt=document.createElement('dt');dt.textContent=term;
        const dd=document.createElement('dd');dd.textContent=explain;
        list.append(dt,dd);
      }
      details.append(list);area.anchor.after(details);
    }
  }

  let historyFilter='all';
  function scanHistoryReview(){
    const history=root.querySelector('.duel-history .card-body');
    if(!history)return;
    const matches=[...history.querySelectorAll('.duel-match[data-duel-select]')];
    const counts=summarizeLoadedDuelHistory(matches.map(el=>el.querySelector('small')?.textContent));
    let toolbar=history.querySelector('[data-duel-history-filter-bar]');
    if(!toolbar){
      toolbar=document.createElement('div');toolbar.className='duel-history-filter';
      toolbar.dataset.duelHistoryFilterBar='1';
      toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','読み込み済み対戦履歴の絞り込み');
      const labels=[['all','すべて'],['ongoing','進行中'],['finished','終了済み']];
      for(const [key,label] of labels){
        const button=document.createElement('button');button.type='button';
        button.dataset.duelHistoryFilter=key;button.textContent=label;
        toolbar.append(button);
      }
      const note=document.createElement('p');note.className='duel-history-filter-note';
      note.dataset.duelHistoryFilterNote='1';toolbar.append(note);
      const heading=history.querySelector('.duel-heading');
      if(heading)heading.after(toolbar);else history.prepend(toolbar);
    }
    for(const button of toolbar.querySelectorAll('[data-duel-history-filter]')){
      const mode=button.dataset.duelHistoryFilter;
      const label=mode==='all'?'すべて':mode==='ongoing'?'進行中':'終了済み';
      const next=label+' '+counts[mode]+'件';
      if(button.textContent!==next)button.textContent=next;
      button.setAttribute('aria-pressed',String(historyFilter===mode));
    }
    let visible=0;
    for(const match of matches){
      const type=classifyVisibleDuelHistoryLabel(match.querySelector('small')?.textContent);
      const show=historyFilter==='all'||type===historyFilter;
      match.hidden=!show;if(show)visible++;
    }
    const note=toolbar.querySelector('[data-duel-history-filter-note]');
    const next=visible?'読み込み済み'+counts.all+'件から表示中。過去の履歴すべてではない。':
       '該当する対戦は読み込み済みの履歴にない。絞り込みを変えると元に戻せる。';
    if(note.textContent!==next)note.textContent=next;
  }
  function scanFinishedReview(){
    const arena=root.querySelector('.duel-current .duel-arena');
    if(!arena)return;
    const result=arena.querySelector('.duel-result');
    const existing=arena.querySelector('[data-duel-finished-review]');
    if(!result){existing?.remove();return;}
    if(existing?.dataset.duelReviewResult===result.textContent.trim())return;
    existing?.remove();
    const details=document.createElement('details');
    details.className='duel-finished-review';
    details.dataset.duelFinishedReview='1';
    details.dataset.duelReviewResult=result.textContent.trim();
    const head=document.createElement('summary');
    head.textContent='この対戦を振り返る｜確定結果と公開済み記録';
    details.append(head);
    const body=document.createElement('dl');
    const fields=[['確定結果',result.textContent.trim()]];
    const counts=arena.querySelector('.duel-counts')?.textContent.trim();
    if(counts)fields.push(['盤面に表示された石数',counts]);
    const publicRecord=arena.querySelector('[data-poker-reveal="true"]')?'両者の公開済み手札と役の比較が盤面に表示されている。':
      arena.querySelector('.duel-bluff-history')?'公開されたラウンド結果を「過去の結果」から確認できる。':
      arena.querySelector('.duel-move-history')?'この端末で観測した着手だけを確認できる。':
      arena.querySelector('.duel-hb-history')?'公開済みの予想結果を履歴から確認できる。':
      'この画面に公開されている盤面・結果を確認できる。';
    fields.push(['公開済み記録',publicRecord]);
    // Educational next-match prompts only. Do not infer skill, hidden hands,
    // missed moves, performance or unobserved rounds from partial results.
    const nextFocus=arena.querySelector('.duel-board.duel-othello')
      ?'次の試合では、自分の手番ごとに置ける場所を確認し、着手前に盤面全体を見直しましょう。'
      :arena.querySelector('.duel-board.duel-gomoku')
      ?'次の試合では、選んだ位置を確認してから確定し、直前の確定手を振り返りましょう。'
      :arena.querySelector('.duel-connect4-board')
      ?'次の試合では、落とす列を決める前に、横・縦・斜めの並びを確認しましょう。'
      :arena.querySelector('.duel-hb-table')
      ?'次の試合では、公開済みのHitとBlowを見直してから、次の予想を確定しましょう。'
      :arena.querySelector('.duel-bluff-table')
      ?'次の試合では、公開されている宣言と履歴を確認し、判断の根拠を整理しましょう。'
      :arena.querySelector('.duel-poker-table')
      ?'次の試合では、役の強さを確認してから、自分の交換カードを選びましょう。'
      :'次の試合では、確定結果を見返してから、次に確認することを一つ決めましょう。';
    fields.push(['次の試合で確認すること',nextFocus]);
    for(const [label,value] of fields){
      const dt=document.createElement('dt');dt.textContent=label;
      const dd=document.createElement('dd');dd.textContent=value;
      body.append(dt,dd);
    }
    details.append(body);
    const caveat=document.createElement('p');caveat.textContent='表示済みの確定情報のみ。取得していない過去の手や非公開情報は補完しない。';
    details.append(caveat);
    // A manual, observer-safe sharing surface. Only the server-confirmed result
    // text already visible to this player is copied into the read-only field.
    // Never include hands, codes, loaded opponent state or guessed actions.
    const sharing=document.createElement('details');
    sharing.className='duel-public-result-share';
    sharing.dataset.duelPublicResultShare='1';
    const heading=document.createElement('summary');
    heading.textContent='確定した結果を共有する';
    const intro=document.createElement('p');
    intro.textContent='この画面に表示された確定結果だけを選択して共有できます。観戦中の未公開情報や相手の秘密情報は含めません。';
    const output=document.createElement('textarea');
    output.readOnly=true;
    output.rows=2;
    output.setAttribute('aria-label','共有用の確定結果');
    output.value=result.textContent.trim();
    sharing.append(heading,intro,output);
    result.after(details,sharing);
  }

  function scanGameInsights(){
    const arena=root.querySelector('.duel-current .duel-arena');
    if(!arena)return;
    const board=arena.querySelector('.duel-board.duel-othello');
    const poker=arena.querySelector('.duel-poker-table');
    const bluff=arena.querySelector('.duel-bluff-table');
    const anchor=board||poker||bluff;
    const old=arena.querySelector('[data-duel-insights]');
    if(!anchor){old?.remove();return;}
    const type=board?'othello':poker?'poker':'bluffdice';
    const corners=board?summarizeVisibleOthelloCorners(readBoard(board)?.state):null;
    const key=type+'|'+(corners?Object.values(corners).join(':'):'static');
    if(old?.dataset.duelInsightsKey===key)return;
    const stayOpen=!!old?.open;
    old?.remove();
    if(board&&!corners)return;
    const details=document.createElement('details');
    details.className='duel-insights';details.dataset.duelInsights=type;
    details.dataset.duelInsightsKey=key;
    details.open=stayOpen;
    const title=document.createElement('summary');
    title.textContent=type==='othello'?'オセロの局面を読む｜四隅の確定状態':
      type==='poker'?'ポーカーの役の強さ｜比較早見表':'ブラフダイスの宣言｜判断の仕組み';
    details.append(title);
    const lines=type==='othello'?[
      '四隅：黒'+corners.black+'か所／白'+corners.white+'か所／空き'+corners.open+'か所',
      '四隅の確定配置だけを表示している。石数や四隅の優劣から勝敗は予測できない。'
    ]:type==='poker'?[
      '強い順：'+DUEL_POKER_HAND_ORDER.join(' ＞ '),
      '同じ役は上位の数字などを順に比較する。相手のカードは公開決着まで分からない。'
    ]:DUEL_BLUFF_BID_RULES;
    const list=document.createElement('ul');
    for(const line of lines){
      const item=document.createElement('li');item.textContent=line;list.append(item);
    }
    details.append(list);anchor.after(details);
  }

  function scanStatusHelp(){
    const screen=root.querySelector('.screen');
    if(!screen)return;
    const sync=screen.querySelector('.duel-sync')?.textContent||'';
    const pendingRetry=!!screen.querySelector('[data-duel-retry]');
    const error=!!screen.querySelector('.duel-error[role="alert"]');
    const opponentNote=screen.querySelector('.duel-opponent-help[role="status"]')?.textContent||'';
    const loading=sync.includes('更新中')||(!sync.includes('最終更新')&&sync.includes('確認中'))||opponentNote.includes('確認しています');
    const noOpponent=!!opponentNote&&!loading;
    const info=describeDuelIssue({retry:pendingRetry,error,loading,hasSynced:sync.includes('最終更新'),noOpponent});
    let notice=screen.querySelector(':scope > [data-duel-status-help]');
    if(!info){notice?.remove();return;}
    const anchor=screen.querySelector(':scope > .duel-sync')||
      screen.querySelector(':scope > .duel-current')||
      screen.querySelector(':scope > .duel-intro')||
      screen.querySelector(':scope > .duel-new')||
      screen.querySelector(':scope > .topbar');
    if(!anchor)return;
    if(!notice){
      notice=document.createElement('section');
      notice.dataset.duelStatusHelp='1';notice.className='duel-status-help';
      notice.setAttribute('role','status');
      notice.setAttribute('aria-live','polite');
      anchor.after(notice);
    }
    const key=info.kind+'|'+info.title+'|'+info.message;
    if(notice.dataset.duelStatusHelpKey===key)return;
    notice.dataset.duelStatusHelpKey=key;
    notice.dataset.duelStatusHelpKind=info.kind;
    const title=document.createElement('strong');title.textContent=info.title;
    const detail=document.createElement('p');detail.textContent=info.message;
    notice.replaceChildren(title,detail);
  }
  function scanPveEntry(){
    // Discord iOS cannot reliably initialize the SDK twice after page navigation.
    // Keep the authenticated wallet and PvE API in the already-open Activity.
    if(root.id!=='app')return;
    const entry=root.querySelector('.duel-practice-entry');
    if(!entry||entry.querySelector('[data-duel-pve-link]'))return;
    const link=document.createElement('button');
    link.type='button';
    link.className='action-btn primary';
    link.dataset.duelPveLink='1';
    link.textContent='サーバーCPU攻略（PvE）を開く';
    link.setAttribute('aria-label','サーバーが勝敗を確定するPvE攻略画面を開く');
    // Native details fallback: even when app state rendering is delayed on iOS,
    // a tap must reveal the already authenticated in-page PvE controls.
    link.addEventListener('click',()=>{const panel=root.querySelector('#duel-pve-section');if(panel)panel.open=true;});
    const rewards=document.createElement('button');
    rewards.type='button';
    rewards.dataset.duelPveRewards='1';
    rewards.className='action-btn';
    rewards.textContent='決闘の戦績・報酬';
    entry.prepend(link,rewards);
  }
  function scan() {
    scanPveEntry();
    scanBeginnerRules();
    scanGameInsights();
    scanHistoryReview();
    scanFinishedReview();
    scanDuelJourney();
    scanRematchGuide();
    scanInviteReadiness();
    scanDuelConnection();
    scanStatusHelp();
    scanGameHint();
    scanConnect4();
    scanBluffDice();
    scanPoker();
    scanHitBlow();
    scanGomoku();
    const board = root.querySelector('.duel-board.duel-othello');
    if (!board) { previous = null; motion = null; lastBoard = null; lastOthello = null; return; }
    if (board === lastBoard) return; // Ignore mutations outside the board, such as the timer.
    lastBoard = board;
    const current = readBoard(board);
    if (!current) { previous = null; motion = null; return; }
    const players = root.querySelector('.duel-arena .duel-players')?.textContent || '';
    const identity = (root.querySelector('.duel-arena .duel-tag')?.textContent || '') + '|' + players;
    const now = performance.now(), signature = current.state.join('');
    const changes = previous && previous.identity === identity && now - previous.at < 20000 && !document.hidden
      ? classifyOthelloTransition(previous.state, current.state) : null;
    // A reconnect/multi-move replacement cannot fabricate a "last confirmed" move.
    if(previous&&(previous.identity!==identity||previous.state.join('')!==signature)&&!changes)lastOthello=null;
    previous = {state: current.state, identity, at: now};
    if (changes) {
      lastOthello={identity,signature,index:changes.placed,flips:changes.flipped.length};
      motion = {changes, identity, signature, started: now};
      // Local tap-to-confirmed-render metric is diagnostic only; not a network benchmark.
      if (root.__duelTapAt !== undefined && root.__duelTapIdentity === identity) {
        const duration = Math.round(now - root.__duelTapAt);
        delete root.__duelTapAt;
        // Local pointer-to-confirmed-board display only; never a server/SSE benchmark.
        if(duration >= 0 && duration <= 20000 && !document.hidden){
          root.__duelTapToConfirmedMs = duration;
          const samples = Array.isArray(root.__duelRenderSamples) ? root.__duelRenderSamples : [];
          samples.push({game:'othello',ms:duration,confirmed:true,method:'local-gesture-to-confirmed-render'});
          if(samples.length>100)samples.splice(0,samples.length-100);
          root.__duelRenderSamples = samples;
          root.__duelRenderSummary = summarizeDuelRenderSamples(samples);
        }
      }
    }
    // Scores and last-observed moves are presentation-only, never decisions.
    const position=summarizeOthelloPosition(current.state);
    const arena=board.closest('.duel-arena');
    const dashboard=arena?.querySelector('.duel-othello-dashboard');
    if(position&&dashboard){
      let note=arena.querySelector('[data-othello-position]');
      if(!note){
        note=document.createElement('p');note.dataset.othelloPosition='1';
        note.className='duel-othello-position';
        const details=document.createElement('details');
        details.className='duel-othello-position-details';
        const summary=document.createElement('summary');
        summary.textContent='石数・局面の補足';
        details.append(summary,note);
        dashboard.after(details);
      }
      const legal=[...board.querySelectorAll('.duel-square.available .duel-capture-count')]
        .map(el=>Number(el.textContent)).filter(n=>Number.isInteger(n)&&n>0);
      const max=legal.length?Math.max(...legal):0;
      const message=position.lead+'｜空き'+position.empty+'マス'+
        (max?'｜一度に最大'+max+'枚返せる場所あり（最善手とは限らない）':'');
      if(note.textContent!==message)note.textContent=message;
    }
    const last=lastOthello;
    let lastNote=arena?.querySelector('[data-othello-last-note]');
    if(last&&last.identity===identity&&last.signature===signature){
      const square=current.squares[last.index];
      square.classList.add('duel-othello-last-observed');
      square.setAttribute('aria-label',square.getAttribute('aria-label')+'、直前に確認した確定手');
      if(!lastNote){
        lastNote=document.createElement('p');lastNote.dataset.othelloLastNote='1';
        lastNote.className='duel-othello-last-note';lastNote.setAttribute('aria-live','polite');
        (arena?.querySelector('.duel-othello-position-details')||dashboard||board).after(lastNote);
      }
      const label='直前に確認した確定手：'+(Math.floor(last.index/8)+1)+'行'+(last.index%8+1)+'列（'+last.flips+'枚返した）';
      if(lastNote.textContent!==label)lastNote.textContent=label;
    }else lastNote?.remove();
    // The existing UI redraws twice around an API refresh. Resume the same
    // animation on the replacement DOM instead of cancelling it halfway.
    if (!motion || motion.identity !== identity || motion.signature !== signature
        || now - motion.started >= 550 || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      motion = null; return;
    }
    const {placed, flipped} = motion.changes;
    const elapsed = Math.max(0, Math.round(now - motion.started));
    const placement = current.squares[placed];
    placement.querySelector('.duel-piece')?.style.setProperty('animation-delay', -elapsed + 'ms');
    placement.classList.add('duel-new-stone');
    // The new board is already authoritative; animation cannot delay or undo a turn.
    for (const {index, from} of flipped) {
      const square = current.squares[index];
      const distance = Math.max(Math.abs(Math.floor(index / 8) - Math.floor(placed / 8)), Math.abs(index % 8 - placed % 8));
      square.style.setProperty('--duel-flip-delay', (Math.min(distance * 38, 152) - elapsed) + 'ms');
      square.dataset.duelFrom = from;
      square.classList.add('duel-flipped-stone');
    }
  }
  // Zoom is local presentation state only: never invokes a move, Worker or KP.
  root.addEventListener('click',event=>{
    const control=event.target.closest?.('[data-gomoku-zoom-action]');
    if(!control||!root.contains(control))return;
    const board=root.querySelector('.duel-board.duel-gomoku[data-gomoku-match]');
    const scroll=board?.closest('[data-duel-board-scroll]');
    if(!board||!scroll)return;
    const action=control.dataset.gomokuZoomAction;
    const id=board.dataset.gomokuMatch;
    if(action==='center'){
      scroll.scrollLeft=(scroll.scrollWidth-scroll.clientWidth)/2;
      scroll.scrollTop=(scroll.scrollHeight-scroll.clientHeight)/2;
      return;
    }
    const oldIndex=gomokuZoom.get(id)??0;
    const nextIndex=Math.min(zoomLevels.length-1,Math.max(0,oldIndex+(action==='in'?1:action==='out'?-1:0)));
    if(nextIndex===oldIndex)return;
    gomokuZoom.set(id,nextIndex);
    if(gomokuZoom.size>8)gomokuZoom.delete(gomokuZoom.keys().next().value);
    scanGomoku();
  });
  // Passive browser connectivity indicators: no implicit replay or server writes.
  addEventListener('offline',()=>{browserOnline=false;connectionRecovered=false;scanDuelConnection();});
  addEventListener('online',()=>{browserOnline=true;connectionRecovered=true;scanDuelConnection();});
  root.addEventListener('click',event=>{
    if(event.target.closest?.('[data-duel-refresh],[data-duel-retry]'))connectionRecovered=false;
  },{passive:true});
  // Informative click tracking only: the original app retains all game actions.
  root.addEventListener('click',event=>{
    const rematch=event.target.closest?.('[data-duel-rematch]');
    if(rematch)preparedRematchId=rematch.dataset.duelRematch;
    if(event.target.closest?.('[data-duel-act="create"],[data-duel-target-option]'))preparedRematchId=null;
  },{passive:true});
  root.addEventListener('change',event=>{
    if(['duel-game','duel-stake','duel-target'].includes(event.target?.id))preparedRematchId=null;
  },{passive:true});
  root.addEventListener('click',event=>{
    const clicked=event.target.closest?.('[data-duel-history-filter]');
    if(!clicked||!root.contains(clicked))return;
    historyFilter=clicked.dataset.duelHistoryFilter;
    scanHistoryReview();
  });
  // Batch unrelated DOM mutations into a single visual enhancement pass.
  // Direct game actions remain owned by the app; never delay or replay writes.
  // Browsers throttle rAF in hidden tabs, so perform bounded background scans.
  let enhancementScanQueued=false;
  const flushEnhancementScan=()=>{
    enhancementScanQueued=false;
    if(root.isConnected)scan();
  };
  const scheduleEnhancementScan=()=>{
    if(enhancementScanQueued)return;
    enhancementScanQueued=true;
    if(document.hidden)setTimeout(flushEnhancementScan,80);
    else requestAnimationFrame(flushEnhancementScan);
  };
  const observer = new MutationObserver(scheduleEnhancementScan);
  observer.observe(root, {childList: true, subtree: true});
  addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleEnhancementScan();});
  root.addEventListener('input',event=>{
    if(event.target?.id==='duel-guess')scanGameHint();
    if(event.target?.id!=='duel-guess')return;
    const value=String(event.target.value??'');
    const help=root.querySelector('#duel-hb-draft-help');
    if(!help)return;
    const valid=/^[0-9]{4}$/.test(value)&&new Set(value).size===4;
    help.textContent=!value?'異なる数字4桁を入力（先頭の0も使用可能）':
      !/^[0-9]*$/.test(value)?'数字だけを入力してください':
      value.length!==4?'あと'+Math.max(0,4-value.length)+'桁で完成':
      !valid?'同じ数字は使えません':'入力OK。この4桁で予想できる';
    help.classList.toggle('valid',valid);
  },{passive:true});
  root.addEventListener('pointerdown', event => {
    const c4=event.target.closest?.('.duel-connect4-board [data-duel-cell], .duel-connect4-board button');
    const gomoku=event.target.closest?.('[data-duel-confirm-cell]');
    const game=c4?'connect4':gomoku?'gomoku':null;
    if(!game||event.target.closest?.(':disabled'))return;
    const board=game==='connect4'?event.target.closest?.('[data-c4-match]'):root.querySelector('.duel-board.duel-gomoku[data-gomoku-match]');
    const id=game==='connect4'?board?.dataset.c4Match:board?.dataset.gomokuMatch;
    if(id)root.__duelPendingTap={game,id,at:performance.now()};
  },{passive:true});
  root.addEventListener('pointerdown', event => {
    const square = event.target.closest?.('.duel-othello .duel-square.available:not(:disabled)');
    if (square) {
      root.__duelTapAt = performance.now();
      // Match identity prevents an unrelated game update from consuming this tap.
      root.__duelTapIdentity = (root.querySelector('.duel-arena .duel-tag')?.textContent || '') + '|' + (root.querySelector('.duel-arena .duel-players')?.textContent || '');
      square.classList.add('duel-tap-feedback');
    }
  }, {passive: true});
  for (const event of ['pointerup', 'pointercancel']) {
    root.addEventListener(event, () => root.querySelectorAll('.duel-tap-feedback').forEach(x => x.classList.remove('duel-tap-feedback')), {passive: true});
  }
  addEventListener('visibilitychange', () => { if (document.hidden) { previous = null; c4Previous=null; c4Motion=null; bluffPrevious=null; bluffMotion=null; pokerPrevious=null; pokerMotion=null; hbPrevious=null; hbMotion=null; gomokuPrevious=null; gomokuLast=null; gomokuBoard=null; delete root.__duelTapAt; delete root.__duelTapIdentity; delete root.__duelPendingTap; } });
  scan();
}
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  for (const id of ['app', 'demo-app']) {
    const root = document.getElementById(id);
    if (root) enhance(root);
  }
}
