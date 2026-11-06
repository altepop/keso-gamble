import {miniBoardView} from './duel-mini-view.js';
import {EXTRA_DUEL_GAMES} from './duel-mini-games.js';
import {DUEL_GAMES,duelLegalMoves,duelScore} from './duel-rules.js?v=web-d9b96b4bdbea49e0';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kp=n=>Number(n||0).toLocaleString('ja-JP')+' KP';
const title=(r)=>DUEL_GAMES[r.game]?.name||EXTRA_DUEL_GAMES[r.game]?.name||r.game;
const status=r=>r.status==='pending'?'招待中':r.status==='active'?'対局中':r.status==='finished'?'決着':'キャンセル';
const timeLeft=deadline=>Math.max(0,Math.ceil((deadline-Date.now())/1000));
function summary(r,info,user){
 const other=r.user_a===user?r.user_b:r.user_a;
 const name=info.members.find(m=>m.id===other)?.name||'対戦相手';
 const active=r.status==='active'||r.status==='pending';
 return `<button type="button" class="duel-match ${active?'duel-live':''}" data-duel-select="${esc(r.id)}">
  <span><strong>${esc(title(r))}</strong><small>${esc(name)} · ${esc(status(r))}</small></span>
  <span class="duel-purse">${kp(r.stake)}<small>${r.status==='active'?'総取り '+kp(r.stake*2):r.status==='pending'?'双方同額':'結果を見る'}</small></span>
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
 const result=r.winner==='draw'?'引き分け · 双方に賭け金を返却':r.winner===user?'勝利！ 賞金 '+kp(r.stake*2)+'獲得':r.winner?'敗北 · 賭け金 '+kp(r.stake)+'を失った':'';
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
 ${expired?`<button type="button" class="action-btn primary" data-duel-act="timeout" ${busy?'disabled':''}>⏰ 時間切れを確定する</button>`:
 `<button type="button" class="action-btn ${confirmResign?'danger':''}" data-duel-act="${confirmResign?'resign':'resign-preview'}" ${busy?'disabled':''}>${confirmResign?'本当に投了する（賭け金は相手へ）':'投了する'}</button>
 ${confirmResign?'<button type="button" class="action-btn" data-duel-act="resign-cancel">やめる</button>':''}`}
 </div>`:''}
 ${r.game==='gomoku'?'<p class="duel-footnote">自由五目：縦・横・斜めで5個以上並べると勝ち。禁じ手はなし。先手は開始時に抽選。</p>':
 '<p class="duel-footnote">オセロ：黒が先手。置ける手がない場合は自動パス。終局時に石の多い方が勝ち。</p>'}
 </div>`;
 return section;
}
export function duelScreen({info,user,live,cash,selectedId,game='othello',stake=1000,target='',busy=false,error='',confirmResign=false,pokerPicks=[],nav=''}){
 const matches=info?.matches??[],chosen=matches.find(r=>r.id===selectedId)||matches.find(r=>r.status==='active'||r.status==='pending')||matches[0];
 const members=info?.members??[],invited=chosen?.status==='pending',mine=chosen?.user_a===user;
 return `<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">⚔️ 決闘</h1><div class="small-actions"><span class="badge">${kp(cash)}</span></div></div></header>
 <div class="duel-intro"><span>PLAYER vs PLAYER</span><h2>勝者、総取り。</h2><p>相手を指名し、双方が同額のKPを賭ける真剣勝負。勝てば賭け金の2倍を受け取り、引き分けなら返金される。</p></div>
 ${!live?'<div class="panel"><div class="card-body">本番KP口座に接続すると、決闘を利用できる。</div></div>':
 `<div class="duel-new panel"><div class="card-body">
 <h2 class="panel-title">決闘を申し込む</h2><div class="duel-formrow">
 <label>ゲーム<select id="duel-game" class="select"><option value="othello" ${game==='othello'?'selected':''}>⚫ オセロ</option><option value="gomoku" ${game==='gomoku'?'selected':''}>⚪ 五目並べ</option><option value="connect4" ${game==='connect4'?'selected':''}>🔴 四目並べ</option><option value="hitblow" ${game==='hitblow'?'selected':''}>🔢 Hit & Blow</option><option value="bluffdice" ${game==='bluffdice'?'selected':''}>🎲 ブラフダイス</option><option value="poker" ${game==='poker'?'selected':''}>🃏 5カードポーカー</option></select></label>
 <label>賭け金<select id="duel-stake" class="select">${[100,500,1000,5000,10000,50000,100000].map(n=>`<option value="${n}" ${n===stake?'selected':''}>${kp(n)} / 人</option>`).join('')}</select></label>
 </div><label>対戦相手<select id="duel-target" class="select"><option value="">挑戦相手を選ぶ</option>
 ${members.filter(m=>m.id!==user).map(m=>`<option value="${esc(m.id)}" ${m.id===target?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>
 <div class="duel-explainer"><strong>勝てば +${kp(stake)} / 負ければ −${kp(stake)}</strong><br>招待の段階ではKPは移動しない。相手が受諾した瞬間に双方から${kp(stake)}を預かる。</div>
 <button type="button" class="action-btn primary duel-full" data-duel-act="create" ${busy||!target||cash<stake?'disabled':''}>⚔️ この条件で挑戦する</button>
 </div></div>
 ${error?`<div class="storage-warning duel-error" role="alert">${esc(error)}</div>`:''}
 <div class="duel-history panel"><div class="card-body">
 <div class="duel-heading"><h2 class="panel-title">対戦ルーム</h2><button class="action-btn" data-duel-refresh="1" ${busy?'disabled':''}>更新 ↻</button></div>
 ${matches.length?matches.map(r=>summary(r,info,user)).join(''):'<p class="helper">まだ決闘はない。対戦相手を招待しよう。</p>'}
 </div></div>
 ${chosen?`<div class="duel-current">
 ${invited?`<div class="panel"><div class="card-body"><h2 class="panel-title">${mine?'招待を送信済み':'⚔️ 挑戦状が届いた'}</h2>
 <p class="helper">${esc(title(chosen))} / ${kp(chosen.stake)}ずつ。招待期限まで約${Math.ceil(timeLeft(chosen.deadline_at)/60)}分。</p>
 <div class="action-row">${!mine&&timeLeft(chosen.deadline_at)>0?`<button class="action-btn primary" data-duel-act="accept" ${busy?'disabled':''}>受けて立つ（${kp(chosen.stake)}）</button>`:''}
 <button class="action-btn" data-duel-act="cancel" ${busy?'disabled':''}>${mine?'招待を取り消す':'断る'}</button></div></div></div>`:''}
 ${chosen.status!=='pending'&&chosen.status!=='cancelled'?(Object.hasOwn(EXTRA_DUEL_GAMES,chosen.game)?miniBoardView(chosen,info,user,busy,pokerPicks,confirmResign):boardView(chosen,info,user,busy,confirmResign)):''}
 </div>`:''}
 <div class="panel"><div class="card-body"><h2 class="panel-title">決闘のルール</h2><p class="helper">1手10分制限。期限切れは時間切れ負けとなる。途中投了も負け。対戦が始まったら賭け金の取り消しはできない。勝者へ総額を一度だけ支給し、引き分けなら両者返金。遺物の補正・借KPでの賭け・CPU戦は対象外だ。</p></div></div>`}
 ${nav}</div>`;
}
