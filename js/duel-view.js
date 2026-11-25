import {duelPvePanel,duelOperationsPanel,duelTrioPanel,duelWeeklyEventPanel} from './duel-phase11-12-view.js?v=web-630e0735be90dea5';
import {miniBoardView} from './duel-mini-view.js?v=web-630e0735be90dea5';
import {EXTRA_DUEL_GAMES} from './duel-mini-games.js?v=web-630e0735be90dea5';
import {DUEL_GAMES,duelLegalMoves,duelScore,playDuelMove} from './duel-rules.js?v=web-630e0735be90dea5';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kp=n=>Number(n||0).toLocaleString('ja-JP')+' KP';
const title=(r)=>r.game==='trio'?'三目並べ':DUEL_GAMES[r.game]?.name||EXTRA_DUEL_GAMES[r.game]?.name||r.game;
const status=r=>r.status==='pending'?'招待中':r.status==='active'?'対局中':r.status==='finished'?'終了':'キャンセル';

export function spectatorBoardPreview(snapshot){
 const game=snapshot?.game,state=snapshot?.publicState;
 if(['othello','gomoku','connect4'].includes(game)){
  const n=game==='othello'?8:game==='gomoku'?15:7;
  const rows=game==='connect4'?6:n,board=state?.board;
  const alphabet=game==='connect4'?/^[.ab]{42}$/:game==='othello'?/^[.BW]{64}$/:/^[.BW]{225}$/;
  if(typeof board!=='string'||!alphabet.test(board))return '<p class="helper">公開盤面は確認できません。</p>';
  const pieces={'.':'·',B:'●',W:'○',a:'🔴',b:'🟡'};
  const cells=[...board].map((value,i)=>{
   const label=value==='.'?'空き':value==='B'?'黒':value==='W'?'白':value==='a'?'赤':'黄';
   return '<span role="gridcell" aria-label="'+(Math.floor(i/n)+1)+'行'+(i%n+1)+'列 '+label+'" class="duel-spectator-cell duel-spectator-'+esc(value)+'">'+pieces[value]+'</span>';
  }).join('');
  return '<div role="grid" aria-label="'+rows+'行'+n+'列の観戦用公開盤面" class="duel-spectator-grid" style="grid-template-columns:repeat('+n+',minmax(0,1fr))">'+cells+'</div>';
 }
 if(game==='poker')return '<p class="helper">手札とデッキは公開しない。結果の確定を待ってください。</p>';
 if(game==='bluffdice'){
  const bid=state?.bid;
  return bid&&Number.isSafeInteger(bid.count)&&Number.isSafeInteger(bid.face)
   ?'<p class="helper">公開された宣言：'+bid.count+'個の「'+bid.face+'」</p>'
   :'<p class="helper">公開された宣言はまだありません。</p>';
 }
 if(game==='hitblow'){
  const rows=Array.isArray(state?.history)?state.history.slice(-12):[];
  return rows.length?'<ol class="duel-spectator-history">'+rows.map(r=>
   '<li>'+esc(r.by)+'：'+esc(r.guess)+'　'+esc(r.hit)+'ヒット／'+esc(r.blow)+'ブロー</li>').join('')+'</ol>'
   :'<p class="helper">公開済みの予想履歴はありません。</p>';
 }
 return '<p class="helper">公開情報を表示できません。</p>';
}

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
function trioBoardView(r,info,user,busy,confirmResign){
 const myTurn=r.status==='active'&&r.turn_user===user;
 const canPlay=myTurn&&!busy&&timeLeft(r.deadline_at)>0;
 const mine=r.black_user===user?'X':'O';
 const tokens={X:'×',O:'○','.':'・'};
 const result=r.winner==='draw'?'引き分け：賭け金を返金':r.winner===user?'勝利：'+kp(r.stake*2)+' KP受取':r.winner?'敗北：賭け金を失いました':'';
 const cells=/^[.XO]{9}$/.test(r.board)?[...r.board]:[];
 return '<section class="panel"><div class="card-body"><h2>三目並べ・認証済み対人戦</h2>'+
 '<p class="helper">あなたは'+tokens[mine]+'。サーバーが着手・勝敗・KPを確定する。先に3つ並べた側が勝利する。</p>'+
 '<p role="status">'+(r.status==='finished'?esc(result):canPlay?'あなたの手番':'相手の着手を待っています')+'</p>'+
 '<div role="grid" aria-label="三目並べ・対人戦盤面" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));max-width:300px;gap:6px">'+
 cells.map((v,i)=>'<button type="button" role="gridcell" class="action-btn" style="min-height:72px;font-size:30px" data-duel-cell="'+i+'" aria-label="'+(Math.floor(i/3)+1)+'行'+(i%3+1)+'列 '+(v==='.'?'空き':tokens[v])+'" '+(!canPlay||v!=='.'?'disabled':'')+'>'+tokens[v]+'</button>').join('')+'</div>'+
 (r.status==='active'?
 '<p class="helper">手番期限まで約'+Math.ceil(timeLeft(r.deadline_at)/60)+'分</p>'+
 (timeLeft(r.deadline_at)===0?'<button class="action-btn" data-duel-act="timeout" '+(busy?'disabled':'')+'>時間切れを確定</button>':
 '<button class="action-btn" data-duel-act="'+(confirmResign?'resign':'resign-preview')+'" '+(busy?'disabled':'')+'>'+(confirmResign?'投了を確定':'投了する')+'</button>'+
 (confirmResign?'<button class="action-btn" data-duel-act="resign-cancel">取り消す</button>':'')):'')+
 '</div></section>';
}

