// Progressive visual enhancement only. Never sends actions, determines winners or reads KP.
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
function enhance(root) {
  let previous = null, motion = null, lastBoard = null;
  let c4Previous=null,c4Motion=null,lastC4Board=null;
  let bluffPrevious=null,bluffMotion=null,lastBluffTable=null;
  let pokerPrevious=null,pokerMotion=null,lastPokerTable=null;
  let hbPrevious=null,hbMotion=null,lastHbTable=null;
  let gomokuPrevious=null,gomokuLast=null,gomokuBoard=null;
  const gomokuZoom=new Map();
  const zoomLevels=[44,52,60,72];
  function scanHitBlow(){
   const table=root.querySelector('.duel-hb-table[data-hb-match]');
   if(!table){hbPrevious=null;hbMotion=null;lastHbTable=null;return;}
   if(table===lastHbTable)return;
   lastHbTable=table;
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
    if(change)c4Motion={...change,id,version,state,started:now};
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
      if(change)gomokuLast={...change,id,version,state,started:now};
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

  // This enhancement never sends moves, changes selection, or modifies wallet state.
  function scanDuelJourney(){
    const current=root.querySelector('.duel-current');
    const intro=root.querySelector('.duel-intro');
    const form=root.querySelector('.duel-new');
    const anchor=current||intro||form;
    if(!anchor)return;
    const arena=current?.querySelector('.duel-arena');
    const finished=!!arena?.querySelector('.duel-result')||arena?.querySelector('.duel-state')?.textContent?.trim()==='終了';
    const stage=arena?(finished?'finished':'active'):current?'pending':'setup';
    const outgoing=!!current?.querySelector('h2')?.textContent?.includes('相手の返答待ち');
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
    rail.dataset.duelJourneySignature=signature;
    // Fixed Japanese copy only; no names, private cards, guessed moves or user HTML.
    rail.innerHTML='<ol class="duel-journey-steps" aria-label="進行段階">'+state.phases.map((name,index)=>
      '<li class="duel-journey-step '+(index===state.step?'is-current':index<state.step?'is-done':'is-next')+'"'+
      (index===state.step?' aria-current="step"':'')+'><span aria-hidden="true">'+(index+1)+'</span>'+name+'</li>').join('')+
      '</ol><p class="duel-journey-title" role="status" aria-live="polite">'+state.title+
      '</p><p class="duel-journey-help">'+state.detail+'</p>';
  }
  function scan() {
    scanDuelJourney();
    scanConnect4();
    scanBluffDice();
    scanPoker();
    scanHitBlow();
    scanGomoku();
    const board = root.querySelector('.duel-board.duel-othello');
    if (!board) { previous = null; motion = null; lastBoard = null; return; }
    if (board === lastBoard) return; // Ignore mutations outside the board, such as the timer.
    lastBoard = board;
    const current = readBoard(board);
    if (!current) { previous = null; motion = null; return; }
    const players = root.querySelector('.duel-arena .duel-players')?.textContent || '';
    const identity = (root.querySelector('.duel-arena .duel-tag')?.textContent || '') + '|' + players;
    const now = performance.now(), signature = current.state.join('');
    const changes = previous && previous.identity === identity && now - previous.at < 20000 && !document.hidden
      ? classifyOthelloTransition(previous.state, current.state) : null;
    previous = {state: current.state, identity, at: now};
    if (changes) {
      motion = {changes, identity, signature, started: now};
      // Local tap-to-confirmed-render metric is diagnostic only; not a network benchmark.
      if (root.__duelTapAt !== undefined) {
        root.__duelTapToConfirmedMs = Math.round(now - root.__duelTapAt);
        delete root.__duelTapAt;
      }
    }
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
  const observer = new MutationObserver(scan);
  observer.observe(root, {childList: true, subtree: true});
  root.addEventListener('input',event=>{
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
    const square = event.target.closest?.('.duel-othello .duel-square.available:not(:disabled)');
    if (square) {
      root.__duelTapAt = performance.now();
      square.classList.add('duel-tap-feedback');
    }
  }, {passive: true});
  for (const event of ['pointerup', 'pointercancel']) {
    root.addEventListener(event, () => root.querySelectorAll('.duel-tap-feedback').forEach(x => x.classList.remove('duel-tap-feedback')), {passive: true});
  }
  addEventListener('visibilitychange', () => { if (document.hidden) { previous = null; c4Previous=null; c4Motion=null; bluffPrevious=null; bluffMotion=null; pokerPrevious=null; pokerMotion=null; hbPrevious=null; hbMotion=null; gomokuPrevious=null; gomokuLast=null; gomokuBoard=null; delete root.__duelTapAt; } });
  scan();
}
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  for (const id of ['app', 'demo-app']) {
    const root = document.getElementById(id);
    if (root) enhance(root);
  }
}
