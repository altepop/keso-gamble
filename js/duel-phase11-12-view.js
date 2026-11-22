/** UI-only rendering for authenticated, server-authoritative six-mode CPU duels.
 * The browser cannot choose the daily game/level or award KP.
 */
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={othello:'オセロ',gomoku:'五目並べ',connect4:'四目並べ',hitblow:'ヒット＆ブロー',bluffdice:'ブラフダイス',poker:'５カードポーカー'};
const resultName={human:'勝利',cpu:'敗北',draw:'引き分け'};
function controls(match,busy){
 const board=String(match.board??''),game=match.game,can=match.turn==='human'&&!busy;
 if(['othello','gomoku','connect4'].includes(game)){
  const columns=game==='connect4'?7:game==='othello'?8:15;
  if(!new RegExp('^[.BWab]{'+(game==='connect4'?42:columns*columns)+'}$').test(board))
   return '<p role="alert">盤面の形式を確認できません。再取得してください。</p>';
  const pieces={B:'●',W:'○',a:'●',b:'○','.':'·'};
  const playable=game==='connect4'?Array.from({length:7},(_,i)=>i):[...board].flatMap((v,i)=>v==='.'?[i]:[]);
  const cells=game==='connect4'?Array.from({length:7},(_,i)=>'<button class="action-btn" data-duel-pve-cell="'+i+'" '+(!can||board[i]!=='.'?'disabled':'')+'>'+(i+1)+'列</button>').join(''):
   [...board].map((v,i)=>'<button type="button" data-duel-pve-cell="'+i+'" '+(!can||v!=='.'?'disabled':'')+' aria-label="'+(Math.floor(i/columns)+1)+'行'+(i%columns+1)+'列" style="min-height:27px;padding:1px;font-size:14px">'+pieces[v]+'</button>').join('');
  return '<div style="display:grid;grid-template-columns:repeat('+columns+',minmax(0,1fr));gap:2px" role="group" aria-label="CPU戦盤面">'+cells+'</div>';
 }
 const pub=(()=>{try{return JSON.parse(board)}catch{return null}})();
 if(!pub||typeof pub!=='object')return '<p role="alert">盤面の形式を確認できません。</p>';
 const hand=Array.isArray(match.ownHand?.value)?match.ownHand.value:null;
 if(game==='hitblow')return '<p class="helper">重複しない数字４桁を推理。履歴：'+safe(Array.isArray(pub.history)?pub.history.map(h=>h.by+':'+h.guess+' '+h.hit+'H'+h.blow+'B').slice(-8).join(' ／ '):'')+'</p><label>４桁<input id="duel-pve-guess" class="action-input" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="0123"></label><button class="action-btn primary" data-duel-pve-move="guess" '+(!can?'disabled':'')+'>推理を確定</button>';
 if(game==='bluffdice')return '<p class="helper">自分のダイス：'+safe(hand?.join(' / ')??'未取得')+' ／ 宣言：'+safe(pub.bid?pub.bid.count+'個・'+pub.bid.face+'の目':'まだなし')+'</p><label>個数<select id="duel-pve-count">'+Array.from({length:10},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'</option>').join('')+'</select></label><label>目<select id="duel-pve-face">'+Array.from({length:6},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'</option>').join('')+'</select></label><button class="action-btn primary" data-duel-pve-move="bid" '+(!can?'disabled':'')+'>宣言する</button><button class="action-btn" data-duel-pve-move="challenge" '+(!can||!pub.bid||pub.bid.by==='a'?'disabled':'')+'>疑う</button>';
 if(game==='poker')return '<p class="helper">自分の５枚（カード番号）：'+safe(hand?.join(' / ')??'未取得')+'</p><p class="helper">交換するカードを最大３枚選ぶ。０枚でも確定できる。</p><div class="action-row">'+Array.from({length:5},(_,i)=>'<label><input type="checkbox" data-duel-pve-poker="'+i+'" '+(!can?'disabled':'')+'> '+(i+1)+'枚目</label>').join('')+'</div><button class="action-btn primary" data-duel-pve-move="poker" '+(!can?'disabled':'')+'>交換を確定</button>';
 return '<p>このゲームの操作画面は未対応です。</p>';
}
export function duelPvePanel({live=false,busy=false,preview=null,match=null,error='',message='',sessionInput='',pending=null}={}){
 const active=match&&typeof match.id==='string';
 const expanded=active||preview||error||message;
 return '<details class="panel" id="duel-pve-section" '+(active?'open':'')+'><summary>🗓️ 今日のCPUチャレンジ（サーバー対戦）</summary><div class="card-body">'+
 '<p class="helper">６種目を日替わりで挑戦。KP残高を賭けず、実戦用のサーバー判定で進行する。既存のPvE報酬規則のみ適用され、日替わり特別KPはない。</p>'+
 (!live?'<p>KP口座への接続が必要です。</p>':
 '<div class="action-row"><button class="action-btn" data-duel-pve-preview="1" '+(busy?'disabled':'')+'>今日の種目を確認</button>'+
 '<button class="action-btn primary" data-duel-pve-start="1" '+(busy||pending?'disabled':'')+'>今日のCPU戦を開始</button></div>'+
 (preview?'<p class="helper">本日 '+safe(preview.day)+'：'+safe(names[preview.game]??preview.game)+' ／ '+safe(preview.level)+'</p>':'')+
 '<label class="helper">途中のCPU戦を再開（試合ID）<input id="duel-pve-session-input" class="action-input" maxlength="36" placeholder="試合ID" value="'+safe(sessionInput)+'"></label><button class="action-btn" data-duel-pve-resume="1" '+(busy?'disabled':'')+'>再開</button>'+
 (error?'<p role="alert">'+safe(error)+'</p>':'')+(pending?'<p class="helper">直前の送信結果が未確定です。別の操作をせず、同じ操作IDで確認してください。</p><button type="button" class="action-btn primary" data-duel-pve-retry="1" '+(busy?'disabled':'')+'>前回の操作を確認</button>':'')+(message?'<p role="status">'+safe(message)+'</p>':'')+
 (active?'<div class="panel"><div class="card-body"><h3>'+safe(names[match.game]??match.game)+' ／ '+safe(resultName[match.winner]??(match.turn==='human'?'あなたの手番':'処理中'))+'</h3><p class="helper">試合ID：'+safe(match.id)+' ／ 第'+safe(match.version)+'版 ／ あなたの手数：'+safe(match.humanMoves)+'</p>'+
 controls(match,busy)+'</div></div>':''))+'</div></details>';
}
export function duelOperationsPanel({available=false,busy=false,report=null,error=''}={}){
 if(!available)return '';
 const counts=report?.counts;
 return '<details class="panel" id="duel-operations-panel" '+(counts||error?'open':'')+'><summary>🛡️ 決闘の運営監査（所有者限定）</summary><div class="card-body"><p class="helper">読み取り専用。自動削除・KP補正・個人情報の公開は行わない。</p><button class="action-btn" data-duel-operations-read="1" '+(busy?'disabled':'')+'>最新の監査結果を取得</button>'+
 (error?'<p role="alert">'+safe(error)+'</p>':'')+(counts?'<p role="status">集計日時：'+safe(new Date(report.asOf).toLocaleString('ja-JP'))+' ／ 保持状況の見直し基準：'+safe(report.retentionReviewDays)+'日</p>'+
 '<p>終了済み・基準超過：CPU戦 '+safe(counts.staleFinishedPve)+'件 ／ 対人戦 '+safe(counts.staleFinishedPvp)+'件</p><p>進行中：CPU戦 '+safe(counts.activePve)+'件 ／ 対人戦 '+safe(counts.activePvp)+'件</p>'+
 '<p>確認が必要：'+(report.reviewRecommended?'あり':'なし')+' ／ 自動削除：なし</p><button class="action-btn" data-duel-operations-export="1">監査集計を保存</button><button class="action-btn" data-duel-operations-records="1">直近確定対戦の記録を保存</button>':'')+
 '</div></details>';
}
