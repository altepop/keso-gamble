// Local two-player walkthrough built from the SAME rules and UI components as live duels.
// All effects stay in RAM: no network, localStorage, KP API, D1 or Discord calls.
import {duelScreen} from '../js/duel-view.js';
import {DUEL_GAMES,initialDuelBoard,playDuelMove} from '../js/duel-rules.js';
import {EXTRA_DUEL_GAMES,miniStart,miniMove} from '../js/duel-mini-games.js';
import {chooseCpuMove} from './cpu.js';
const GAMES={...DUEL_GAMES,...EXTRA_DUEL_GAMES};
const USERS={a:'100000000000000101',b:'100000000000000102'};
const MEMBERS=[{id:USERS.a,name:'プレイヤーA'},{id:USERS.b,name:'プレイヤーB'}];
const CPU_MEMBERS=[{id:USERS.a,name:'あなた'},{id:USERS.b,name:'CPU'}];
const MINI=new Set(Object.keys(EXTRA_DUEL_GAMES));
const $=s=>document.querySelector(s);
const rand=n=>{const value=new Uint32Array(1),limit=Math.floor(4294967296/n)*n;do{crypto.getRandomValues(value);}while(value[0]>=limit);return value[0]%n;};
let game='othello',viewer='a',target=USERS.b,stake=1000,match=null,secret=null,balance={[USERS.a]:20000,[USERS.b]:20000},
 picks=[],confirmResign=false,pickerOpen=false,lastError='',status='',previewCell=null,guessDraft='',
 againstCpu:new URLSearchParams(location.search).get('cpu')==='1',cpuLevel='normal',cpuBusy=false,cpuTimer=null,roundId=0;
