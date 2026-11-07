import {miniBoardView} from './duel-mini-view.js?v=web-0f68b2c668fb1902';
import {EXTRA_DUEL_GAMES} from './duel-mini-games.js?v=web-0f68b2c668fb1902';
import {DUEL_GAMES,duelLegalMoves,duelScore} from './duel-rules.js?v=web-0f68b2c668fb1902';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kp=n=>Number(n||0).toLocaleString('ja-JP')+' KP';
const title=(r)=>DUEL_GAMES[r.game]?.name||EXTRA_DUEL_GAMES[r.game]?.name||r.game;
const status=r=>r.status==='pending'?'招待中':r.status==='active'?'対局中':r.status==='finished'?'終了':'キャンセル';
const timeLeft=deadline=>Math.max(0,Math.ceil((deadline-Date.now())/1000));
function summary(r,info,user){
 const other=r.user_a===user?r.user_b:r.user_a;
 const name=info.members.find(m=>m.id===other)?.name||'対戦相手';
 const active=r.status==='active'||r.status==='pending';
 return `<button type="button" class="duel-match ${active?'duel-live':''}" data-duel-select="${esc(r.id)}">
  <span><strong>${esc(title(r))}</strong><small>${esc(name)} · ${esc(status(r))}</small></span>
  <span class="duel-purse">${kp(r.stake)}<small>${r.status==='active'?'勝った人が '+kp(r.stake*2)+' 受け取り':r.status==='pending'?'返答待ち':'結果を見る'}</small></span>
 </button>`;
}
function boardView(r,info,user,busy,confirmResign){
 const ownBlack=r.black_user===user,own=r.user_a===user||r.user_b===user;
 const black=r.black_user===r.user_a?r.user_a:r.user_b;
 const white=black===r.user_a?r.user_b:r.user_a;
 const name=id=>info.members.find(m=>m.id===id)?.name||'参加者';
 const size=DUEL_GAMES[r.game]?.size??8,turn=r.status==='active'&&r.turn_user===user;
 const color=ownBlack?'B':'W',canPlay=turn&&own&&!busy&&timeLeft(r.deadline_at)>0;
 let legal=[];
 try{if(canPlay)legal=duelLegalMoves(r.game,r.board,color);}catch{}
 const playable=new Set(legal);
 const score=duelScore(r.board);
 const result=r.winner==='draw'?'引き分け：賭け金を返金':r.winner===user?'勝利：'+kp(r.stake*2)+'を受け取り':r.winner?'敗北：'+kp(r.stake)+'の支払い確定':'';
 const expired=timeLeft(r.deadline_at)===0;
 const section=`<div class="duel-arena">
 <div class="duel-arena-head"><div><span class="duel-tag">${esc(title(r))}</span><strong>${kp(r.stake)} × 2</strong></div>
 <span class="duel-state">${esc(status(r))}</span></div>
 <div class="duel-players"><span><b class="duel-token black">●</b>${esc(name(black))}</span><span>VS</span><span><b class="duel-token white">●</b>${esc(name(white))}</span></div>
 ${r.status==='active'?`<div class="duel-turn ${turn?'my-turn':''}">${turn?'🟢 あなたの番':esc(name(r.turn_user))+'の番'}　残り ${Math.ceil(timeLeft(r.deadline_at)/60)}分</div>`:''}
 <div class="duel-board ${r.game==='gomoku'?'duel-gomoku':'duel-othello'}" role="grid" aria-label="${esc(title(r))}の盤面" style="--duel-size:${size}">
 ${[...r.board].map((cell,i)=>{
   const active=canPlay&&playable.has(i);
   const classes=[cell==='B'?'black':cell==='W'?'white':'empty',active?'available':''].join(' ');
   return `<button type="button" class="duel-square ${classes}" role="gridcell" data-duel-cell="${i}" title="${Math.floor(i/size)+1}行${i%size+1}列" aria-label="${Math.floor(i/size)+1}行${i%size+1}列 ${cell==='B'?'黒':cell==='W'?'白':active?'着手可能':'空き'}" ${active?'':'disabled'}><span class="duel-piece"></span></button>`;
 }).join('')}</div>
 <div class="duel-counts"><span>⚫ 黒 ${score.B}</span><span>⚪ 白 ${score.W}</span></div>
 ${r.status==='finished'?`<div class="duel-result">${esc(result)}</div>`:''}
 ${r.status==='active'?`<div class="duel-actions">
 ${expired?`<button type="button" class="action-btn primary" data-duel-act="timeout" ${busy?'disabled':''}>時間切れを確定する</button>`:
 `<button type="button" class="action-btn ${confirmResign?'danger':''}" data-duel-act="${confirmResign?'resign':'resign-preview'}" ${busy?'disabled':''}>${confirmResign?'投了を確定する（負けとして精算）':'投了する'}</button>
 ${confirmResign?'<button type="button" class="action-btn" data-duel-act="resign-cancel">やめる</button>':''}`}
 </div>`:''}
 ${r.game==='gomoku'?'<p class="duel-footnote">五目並べは縦・横・斜めに5個以上並べると勝ち。禁じ手はなく、先手はランダムで決まる。</p>':
 '<p class="duel-footnote">オセロは黒が先手。置ける場所がない場合は自動的にパスし、最後に石の多い方が勝ち。</p>'}
 </div>`;
 return section;
}
export function duelScreen({info,user,live,cash,selectedId,game='othello',stake=1000,target='',busy=false,error='',confirmResign=false,pokerPicks=[],fallbackMembers=[],opponentPickerOpen=false,loading=false,nav=''}){
 const matches=info?.matches??[],chosen=matches.find(r=>r.id===selectedId)||matches.find(r=>r.status==='active'||r.status==='pending')||matches[0];
 const members=(info?.members?.length?info.members:fallbackMembers).filter(m=>m&&typeof m.id==='string'&&m.id!==user);
 const invited=chosen?.status==='pending',mine=chosen?.user_a===user;
 const selectedMember=members.find(m=>m.id===target);
 info={...info,members:[...(info?.members??[]),...members.filter(m=>!(info?.members??[]).some(x=>x.id===m.id))]};
 return `<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">⚔️ 決闘</h1><div class="small-actions"><span class="badge">${kp(cash)}</span></div></div></header>
 <div class="duel-intro"><span>対人ゲーム</span><h2>KPを賭けて対戦</h2><p>ゲームと対戦相手、賭け金を選んで申し込む。相手が承認すると対戦が始まり、勝った人が双方の賭け金を受け取る。引き分けは返金。</p></div>
 ${!live?'<div class="panel"><div class="card-body">KP口座に接続すると対戦できる。</div></div>':
 `<div class="duel-new panel"><div class="card-body">
 <h2 class="panel-title">対戦を申し込む</h2><div class="duel-formrow">
 <label>ゲーム<select id="duel-game" class="select"><option value="othello" ${game==='othello'?'selected':''}>⚫ オセロ</option><option value="gomoku" ${game==='gomoku'?'selected':''}>⚪ 五目並べ</option><option value="connect4" ${game==='connect4'?'selected':''}>🔴 四目並べ</option><option value="hitblow" ${game==='hitblow'?'selected':''}>🔢 Hit & Blow</option><option value="bluffdice" ${game==='bluffdice'?'selected':''}>🎲 ブラフダイス</option><option value="poker" ${game==='poker'?'selected':''}>🃏 5カードポーカー</option></select></label>
 <label>賭け金<select id="duel-stake" class="select">${[100,500,1000,5000,10000,50000,100000].map(n=>`<option value="${n}" ${n===stake?'selected':''}>${kp(n)} / 人</option>`).join('')}</select></label>
 </div><div class="duel-opponent-field"><span class="duel-opponent-label">対戦相手</span>
 <button type="button" class="duel-opponent-toggle" data-duel-target-toggle="1" aria-expanded="${opponentPickerOpen}" aria-controls="duel-opponent-list">
 <span>${selectedMember?esc(selectedMember.name):members.length?'相手を選択':'対戦相手を読み込み中'}</span><span aria-hidden="true">▾</span></button>
 ${opponentPickerOpen&&members.length?`<div class="duel-opponent-list" id="duel-opponent-list" role="group" aria-label="対戦相手一覧">
 ${members.map(m=>`<button type="button" class="duel-opponent-choice ${m.id===target?'selected':''}" data-duel-target-option="${esc(m.id)}" aria-pressed="${m.id===target}">${esc(m.name)}${m.id===target?' ✓':''}</button>`).join('')}</div>`:''}
 ${!members.length?`<p class="duel-opponent-help" role="status">${error?'対戦相手を取得できません。画面を更新してください。':loading?'対戦相手を確認しています':'対戦相手が表示されません。右下の「更新」を押してください。'}</p>`:''}
 ${!info?.members?.length&&members.length?'<p class="duel-opponent-help">口座に登録されたメンバーを表示しています</p>':''}
 ${error?'<p class="duel-opponent-help" role="alert">'+esc(error)+'</p>':''}
 </div>
 <div class="duel-explainer"><strong>勝てば +${kp(stake)} / 負ければ −${kp(stake)}</strong><br>申し込み時にはKPは減らない。相手が承認すると双方から${kp(stake)}ずつ引かれる。</div>
 <button type="button" class="action-btn primary duel-full" data-duel-act="create" ${busy||!target||cash<stake?'disabled':''}>対戦を申し込む</button>
 </div></div>
 ${error?`<div class="storage-warning duel-error" role="alert">${esc(error)}</div>`:''}
 <div class="duel-history panel"><div class="card-body">
 <div class="duel-heading"><h2 class="panel-title">対戦ルーム</h2><button class="action-btn" data-duel-refresh="1" ${busy?'disabled':''}>更新 ↻</button></div>
 ${matches.length?matches.map(r=>summary(r,info,user)).join(''):'<p class="helper">対戦履歴はまだありません。</p>'}
 </div></div>
 ${chosen?`<div class="duel-current">
 ${invited?`<div class="panel"><div class="card-body"><h2 class="panel-title">${mine?'相手の返答待ち':'対戦の申し込み'}</h2>
 <p class="helper">${esc(title(chosen))} / ${kp(chosen.stake)}ずつ。招待期限まで約${Math.ceil(timeLeft(chosen.deadline_at)/60)}分。</p>
 <div class="action-row">${!mine&&timeLeft(chosen.deadline_at)>0?`<button class="action-btn primary" data-duel-act="accept" ${busy?'disabled':''}>承認して始める（${kp(chosen.stake)}）</button>`:''}
 <button class="action-btn" data-duel-act="cancel" ${busy?'disabled':''}>${mine?'招待を取り消す':'断る'}</button></div></div></div>`:''}
 ${chosen.status!=='pending'&&chosen.status!=='cancelled'?(Object.hasOwn(EXTRA_DUEL_GAMES,chosen.game)?miniBoardView(chosen,info,user,busy,pokerPicks,confirmResign):boardView(chosen,info,user,busy,confirmResign)):''}
 </div>`:''}
 <div class="panel"><div class="card-body"><h2 class="panel-title">対戦ルール</h2><p class="helper">1手の制限時間は10分。制限時間を過ぎた場合と投了した場合は負けになる。対戦開始後は賭け金を取り消せない。引き分けでは双方に賭け金を返金する。遺物の補正や借KPは使えない。CPU対戦には対応していない。</p></div></div>`}
 ${nav}</div>`;
}
