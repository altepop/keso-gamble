// Local two-player walkthrough built from the SAME rules and UI components as live duels.
// All effects stay in RAM: no network, localStorage, KP API, D1 or Discord calls.
import {duelScreen} from './duel-view.js';
import {DUEL_GAMES,initialDuelBoard,playDuelMove} from './duel-rules.js';
import {EXTRA_DUEL_GAMES,miniStart,miniMove} from './duel-mini-games.js';
const GAMES={...DUEL_GAMES,...EXTRA_DUEL_GAMES};
const USERS={a:'100000000000000101',b:'100000000000000102'};
const MEMBERS=[{id:USERS.a,name:'プレイヤーA'},{id:USERS.b,name:'プレイヤーB'}];
const MINI=new Set(Object.keys(EXTRA_DUEL_GAMES));
const $=s=>document.querySelector(s);
const rand=n=>{const value=new Uint32Array(1),limit=Math.floor(4294967296/n)*n;do{crypto.getRandomValues(value);}while(value[0]>=limit);return value[0]%n;};
let game='othello',viewer='a',target=USERS.b,stake=1000,match=null,secret=null,balance={[USERS.a]:20000,[USERS.b]:20000},
 picks=[],confirmResign=false,pickerOpen=false,lastError='',status='';
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
 const selected=projection(),info={games:GAMES,members:MEMBERS,matches:selected?[selected]:[]};
 $('#demo-app').innerHTML=duelScreen({info,user:current(),live:true,cash:balance[current()],selectedId:match?.id,game,stake,target,busy:false,error:lastError,confirmResign,pokerPicks:picks,opponentPickerOpen:pickerOpen});
 for(const button of document.querySelectorAll('[data-demo-view]')){
  button.setAttribute('aria-pressed',String(button.dataset.demoView===viewer));
 }
 $('#demo-mode').value=game;$('#demo-feedback').textContent=status;
}
function restart(name=game){
 if(!Object.hasOwn(GAMES,name))throw Error('不正なゲーム');
 game=name;viewer='a';target=USERS.b;match=null;secret=null;balance={[USERS.a]:20000,[USERS.b]:20000};
 picks=[];confirmResign=false;pickerOpen=false;note('');
 render();
}
function startInvite(){
 if(!target||target===current())throw Error('対戦相手を選んでください');
 match={id:crypto.randomUUID(),guild:'demo',user_a:current(),user_b:target,game,stake,status:'pending',
  board:MINI.has(game)?'.':initialDuelBoard(game),black_user:null,turn_user:null,
  winner:null,version:0,created_at:Date.now(),updated_at:Date.now(),deadline_at:Date.now()+15*60000};
 note('申し込みを作成しました。画面を見る人を切り替えて承認してください。');render();
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
 note('対戦を開始しました。プレイヤーAとBを切り替えて操作できます。');render();
}
function move(body){
 if(!match||match.status!=='active'||current()!==match.turn_user)throw Error('手番を確認してください');
 const other=current()===match.user_a?match.user_b:match.user_a;
 if(MINI.has(game)){
  const result=miniMove(game,match.board,secret,sideOf(current()),body,rand);
  match.board=result.board;secret=result.secret;match.turn_user=result.turnSide?userOf(result.turnSide):null;
  if(result.winner)settle(result.winner==='draw'?'draw':userOf(result.winner));
 }else{
  const color=match.black_user===current()?'B':'W';
  const result=playDuelMove(game,match.board,color,Number(body.cell));
  match.board=result.board;
  match.turn_user=result.nextColor?(result.nextColor==='B'?match.black_user:other):null;
  if(result.winner)settle(result.winner==='draw'?'draw':result.winner==='B'?match.black_user:other);
 }
 match.version++;match.updated_at=Date.now();match.deadline_at=Date.now()+10*60000;
 picks=[];confirmResign=false;render();
}
function resign(){
 if(!match||match.status!=='active')throw Error('進行中の対戦はありません');
 settle(current()===match.user_a?match.user_b:match.user_a);
 match.version++;render();
}
$('#demo-reset').addEventListener('click',()=>restart($('#demo-mode').value));
$('#demo-mode').addEventListener('change',e=>restart(e.target.value));
document.addEventListener('change',e=>{
 if(e.target.id==='duel-game'){game=e.target.value;note('');render();}
 else if(e.target.id==='duel-stake'){stake=Number(e.target.value);render();}
});
document.addEventListener('click',e=>{
 const switcher=e.target.closest('[data-demo-view]');
 if(switcher){viewer=switcher.dataset.demoView;picks=[];confirmResign=false;pickerOpen=false;note('');render();return;}
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
 const button=e.target.closest('[data-duel-act],[data-duel-cell]');
 if(!button)return;
 const action=button.dataset.duelCell!==undefined?'move':button.dataset.duelAct;
 try{
  if(action==='create'){startInvite();return;}
  if(action==='accept'){accept();return;}
  if(action==='cancel'){if(match?.status!=='pending')throw Error('申し込みは取り消せません');match.status='cancelled';note('申し込みを取り消しました');render();return;}
  if(action==='resign-preview'){confirmResign=true;render();return;}
  if(action==='resign-cancel'){confirmResign=false;render();return;}
  if(action==='resign'){resign();return;}
  if(action==='timeout'){if(match?.status!=='active')throw Error('対戦中ではありません');settle(match.turn_user===match.user_a?match.user_b:match.user_a);render();return;}
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
