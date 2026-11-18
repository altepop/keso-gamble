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
function enhance(root) {
  let previous = null, motion = null, lastBoard = null;
  let c4Previous=null,c4Motion=null,lastC4Board=null;
  let bluffPrevious=null,bluffMotion=null,lastBluffTable=null;
  let pokerPrevious=null,pokerMotion=null,lastPokerTable=null;
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
  function scan() {
    scanConnect4();
    scanBluffDice();
    scanPoker();
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
  const observer = new MutationObserver(scan);
  observer.observe(root, {childList: true, subtree: true});
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
  addEventListener('visibilitychange', () => { if (document.hidden) { previous = null; c4Previous=null; c4Motion=null; bluffPrevious=null; bluffMotion=null; pokerPrevious=null; pokerMotion=null; delete root.__duelTapAt; } });
  scan();
}
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  for (const id of ['app', 'demo-app']) {
    const root = document.getElementById(id);
    if (root) enhance(root);
  }
}