function boardView(r,info,user,busy,confirmResign,gomokuPreviewCell=null,recentMove=null,localHistory=[]){
 const ownBlack=r.black_user===user,own=r.user_a===user||r.user_b===user;
 const black=r.black_user===r.user_a?r.user_a:r.user_b;
 const white=black===r.user_a?r.user_b:r.user_a;
 const name=id=>info.members.find(m=>m.id===id)?.name||'参加者';
 const size=DUEL_GAMES[r.game]?.size??8,turn=r.status==='active'&&r.turn_user===user;
 const color=ownBlack?'B':'W',canPlay=turn&&own&&!busy&&timeLeft(r.deadline_at)>0;
 let legal=[];
 try{if(canPlay)legal=duelLegalMoves(r.game,r.board,color);}catch{}
 const playable=new Set(legal);
 const previewValid=r.game==='gomoku'&&Number.isSafeInteger(gomokuPreviewCell)&&playable.has(gomokuPreviewCell);
 const previewRow=previewValid?Math.floor(gomokuPreviewCell/size)+1:0;
 const previewCol=previewValid?gomokuPreviewCell%size+1:0;
 const gomokuTools=r.game==='gomoku'? `<div class="duel-gomoku-tools" role="group" aria-label="五目並べの着手">
 <p class="duel-gomoku-help">指で上下左右に移動できる15×15の盤面。マスを選んでから着手を確定する。拡大しても着手位置は変わらない。</p>
 <div class="duel-gomoku-zoom" role="group" aria-label="五目並べの盤面拡大と移動">
   <button type="button" data-gomoku-zoom-action="out" aria-label="盤面を縮小" disabled>−</button>
   <output data-gomoku-zoom-label="1" aria-live="off">100%</output>
   <button type="button" data-gomoku-zoom-action="in" aria-label="盤面を拡大">＋</button>
   <button type="button" data-gomoku-zoom-action="center" aria-label="盤面の中央を表示">中央へ</button>
 </div>
 <p class="duel-gomoku-last-status" data-gomoku-last-status="1" aria-live="polite">この端末で観測した直前の確定手を強調表示する。</p>
 <div class="duel-gomoku-selection" role="status" aria-live="polite">
 ${previewValid?`<span><strong>${previewRow}行 ${previewCol}列</strong> を選択中</span><div class="duel-gomoku-confirm-actions"><button type="button" class="action-btn primary" data-duel-confirm-cell="${gomokuPreviewCell}" ${busy?'disabled':''}>ここに置く</button><button type="button" class="action-btn" data-duel-cancel-cell="1">取り消す</button></div>`:
 `<span>${canPlay?'置きたいマスをタップして選択':'相手の手番または対局終了まで待機'}</span>`}
 </div></div>`:'';
 const score=duelScore(r.board);
 // A UI-only capture preview. Each count comes from the same pure move rule
 // used by the Worker; it never commits a move or predicts an outcome.
 const captureCounts=new Map();
 if(r.game==='othello'&&canPlay)for(const index of legal){
  const hypothetical=playDuelMove('othello',r.board,color,index).board;
  const changed=[...hypothetical].reduce((n,cell,i)=>n+(r.board[i]!=='.'&&r.board[i]!==cell?1:0),0);
  captureCounts.set(index,changed);
 }
 const scorebar=r.game==='othello'? `<div class="duel-othello-dashboard">
 <div class="duel-othello-scorebar" role="img" aria-label="黒 ${score.B}枚、白 ${score.W}枚、空き ${64-score.B-score.W}マス">
 <span class="duel-score-black" style="width:${score.B/64*100}%"></span>
 <span class="duel-score-empty" style="width:${(64-score.B-score.W)/64*100}%"></span>
 <span class="duel-score-white" style="width:${score.W/64*100}%"></span>
 </div>
 <p class="duel-othello-coach">${canPlay?`置ける場所 ${legal.length}か所。丸の数字はひっくり返せる石の数。`:r.status==='finished'?'対局終了。確定した石数と勝敗を表示している。':'黒と白の石数を表示中。相手の着手を待とう。'}</p>
 </div>`:'';
 const result=r.winner==='draw'?'引き分け：賭け金を返金':r.winner===user?'勝利：受取 '+kp(r.stake*2)+'（差引 +'+kp(r.stake)+'）':r.winner?'敗北：差引 −'+kp(r.stake):'';
 const expired=timeLeft(r.deadline_at)===0;
 const section=`<div class="duel-arena">
 <div class="duel-arena-head"><div><span class="duel-tag">${esc(title(r))}</span><strong>${kp(r.stake)} × 2</strong></div>
 <span class="duel-state">${esc(status(r))}</span></div>
 <div class="duel-players"><span><b class="duel-token black">●</b>${esc(name(black))}</span><span>VS</span><span><b class="duel-token white">●</b>${esc(name(white))}</span></div>
 ${r.status==='active'?`<div class="duel-turn ${turn?'my-turn':''}">${turn?'🟢 あなたの番':esc(name(r.turn_user))+'の番'}　<span data-duel-timer="${r.deadline_at}">残り${Math.ceil(timeLeft(r.deadline_at)/60)}分</span></div>`:''}
 ${gomokuTools}
 ${r.game==='gomoku'?`<div class="duel-board-scroll" data-duel-board-scroll="${esc(r.id)}" tabindex="0" role="region" aria-label="五目並べの拡大盤面。指で上下左右に移動できる">`:''}
 <div class="duel-board ${r.game==='gomoku'?'duel-gomoku':'duel-othello'}" role="grid" aria-label="${esc(title(r))}の盤面" data-othello-playing="${r.game==='othello'&&canPlay?color:'' }" ${r.game==='gomoku'?`data-gomoku-match="${esc(r.id)}" data-gomoku-version="${Number(r.version)||0}"`:''} style="--duel-size:${size}">
 ${[...r.board].map((cell,i)=>{
   const active=canPlay&&playable.has(i);
   const classes=[cell==='B'?'black':cell==='W'?'white':'empty',active?'available':'',previewValid&&i===gomokuPreviewCell?'duel-preview-cell':'',recentMove?.version===r.version&&recentMove?.cell===i?'duel-last-cell':''].join(' ');
   const captures=r.game==='othello'&&active?captureCounts.get(i):null;
   return `<button type="button" class="duel-square ${classes}" role="gridcell" data-duel-cell="${i}" title="${Math.floor(i/size)+1}行${i%size+1}列" aria-label="${Math.floor(i/size)+1}行${i%size+1}列 ${cell==='B'?'黒':cell==='W'?'白':previewValid&&i===gomokuPreviewCell?'選択中':active?'着手可能':'空き'}${captures?`、${captures}枚返せる`:''}" ${r.game==='gomoku'&&active?`aria-pressed="${previewValid&&i===gomokuPreviewCell}"`:''} ${active?'':'disabled'}><span class="duel-piece"></span>${captures?`<span class="duel-capture-count" aria-hidden="true">${captures}</span>`:''}</button>`;
 }).join('')}</div>
 ${r.game==='gomoku'?'</div>':''}
 ${scorebar}
 <div class="duel-counts"><span>⚫ 黒 ${score.B}</span><span>⚪ 白 ${score.W}</span></div>
  ${recentMove?.version===r.version?`<p class="duel-footnote">この端末で確認した直前の着手：${Math.floor(recentMove.cell/size)+1}行 ${recentMove.cell%size+1}列（盤面で強調表示）</p>`:''}
  ${localHistory.length?`<details class="duel-move-history"><summary>この端末で確認した着手履歴（最新${localHistory.length}手）</summary><ol>${localHistory.slice().reverse().map(x=>`<li>${x.color==='B'?'黒':'白'}：${Math.floor(x.cell/size)+1}行${x.cell%size+1}列</li>`).join('')}</ol><small>オフライン中の着手など、確認できなかった手は含めない。</small></details>`:''}
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
/** Three explicit choices and verified progression. No invented ranks. */
export function duelEntryPanel({info=null,user='',live=false,progress=null,busy=false,error='',delta=null}={}){
 const matches=Array.isArray(info?.matches)?info.matches:[];
 const self=matches.filter(m=>m.user_a===user||m.user_b===user);
 const active=self.filter(m=>m.status==='active').length;
 const invited=self.filter(m=>m.status==='pending').length;
 const points=mode=>progress&&Array.isArray(progress.skills)
  ?progress.skills.filter(r=>r.mode===mode).reduce((a,r)=>({
   points:a.points+Math.max(0,Number(r.points)||0),
   verified:a.verified+Math.max(0,Number(r.verified_games)||0),
   wins:a.wins+Math.max(0,Number(r.wins)||0)
  }),{points:0,verified:0,wins:0}):null;
 const format=(mode,row)=>{
  if(!live)return 'KP口座を接続すると熟練度を表示';
  if(!row)return busy?'熟練度を確認中…':error?'熟練度を取得できません':'熟練度は未取得';
  return '熟練度 '+row.points+'pt'+
    (delta&&Number.isFinite(delta[mode])?'（前回比 '+(delta[mode]>0?'+':'')+delta[mode]+'pt）':'')+
    ' ／ 確定'+row.verified+'戦・'+row.wins+'勝';
 };
 const today=progress?.today;
 const count=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
 const items=[
  ['pve','🤖','PvE','サーバーCPU攻略・今日のチャレンジ',
   today?'今日 '+count(today.finished)+'回完了・'+count(today.wins)+'勝':busy?'チャレンジ状況を取得中…':'今日の進捗は未取得',
   format('pve',points('pve'))],
  ['pvp','⚔️','PvP','招待して対戦・相手の招待を承諾',
   '対局中 '+active+'件 ／ 招待 '+invited+'件',format('pvp',points('pvp'))],
  ['practice','🎯','練習','無料でCPUと遊ぶ','KP・報酬の消費なし',
   '熟練度・ランクは変わらない／戦績は保存しない']
 ];
 return '<main id="duel-entry-home" class="duel-entry" aria-label="決闘のモード選択">'+
 '<div class="duel-entry-lead"><h2>今日は何をする？</h2><p>3つのモードから選んで始めよう。</p></div>'+
 items.map(([id,icon,name,desc,state,detail])=>'<button type="button" class="duel-entry-card" data-duel-entry="'+id+'"'+
 ' aria-label="'+esc(name)+'：'+esc(desc)+'"><span class="duel-entry-icon" aria-hidden="true">'+icon+'</span>'+
 '<span class="duel-entry-body"><strong>'+name+'</strong><span class="duel-entry-desc">'+esc(desc)+'</span>'+
 '<span class="duel-entry-state">'+esc(state)+'</span><span class="duel-entry-progress">'+esc(detail)+'</span></span>'+
 '<span class="duel-entry-chevron" aria-hidden="true">›</span></button>').join('')+
 '<p class="duel-entry-footnote">公式ランク・順位は一般向け未提供のため表示しない。熟練度と確定試合はサーバー取得値。前回比はこの画面で前回取得した時点との差である。</p>'+
 (error?'<p role="alert">'+esc(error)+'</p>':'')+
 ''+
 '</main>';
}
const sportsGames=[['trio','❎','三目並べ'],['othello','⚫','オセロ'],['gomoku','⚪','五目並べ'],['connect4','🔴','四目並べ'],['hitblow','🔢','ヒット＆ブロー'],['bluffdice','🎲','ブラフダイス'],['poker','🃏','５カードポーカー']];
/** Each skill is confirmed by the authenticated history API; never infer points from local games. */
export function duelSportPicker({mode='pve',progress=null,selected='othello',practice=false}={}){
 const loaded=Array.isArray(progress?.skills);
 const games=practice?sportsGames.filter(([id])=>id!=='trio'):sportsGames;
 return '<section class="duel-sports" aria-label="'+(practice?'練習':mode==='pve'?'CPU攻略':'対人戦')+'の種目選択">'+
 '<div class="duel-sports-heading"><h3>種目を選ぶ</h3><span>熟練度は種目ごとの確定値</span></div>'+
 '<div class="duel-sports-grid">'+games.map(([id,emoji,label])=>{
 const skill=loaded?progress.skills.find(s=>s.mode===mode&&s.game===id):null;
 const points=loaded?Math.max(0,Number(skill?.points)||0)+' pt':'未取得';
 const picked=id===selected;
 const action=practice?'data-duel-practice-game="'+id+'"':'data-duel-sport="'+id+'" data-duel-sport-mode="'+mode+'"';
 return '<button type="button" class="duel-sport-tile'+(picked&&!practice?' is-selected':'')+'" '+action+
 ' aria-pressed="'+(picked&&!practice)+'" aria-label="'+esc(label)+' 熟練度 '+(practice?'記録対象外':esc(points))+'">'+
 '<span class="duel-sport-emoji" aria-hidden="true">'+emoji+'</span><span class="duel-sport-name">'+esc(label)+'</span>'+
 '<span class="duel-sport-points">'+(practice?'練習専用':loaded?'熟練度 '+esc(points):'熟練度 未取得')+'</span>'+
 '<span class="duel-sport-hint">'+(practice?'選んで練習へ':picked?'選択中 ✓':'この種目を選ぶ')+'</span></button>';
 }).join('')+'</div>'+
 (mode==='pvp'&&!practice?'<p class="duel-sports-note">対戦する種目を選び、下の相手と賭け金を確認して申し込む。</p>':'')+
 (!loaded&&!practice?'<p class="duel-sports-note">熟練度は本人の記録を取得できたときだけ表示する。</p>':'')+'</section>';
}
export function duelScreen({info,user,live,cash,selectedId,game='othello',stake=1000,target='',busy=false,error='',confirmResign=false,pokerPicks=[],fallbackMembers=[],opponentPickerOpen=false,loading=false,nav='',gomokuPreviewCell=null,recentMoves=null,localMoveHistory=null,guessDraft='',riskConfirm='',lastSynced=0,pendingRetry=false,historyHasMore=false,participantPreview=null,participantPreviewError='',spectatorUi=null,pveUi=null,operationsUi=null,trioUi=null,seasonUi=null,eventUi=null,tabs='',mode='pvp',entryProgress=null,entryProgressBusy=false,entryProgressError='',entryProgressDelta=null}){
 const matches=info?.matches??[],chosen=matches.find(r=>r.id===selectedId)||matches.find(r=>r.status==='active'||r.status==='pending')||matches[0];
 const members=(info?.members?.length?info.members:fallbackMembers).filter(m=>m&&typeof m.id==='string'&&m.id!==user);
 const invited=chosen?.status==='pending',mine=chosen?.user_a===user;
 const selectedMember=members.find(m=>m.id===target);
  const guides={trio:'3×3の盤面で縦・横・斜めに3つ並べる。先手Xはランダム。',othello:'相手の石を挟んで返す。置ける場所がない場合は自動パス。',gomoku:'縦・横・斜めに5個以上並べる。着手は選択後に確定。',connect4:'列を選んで駒を落とし、縦・横・斜めに4個並べる。',hitblow:'異なる数字4桁を推理する。40手で引き分け。',bluffdice:'5個ずつのダイスで宣言か疑いを選び、先に2ラウンド勝つ。',poker:'5枚のうち0〜3枚を1回交換する。強い役が勝ち。'};
  const completed=matches.filter(r=>r.status==='finished'&&r.winner);
  const stats=completed.reduce((a,r)=>(a[r.winner===user?'win':r.winner==='draw'?'draw':'lose']++,a),{win:0,draw:0,lose:0});
  const vsMatches=target?completed.filter(r=>r.user_a===target||r.user_b===target):[];
  const vs=vsMatches.reduce((a,r)=>(a[r.winner===user?'win':r.winner==='draw'?'draw':'lose']++,a),{win:0,draw:0,lose:0});
 info={...info,members:[...(info?.members??[]),...members.filter(m=>!(info?.members??[]).some(x=>x.id===m.id))]};
 const header='<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">⚔️ 決闘</h1><div class="small-actions"><span class="badge">'+kp(cash)+'</span></div></div></header>'+tabs;
 const back='<button type="button" class="action-btn duel-entry-back" data-duel-entry-back="1">‹ 3つのモードに戻る</button>';
 if(mode==='home')return header+duelEntryPanel({info,user,live,progress:entryProgress,busy:entryProgressBusy,error:entryProgressError,delta:entryProgressDelta})+nav+'</div>';
 if(mode==='pve')return header+back+
  '<section class="duel-mode-header"><h2>🤖 PvE・CPU攻略</h2><p>今日のチャレンジか好きな種目を選んで始めよう。</p></section>'+
  duelWeeklyEventPanel(eventUi)+duelSportPicker({mode:'pve',progress:entryProgress,selected:pveUi?.game})+duelPvePanel({...pveUi,live,open:true})+
  '<details class="panel duel-secondary"><summary>報酬・詳しい戦績</summary><div class="card-body"><p class="helper">確定済みの履歴は「7種目の対局履歴・熟練度を見る」から確認できる。</p>'+
  '<button type="button" class="action-btn" data-duel-pve-rewards="1">報酬・戦績を取得</button></div></details>'+nav+'</div>';
 if(mode==='practice')return header+back+
  '<section class="duel-mode-header"><h2>🎯 練習</h2><p>実KP・熟練度・ランクに影響しない無料CPU対戦。</p></section>'+
  duelSportPicker({mode:'pve',progress:entryProgress,practice:true})+'<div class="duel-practice-entry"><div><strong>無料CPU練習（6種目）</strong><p>何度でも遊べる。実KP消費なし。</p></div>'+
  '<a class="action-btn primary" href="./duel-demo.html?cpu=1">CPU練習を始める</a></div>'+
  duelTrioPanel(trioUi??{})+nav+'</div>';
 const focus=chosen?.status==='active'||chosen?.status==='pending';
 const formMarkup=`<div class="duel-new panel"><div class="card-body">
 <h2 class="panel-title">対戦を申し込む</h2><div class="duel-formrow">
 <label>ゲーム<select id="duel-game" class="select"><option value="trio" ${game==='trio'?'selected':''}>❎ 三目並べ</option><option value="othello" ${game==='othello'?'selected':''}>⚫ オセロ</option><option value="gomoku" ${game==='gomoku'?'selected':''}>⚪ 五目並べ</option><option value="connect4" ${game==='connect4'?'selected':''}>🔴 四目並べ</option><option value="hitblow" ${game==='hitblow'?'selected':''}>🔢 Hit & Blow</option><option value="bluffdice" ${game==='bluffdice'?'selected':''}>🎲 ブラフダイス</option><option value="poker" ${game==='poker'?'selected':''}>🃏 5カードポーカー</option></select></label>
 <label>賭け金<select id="duel-stake" class="select">${[100,500,1000,5000,10000,50000,100000].map(n=>`<option value="${n}" ${n===stake?'selected':''}>${kp(n)} / 人</option>`).join('')}</select></label>
 </div><p class="duel-mode-guide">${esc(guides[game]??'')}</p><div class="duel-opponent-field"><span class="duel-opponent-label">対戦相手</span>
 <button type="button" class="duel-opponent-toggle" data-duel-target-toggle="1" aria-expanded="${opponentPickerOpen}" aria-controls="duel-opponent-list">
 <span>${selectedMember?esc(selectedMember.name):members.length?'相手を選択':'対戦相手を読み込み中'}</span><span aria-hidden="true">▾</span></button>
 ${opponentPickerOpen&&members.length?`<div class="duel-opponent-list" id="duel-opponent-list" role="group" aria-label="対戦相手一覧">
 ${members.map(m=>`<button type="button" class="duel-opponent-choice ${m.id===target?'selected':''}" data-duel-target-option="${esc(m.id)}" aria-pressed="${m.id===target}">${esc(m.name)}${m.id===target?' ✓':''}</button>`).join('')}</div>`:''}
 ${!members.length?`<p class="duel-opponent-help" role="status">${error?'対戦相手を取得できません。画面を更新してください。':loading?'対戦相手を確認しています':'対戦相手が表示されません。右下の「更新」を押してください。'}</p>`:''}
 ${vsMatches.length?`<p class="duel-opponent-help">この相手との直近の対戦：${vs.win}勝 ${vs.lose}敗 ${vs.draw}分（表示履歴内）</p>`:''}
  ${!info?.members?.length&&members.length?'<p class="duel-opponent-help">口座に登録されたメンバーを表示しています</p>':''}
 ${error?'<p class="duel-opponent-help" role="alert">'+esc(error)+'</p>':''}
 </div>
 <div class="duel-explainer"><strong>勝てば +${kp(stake)} / 負ければ −${kp(stake)}</strong><br>申し込み時にはKPは減らない。相手が承認すると双方から${kp(stake)}ずつ引かれる。</div>
 ${stake>=50000&&riskConfirm==='create'?'<p class="duel-risk-note" role="alert">高額対戦の確認：相手と金額を確認し、もう一度押すと申し込みます。</p>':''}
  <button type="button" class="action-btn primary duel-full" data-duel-act="create" ${busy||!target||cash<stake?'disabled':''}>${stake>=50000&&riskConfirm==='create'?'確認して申し込む':'対戦を申し込む'}</button>
 </div></div>`;

 const spectatorMatch=spectatorUi?.matchId??chosen?.id??'';
 const spectatorMatches=Array.isArray(spectatorUi?.matches)?spectatorUi.matches:[];
 const spectatorRows=spectatorMatches.map(m=>
  '<button type="button" class="duel-match" data-duel-spectator-select="'+esc(m.id)+'">'+
  '<span><strong>'+esc(title(m))+'</strong><small>'+
  (m.status==='active'?'対局中':'終了')+' · 更新番号 '+esc(m.version)+'</small></span>'+
  '<span class="duel-purse">観戦する</span></button>'
 ).join('');
 const spectatorPanel=live?'<details class="panel duel-spectator-controls"><summary>🔭 メンバーの試合を観戦</summary><div class="card-body">'+
  '<p class="helper">登録済みの本アカウントだけが観戦可能。サブアカウントは不可。対戦者の同意は不要。対局の秘密情報・KPは公開しない。</p>'+
  '<button type="button" class="action-btn" data-duel-spectator-lobby="1" '+
  (spectatorUi?.loading?'disabled':'')+'>観戦できる試合を探す</button>'+
  (spectatorUi?.loading?'<p class="helper">確認中…</p>':'')+
  (spectatorMatches.length?'<div class="duel-history" role="group" aria-label="観戦可能な試合一覧">'+spectatorRows+'</div>':
   spectatorUi?.loaded?'<p class="helper">今は観戦可能な試合がありません。</p>':'')+
  '<label class="helper" for="duel-spectator-match">観戦する試合のID（一覧から選択も可能）</label>'+
  '<input id="duel-spectator-match" class="action-input" autocomplete="off" maxlength="36" value="'+esc(spectatorMatch)+'" placeholder="試合ID">'+
  '<div class="action-row"><button type="button" class="action-btn primary" data-duel-spectator-watch="1">'+
  (spectatorUi?.watching?'観戦情報を更新':'この試合を観戦')+'</button>'+
  '<button type="button" class="action-btn" data-duel-spectator-stop="1">観戦を終了</button></div>'+
  '<button type="button" class="action-btn" data-duel-spectator-sound="1" aria-pressed="'+
   Boolean(spectatorUi?.sound)+'">🔊 読み上げ '+(spectatorUi?.sound?'オン':'オフ')+'</button>'+
  (spectatorUi?.message?'<p role="status" class="helper">'+esc(spectatorUi.message)+'</p>':'')+
  (spectatorUi?.error?'<p role="alert">'+esc(spectatorUi.error)+'</p>':'')+
  (spectatorUi?.snapshot?'<div role="region" aria-label="サーバー確定の観戦情報">'+
   '<p>ゲーム：'+esc(title(spectatorUi.snapshot))+' ／ 状態：'+(spectatorUi.snapshot.status==='active'?'対局中':'終了')+
   ' ／ 更新番号：'+esc(spectatorUi.snapshot.version)+'</p>'+
   spectatorBoardPreview(spectatorUi.snapshot)+'</div>':'')+
  '<p class="helper">リアルタイム通知が届けば即更新。通信非対応時は定期取得に切替。音声は端末の設定・再生許可に従う。</p>'+
  '</div></details>':'';
 const syncNotice=live?'<div class="duel-sync" role="status" aria-live="polite">対戦情報：'+(lastSynced?'最終更新 '+new Date(lastSynced).toLocaleTimeString('ja-JP'):'確認中')+(loading?'・更新中':'')+'。<button type="button" class="action-btn" data-duel-refresh="1" '+(busy?'disabled':'')+'>更新</button></div>':'';
 const retryNotice=pendingRetry?'<div class="storage-warning duel-error" role="alert"><strong>前回の対戦操作が未確認です。</strong><p>別の操作は送らず、同じ操作IDを使って結果を確認してください。</p><button type="button" class="action-btn primary" data-duel-retry="1" '+(busy?'disabled':'')+'>前回の操作を確認</button></div>':'';
 const moreNotice=historyHasMore?'<div class="duel-history-more"><button type="button" class="action-btn" data-duel-history-more="1" '+(busy?'disabled':'')+'>過去の対戦を20件ずつ読み込む</button><p class="helper">このボタンを押した場合だけ過去の対戦を取得する。</p></div>':'';
 return `<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">⚔️ 決闘</h1><div class="small-actions"><span class="badge">${kp(cash)}</span></div></div></header>
 ${tabs}
 <button type="button" class="action-btn duel-entry-back" data-duel-entry-back="1">‹ 3つのモードに戻る</button><section class="duel-mode-header"><h2>⚔️ PvP・対人戦</h2><p>招待を承諾するか、相手を選んで申し込む。</p></section>

 ${duelSportPicker({mode:'pvp',progress:entryProgress,selected:game})}${syncNotice}${retryNotice}
 ${chosen?`<div class="duel-current">
 <div class="panel"><div class="card-body"><h2 class="panel-title">参加者限定・公開情報プレビュー</h2>
 <p class="helper">対戦者本人の確認用プレビュー。登録済みの本アカウントは同じギルド内の試合を追加同意なしで観戦できます。サブアカウントは観戦できません。</p>
 <button type="button" class="action-btn" data-duel-preview="1" ${busy||!live?'disabled':''}>公開情報を手動で確認</button>
 ${participantPreviewError?'<p role="alert">'+esc(participantPreviewError)+'</p>':''}
 ${participantPreview&&participantPreview.id===chosen.id?'<pre aria-label="試合の公開情報">'+esc(JSON.stringify(participantPreview.publicState??null,null,2))+'</pre><p class="helper">確認した版：'+esc(participantPreview.version)+'</p>':''}
 </div></div>
 ${invited?`<div class="panel"><div class="card-body"><h2 class="panel-title">${mine?'相手の返答待ち':'対戦の申し込み'}</h2>
 <p class="helper">${esc(title(chosen))} / ${kp(chosen.stake)}ずつ。招待期限まで約${Math.ceil(timeLeft(chosen.deadline_at)/60)}分。</p>
 <div class="action-row">${!mine&&timeLeft(chosen.deadline_at)>0?`<button class="action-btn primary" data-duel-act="accept" ${busy?'disabled':''}>${chosen.stake>=50000&&riskConfirm==='accept'?'金額を確認して承認':'承認して始める'}（${kp(chosen.stake)}）</button>`:''}
 <button class="action-btn" data-duel-act="cancel" ${busy?'disabled':''}>${mine?'招待を取り消す':'断る'}</button></div></div></div>`:''}
 ${chosen.status!=='pending'&&chosen.status!=='cancelled'?(chosen.game==='trio'?trioBoardView(chosen,info,user,busy,confirmResign):Object.hasOwn(EXTRA_DUEL_GAMES,chosen.game)?miniBoardView(chosen,info,user,busy,pokerPicks,confirmResign,guessDraft):boardView(chosen,info,user,busy,confirmResign,gomokuPreviewCell,recentMoves?.get(chosen.id),localMoveHistory?.get(chosen.id)??[])):''}
 ${chosen?.status==='finished'&&live&&(chosen.user_a===user||chosen.user_b===user)?`<div class="duel-rematch panel"><div class="card-body"><button type="button" class="action-btn primary" data-duel-rematch="${esc(chosen.id)}" ${busy?'disabled':''}>同じ相手・同じ金額で再戦を準備</button><p class="helper">申し込み内容を確認して送信すると、相手の承認後に新しい対戦が始まる。自動でKPは賭けられない。</p></div></div>`:''}
 </div>`:''}
 ${!chosen?'<div class="duel-intro"><span>対人ゲーム</span><h2>KPを賭けて対戦</h2><p>ゲームと対戦相手、賭け金を選んで申し込む。相手が承認すると対戦が始まり、勝った人が双方の賭け金を受け取る。引き分けは返金。</p></div>':''}
 ${error?`<div class="storage-warning duel-error" role="alert">${esc(error)}</div>`:''}
 ${focus?` <div class="duel-history panel"><div class="card-body">
 <div class="duel-heading"><h2 class="panel-title">対戦ルーム</h2><small>最近の戦績：${stats.win}勝 ${stats.lose}敗 ${stats.draw}分（読み込み済み${matches.length}件内）</small><button class="action-btn" data-duel-refresh="1" ${busy?'disabled':''}>更新 ↻</button></div>
 ${matches.length?matches.map(r=>summary(r,info,user)).join(''):'<p class="helper">対戦履歴はまだありません。</p>'}
 </div></div>`:''}
 ${moreNotice}
 ${spectatorPanel}
 ${!live?'<div class="panel"><div class="card-body">KP口座に接続すると対戦できる。</div></div>':focus?
 `<details class="duel-create-collapse"><summary>別の対戦を申し込む</summary>${formMarkup}</details>`:formMarkup}
 ${!focus?` <div class="duel-history panel"><div class="card-body">
 <div class="duel-heading"><h2 class="panel-title">対戦ルーム</h2><button class="action-btn" data-duel-refresh="1" ${busy?'disabled':''}>更新 ↻</button></div>
 ${matches.length?matches.map(r=>summary(r,info,user)).join(''):'<p class="helper">対戦履歴はまだありません。</p>'}
 </div></div>`:''}
 ${live?`<div class="panel"><div class="card-body"><h2 class="panel-title">対戦ルール</h2><p class="helper">1手の制限時間は10分。制限時間を過ぎた場合と投了した場合は負けになる。対戦開始後は賭け金を取り消せない。引き分けでは双方に賭け金を返金する。遺物の補正や借KPは使えない。CPU練習は別画面で遊べる。CPU戦のKPは練習用で、本番の残高には反映しない。</p></div></div>`:''}
 ${duelOperationsPanel(operationsUi??{})}
 ${nav}</div>`;
}
