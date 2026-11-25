import {hitBlowView} from './duel-hitblow-view.js?v=web-ca5d2ee9a5a25ff4';
import {pokerView} from './duel-poker-view.js?v=web-ca5d2ee9a5a25ff4';
import {bluffDiceView} from './duel-bluff-view.js?v=web-ca5d2ee9a5a25ff4';
import {connect4LegalMoves,connect4WinningLine,pokerHandName,pokerShowdownReason} from './duel-mini-games.js?v=web-ca5d2ee9a5a25ff4';
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeData=r=>{try{return JSON.parse(r.board);}catch{return {};}};
const privateValue=r=>{try{return JSON.parse(r.private_hand);}catch{return r.private_hand??null;}};
const kp=n=>Number(n).toLocaleString('ja-JP')+' KP';
const left=r=>Math.max(0,Math.ceil((r.deadline_at-Date.now())/1000));
const cardName=id=>{const ranks='23456789TJQKA',suits=['♠','♥','♦','♣'];return ranks[Math.floor(id/4)]+suits[id%4];};
const cardColor=id=>id%4===1||id%4===2?'red':'black';
export function miniBoardView(r,info,user,busy,picks=[],confirmResign=false,guessDraft=''){
 const name=id=>info.members?.find(m=>m.id===id)?.name||'プレイヤー';
 const turn=r.status==='active'&&r.turn_user===user&&!busy&&left(r)>0;
 const a=r.black_user===r.user_a?r.user_a:r.user_b,b=a===r.user_a?r.user_b:r.user_a;
 const me=a===user?'a':'b',state=safeData(r),hand=privateValue(r),finished=r.status==='finished';
 let content='',note='';
 if(r.game==='connect4'){
  const can=turn?new Set(connect4LegalMoves(r.board)) : new Set();
  const winningSide=finished?(r.winner===a?'a':r.winner===b?'b':null):null;
  const winCells=new Set(winningSide?connect4WinningLine(r.board,winningSide):[]);
  const hasLine=winCells.size===4;
  content=`<div class="duel-connect4-head" aria-label="列を選んでコマを落とす">${Array.from({length:7},(_,i)=>`<button type="button" data-duel-cell="${i}" ${can.has(i)?'':'disabled'} aria-label="${i+1}列に落とす">▼</button>`).join('')}</div>
 <div class="duel-connect4-board ${hasLine?'duel-c4-victory-board':''}" data-c4-match="${h(r.id)}" data-c4-version="${Number(r.version)||0}" aria-label="四目並べの7列6行の盤面">
 ${[...r.board].map((c,i)=>`<span class="duel-connect4-space ${c==='a'?'a':c==='b'?'b':''} ${winCells.has(i)?'duel-c4-win':''}" data-c4-index="${i}" aria-label="${Math.floor(i/7)+1}行${i%7+1}列、${c==='a'?'赤':c==='b'?'黄':'空き'}"><i></i></span>`).join('')}
 </div>
 ${hasLine?`<div class="duel-c4-celebration" role="status" aria-live="polite"><span aria-hidden="true">✦</span><strong>FOUR IN A ROW!</strong><span aria-hidden="true">✦</span><small>${h(name(r.winner))} が4つそろえた！</small></div>`:''}`;
  note='縦・横・斜めに4個並べると勝ち。駒は列の一番下から入る。';
 }else if(r.game==='hitblow'){
  content=hitBlowView({r,state,hand,turn,me,finished,guessDraft});
  note='異なる4桁（先頭0も可）の数字を交互に予想。位置も一致する数がHit、数字だけ一致する数がBlow。先に4 Hitで勝ち。40手で引き分け。';
 }else if(r.game==='bluffdice'){
  content=bluffDiceView({r,state,hand,turn,me,a,b,name});
  note='各自5個のダイス。数を大きく宣言するか、相手を疑う。結果公開後、宣言が正しければ宣言者、違えば疑った人がラウンドを取る。先に2勝。';
 }else if(r.game==='poker'){
  content=pokerView({r,state,hand,picks,turn,finished,a,b,name});
  note='各自5枚を配り、0〜3枚を1回だけ交換できる。両者の交換が終わったら役を比較。同点は引き分け。';
 }
 const outcome=finished?(r.winner==='draw'?'引き分け：賭け金を返金':r.winner===user?'勝利：受取 '+kp(r.stake*2)+'（差引 +'+kp(r.stake)+'）':'敗北：差引 −'+kp(r.stake)):'';
 return `<div class="duel-arena duel-mini-arena">
 <div class="duel-arena-head"><div><span class="duel-tag">${h(info.games?.[r.game]?.name||r.game)}</span><strong>${kp(r.stake)} × 2</strong></div><span class="duel-state">${r.status==='finished'?'終了':'対戦中'}</span></div>
 <div class="duel-players"><span>① ${h(name(a))}</span><span>VS</span><span>② ${h(name(b))}</span></div>
 ${r.status==='active'?`<div class="duel-turn ${turn?'my-turn':''}">${turn?'🟢 あなたの番':h(name(r.turn_user))+'の番'} ・ <span data-duel-timer="${r.deadline_at}">残り${Math.ceil(left(r)/60)}分</span></div>`:''}
 ${content}
 ${finished?`<p class="duel-result">${h(outcome)}</p><p class="duel-footnote">投了・時間切れの有無は、この画面の盤面だけからは断定できない。KPの確定結果を表示している。</p>`:''}
 ${r.status==='active'?`<div class="duel-actions">${left(r)===0?'<button type="button" data-duel-act="timeout" class="action-btn primary">⏰ 時間切れを確定する</button>':(confirmResign?'<button type="button" data-duel-act="resign" class="action-btn duel-challenge">投了を確定する（敗北）</button><button type="button" data-duel-act="resign-cancel" class="action-btn">戻る</button>':'<button type="button" data-duel-act="resign-preview" class="action-btn">投了する</button>')}</div>`:''}
 <p class="duel-footnote">${h(note)}</p></div>`;
}