const recentMoves=new Map(),localMoveHistory=new Map();
function current(){return USERS[viewer];}
function sideOf(user){return match?.black_user===user?'a':'b';}
function userOf(side){return side==='a'?match.black_user:match.black_user===match.user_a?match.user_b:match.user_a;}
function projection(){
 if(!match)return null;
 const r={...match};
 if(secret&&match.black_user){const s=JSON.parse(secret);r.private_hand=JSON.stringify(sideOf(current())==='a'?s.privateA:s.privateB);}
 else r.private_hand=null;
 return r;
}
function note(text,error=false){lastError=error?String(text):'';status=error?'':text;}
function render(){
 const selected=projection(),info={games:GAMES,members:againstCpu?CPU_MEMBERS:MEMBERS,matches:selected?[selected]:[]};
 document.body.classList.toggle('cpu-practice',againstCpu);
 $('#demo-title').textContent=againstCpu?'CPU練習':'決闘デモ';
 $('#demo-cpu-settings').hidden=!againstCpu;
 $('#demo-cpu-level').value=cpuLevel;
 $('#demo-notice').innerHTML=againstCpu?
  '<strong>ここは練習用。実KPは変動せず、D1やDiscordへ一切送信しない。</strong> 画面のKPは仮の数値。対人戦と同じ判定ルールでCPUと遊べる。':
  '本番KP・D1・Discordには接続しない。この画面だけで2人分の操作を確認できる。<strong>表示する人を切り替えると手札も切り替わる。</strong>';
 const oldScroll=$('#demo-app [data-duel-board-scroll]');
 const position=oldScroll?{id:oldScroll.dataset.duelBoardScroll,left:oldScroll.scrollLeft,top:oldScroll.scrollTop}:null;
 $('#demo-app').innerHTML=duelScreen({info,user:current(),live:true,cash:balance[current()],selectedId:match?.id,game,stake,target,busy:false,error:lastError,confirmResign,pokerPicks:picks,opponentPickerOpen:pickerOpen,gomokuPreviewCell:previewCell,guessDraft,recentMoves,localMoveHistory});
 const scroll=$('#demo-app [data-duel-board-scroll]');
 if(scroll){
  if(position?.id===scroll.dataset.duelBoardScroll){scroll.scrollLeft=position.left;scroll.scrollTop=position.top;}
  else{scroll.scrollLeft=(scroll.scrollWidth-scroll.clientWidth)/2;scroll.scrollTop=(scroll.scrollHeight-scroll.clientHeight)/2;}
 }
 for(const button of document.querySelectorAll('[data-demo-play]'))
  button.setAttribute('aria-pressed',String((button.dataset.demoPlay==='cpu')===againstCpu));
 for(const button of document.querySelectorAll('[data-demo-view]')){
  button.setAttribute('aria-pressed',String(button.dataset.demoView===viewer));
 }
 $('#demo-mode').value=game;$('#demo-feedback').textContent=status;
}
function restart(name=game){
 if(!Object.hasOwn(GAMES,name))throw Error('不正なゲーム');
 game=name;viewer='a';target=USERS.b;match=null;secret=null;balance={[USERS.a]:20000,[USERS.b]:20000};
 picks=[];previewCell=null;confirmResign=false;pickerOpen=false;guessDraft='';recentMoves.clear();localMoveHistory.clear();note('');
 roundId++;if(cpuTimer!==null)clearTimeout(cpuTimer);cpuTimer=null;cpuBusy=false;
 if(againstCpu){
  const now=Date.now();
  match={id:crypto.randomUUID(),guild:'practice',user_a:USERS.a,user_b:USERS.b,game,stake,status:'active',
   board:MINI.has(game)?'.':initialDuelBoard(game),black_user:USERS.a,turn_user:USERS.a,
   winner:null,version:1,created_at:now,updated_at:now,deadline_at:now+10*60000};
  if(MINI.has(game)){const started=miniStart(game,rand);match.board=started.board;secret=started.secret;}
  balance[USERS.a]-=stake;balance[USERS.b]-=stake;
  note('CPUとの練習を開始しました。あなたが先手です。');
 }
 render();
}
function startInvite(){
 if(!target||target===current())throw Error('対戦相手を選んでください');
 match={id:crypto.randomUUID(),guild:'demo',user_a:current(),user_b:target,game,stake,status:'pending',
  board:MINI.has(game)?'.':initialDuelBoard(game),black_user:null,turn_user:null,
  winner:null,version:0,created_at:Date.now(),updated_at:Date.now(),deadline_at:Date.now()+15*60000};
 previewCell=null;note('申し込みを作成しました。画面を見る人を切り替えて承認してください。');render();
}
function settle(winner){
 if(match.status==='finished')return;
 match.winner=winner;match.status='finished';match.turn_user=null;
 if(winner==='draw'){balance[match.user_a]+=match.stake;balance[match.user_b]+=match.stake;}
 else if(winner===match.user_a||winner===match.user_b)balance[winner]+=2*match.stake;
 else throw Error('勝者が不正です。');
 note('対戦を終了しました。画面の勝敗と残高を確認できます。');
}
function accept(){
 if(!match||match.status!=='pending'||current()!==match.user_b)throw Error('相手側の画面から承認してください');
 if(balance[match.user_a]<match.stake||balance[match.user_b]<match.stake)throw Error('賭け金が不足しています');
 // Accept is all-or-nothing in the real Worker. In demo this is a local-only calculation.
 balance[match.user_a]-=match.stake;balance[match.user_b]-=match.stake;
 match.black_user=match.user_a;match.turn_user=match.user_a;
 if(MINI.has(game)){const init=miniStart(game,rand);match.board=init.board;secret=init.secret;}
 match.status='active';match.version++;match.updated_at=Date.now();match.deadline_at=Date.now()+10*60000;
 previewCell=null;note('対戦を開始しました。プレイヤーAとBを切り替えて操作できます。');render();
}
function move(body,actor=current()){
 if(!match||match.status!=='active'||actor!==match.turn_user)throw Error('手番を確認してください');
 const other=actor===match.user_a?match.user_b:match.user_a;
 const oldBoard=match.board;
 if(MINI.has(game)){
  const result=miniMove(game,match.board,secret,sideOf(actor),body,rand);
  match.board=result.board;secret=result.secret;match.turn_user=result.turnSide?userOf(result.turnSide):null;
  if(result.winner)settle(result.winner==='draw'?'draw':userOf(result.winner));
 }else{
  const color=match.black_user===actor?'B':'W';
  const result=playDuelMove(game,match.board,color,Number(body.cell));
  match.board=result.board;
  match.turn_user=result.nextColor?(result.nextColor==='B'?match.black_user:other):null;
  if(result.winner)settle(result.winner==='draw'?'draw':result.winner==='B'?match.black_user:other);
 }
 match.version++;match.updated_at=Date.now();match.deadline_at=Date.now()+10*60000;
 if(!MINI.has(game)){const added=[...match.board].flatMap((cell,i)=>oldBoard[i]==='.'&&cell!=='.'?[i]:[]);if(added.length===1){recentMoves.set(match.id,{version:match.version,cell:added[0]});const entries=localMoveHistory.get(match.id)??[];localMoveHistory.set(match.id,[...entries,{version:match.version,cell:added[0],color:match.board[added[0]]}].slice(-12));}else recentMoves.delete(match.id);}
 picks=[];previewCell=null;confirmResign=false;guessDraft='';render();
 if(againstCpu&&match.status==='active'&&match.turn_user===USERS.b&&!cpuBusy)scheduleCpu();
}
function scheduleCpu(){
 if(cpuBusy||!againstCpu||match?.status!=='active'||match.turn_user!==USERS.b)return;
 cpuBusy=true;const id=roundId;
 note('CPUが考えています…');render();
 cpuTimer=setTimeout(()=>{
  cpuTimer=null;
  if(id!==roundId||!againstCpu||match?.status!=='active'||match.turn_user!==USERS.b){cpuBusy=false;return;}
  try{
   // A hidden hand belongs to the CPU only. Opponent secrets never enter its decision function.
   const own=secret?JSON.parse(secret).privateB:null;
   const side=MINI.has(game)?'b':'W';
   const action=chooseCpuMove(game,match.board,{side,hand:own,level:cpuLevel});
   cpuBusy=false;move(action,USERS.b);
   if(match.status==='active')note('CPUが操作しました。次はあなたの手番です。');
   else note('練習対戦が終了しました。結果を確認できます。');
   render();
  }catch(error){cpuBusy=false;note('CPUの操作に失敗しました。最初からやり直してください。'+(error.message??''),true);render();}
 },430);
}
function resign(){
 if(!match||match.status!=='active')throw Error('進行中の対戦はありません');
 settle(current()===match.user_a?match.user_b:match.user_a);
 match.version++;render();
}
$('#demo-reset').addEventListener('click',()=>restart($('#demo-mode').value));
$('#demo-cpu-level').addEventListener('change',e=>{cpuLevel=e.target.value;restart();});
document.querySelectorAll('[data-demo-play]').forEach(button=>button.addEventListener('click',()=>{
 againstCpu=button.dataset.demoPlay==='cpu';
 history.replaceState(null,'',againstCpu?'?cpu=1':'?cpu=0');
 restart();
}));
$('#demo-mode').addEventListener('change',e=>restart(e.target.value));
document.addEventListener('input',e=>{if(e.target.id==='duel-guess')guessDraft=e.target.value;});
document.addEventListener('change',e=>{
 if(e.target.id==='duel-bid-count'){
  const face=$('#duel-bid-face');
  if(face&&match?.game==='bluffdice'){
   const bid=JSON.parse(match.board).bid,count=Number(e.target.value);
   for(const opt of face.options)opt.disabled=!!bid&&(count<bid.count||(count===bid.count&&Number(opt.value)<=bid.face));
   if(face.selectedOptions[0]?.disabled)face.value=[...face.options].find(o=>!o.disabled)?.value??'';
  }return;
 }

 if(e.target.id==='duel-game'){game=e.target.value;guessDraft='';note('');render();}
 else if(e.target.id==='duel-stake'){stake=Number(e.target.value);render();}
});
document.addEventListener('click',e=>{
 const switcher=e.target.closest('[data-demo-view]');
 if(switcher){if(againstCpu)return;viewer=switcher.dataset.demoView;picks=[];guessDraft='';previewCell=null;confirmResign=false;pickerOpen=false;note('');render();return;}
 const targetOption=e.target.closest('[data-duel-target-option]');
 if(targetOption){target=targetOption.dataset.duelTargetOption;pickerOpen=false;render();return;}
 if(e.target.closest('[data-duel-target-toggle]')){pickerOpen=!pickerOpen;render();return;}
 const picked=e.target.closest('[data-duel-card]');
 if(picked){
  const index=Number(picked.dataset.duelCard);
  if(picks.includes(index))picks=picks.filter(x=>x!==index);
  else if(picks.length<3)picks=[...picks,index];
  else{note('交換できるのは3枚までです',true);}
  render();return;
 }
 if(e.target.closest('[data-duel-refresh]')){note('デモは通信せず、この端末だけで更新します');render();return;}
 const selection=e.target.closest('[data-duel-select]');
 if(selection){note('');render();return;}
 const button=e.target.closest('[data-duel-act],[data-duel-cell],[data-duel-confirm-cell],[data-duel-cancel-cell]');
 if(!button)return;
 if(button.dataset.duelCancelCell!==undefined){previewCell=null;render();return;}
 if(button.dataset.duelCell!==undefined&&game==='gomoku'){
  if(match?.status!=='active'||match.turn_user!==current())return;
  previewCell=Number(button.dataset.duelCell);render();return;
 }
 if(button.dataset.duelConfirmCell!==undefined){
  const cell=Number(button.dataset.duelConfirmCell);
  if(game!=='gomoku'||previewCell!==cell||match?.turn_user!==current()){previewCell=null;note('もう一度マスを選択してください',true);render();return;}
  try{move({cell});}catch(error){previewCell=null;note(error.message||'操作を確認できませんでした',true);render();}
  return;
 }
 const action=button.dataset.duelCell!==undefined?'move':button.dataset.duelAct;
 try{
  if(action==='create'){if(againstCpu){restart();return;}startInvite();return;}
  if(action==='accept'){if(againstCpu)return;accept();return;}
  if(action==='cancel'){if(match?.status!=='pending')throw Error('申し込みは取り消せません');match.status='cancelled';note('申し込みを取り消しました');render();return;}
  if(action==='resign-preview'){confirmResign=true;render();return;}
  if(action==='resign-cancel'){confirmResign=false;render();return;}
  if(action==='resign'){resign();return;}
  if(action==='timeout'){if(againstCpu){note('CPU練習では時間切れの精算操作は使いません。',true);render();return;}if(match?.status!=='active')throw Error('対戦中ではありません');settle(match.turn_user===match.user_a?match.user_b:match.user_a);render();return;}
  if(action==='move'){
   const mode=button.dataset.duelMini;
   const body=mode==='hitblow'?{guess:$('#duel-guess')?.value}:
    mode==='bid'?{choice:'bid',count:Number($('#duel-bid-count')?.value),face:Number($('#duel-bid-face')?.value)}:
    mode==='challenge'?{choice:'challenge'}:
    mode==='poker'?{cells:[...picks]}:{cell:Number(button.dataset.duelCell)};
   move(body);return;
  }
 }catch(error){note(error.message||'操作を確認できませんでした',true);render();}
});
restart();
