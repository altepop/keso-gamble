/** UI-only rendering for authenticated, server-authoritative six-mode CPU duels.
 * The browser cannot choose the daily game/level or award KP.
 */
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={trio:'三目並べ',othello:'オセロ',gomoku:'五目並べ',connect4:'四目並べ',hitblow:'ヒット＆ブロー',bluffdice:'ブラフダイス',poker:'５カードポーカー'};
const resultName={human:'勝利',cpu:'敗北',draw:'引き分け'};
function controls(match,busy){
 const board=String(match.board??''),game=match.game,can=match.turn==='human'&&!busy;
 if(['othello','gomoku','connect4','trio'].includes(game)){
  const columns=game==='trio'?3:game==='connect4'?7:game==='othello'?8:15;
  if(!(game==='trio'?/^[.XO]{9}$/.test(board):new RegExp('^[.BWab]{'+(game==='connect4'?42:columns*columns)+'}$').test(board)))
   return '<p role="alert">盤面の形式を確認できません。再取得してください。</p>';
  const pieces={X:'×',O:'○',B:'●',W:'○',a:'●',b:'○','.':'·'};
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
export function duelWeeklyEventPanel(event){
 if(!event||event.kind!=='weekly-focus')return '';
 return '<div class="panel"><div class="card-body"><strong>🏆 週間イベント</strong><p>'+safe(event.title)+'</p>'+
 '<p class="helper">毎週月曜日に切替。今回のテーマはおすすめ種目であり、イベント専用の勝率補正・自動参加・追加KPはありません。</p></div></div>';
}
/** Read-only, member-scoped historical progress; never guesses a reward from an unfinished game. */
export function duelHistoryPanel({open=false,busy=false,data=null,error='',mode='all',game='all'}={}){
 if(!open)return '';
 const choices=[['all','全種目'],...Object.entries(names)];
 const pick=(id,items,value)=>'<select id="'+id+'">'+items.map(([k,label])=>'<option value="'+k+'" '+(k===value?'selected':'')+'>'+safe(label)+'</option>').join('')+'</select>';
 const result={win:'勝利',loss:'敗北',draw:'引き分け'};
 const when=ms=>Number.isFinite(Number(ms))?new Date(Number(ms)).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'不明';
 let html='<section class="panel" id="duel-history-panel" aria-label="決闘の対局履歴と進捗"><div class="card-body"><h3>対局履歴・熟練度</h3>'+
 '<p class="helper">サーバーで確定した記録だけを表示。ブラウザ内の無料CPU練習は記録対象外。本人以外は閲覧できない。</p>'+
 '<label>対戦形式'+pick('duel-history-mode',[['all','両方'],['pve','CPU攻略'],['pvp','対人戦']],mode)+'</label>'+
 '<label>種目'+pick('duel-history-game',choices,game)+'</label>'+
 '<button type="button" class="action-btn" data-duel-history-refresh="1" '+(busy?'disabled':'')+'>履歴と進捗を更新</button>'+
 (error?'<p role="alert">'+safe(error)+'</p>':'');
 if(!data)return html+'<p role="status">「履歴と進捗を更新」で最新の記録を取得する。</p></div></section>';
 const today=data.today??{};
 html+='<p role="status">今日の日替わり：'+safe(names[today.game]??today.game??'未取得')+
 ' ／ '+safe(today.level??'未取得')+' ／ 開始'+safe(today.started??0)+'回・完了'+safe(today.finished??0)+'回・勝利'+safe(today.wins??0)+'回</p>'+
 '<p class="helper">日替わりの開始記録は今回の保存機能追加後だけ。古い試合や手動開始を日替わり実績と推定しない。特別な追加KPはない。</p>';
 const skills=Array.isArray(data.skills)?data.skills:[];
 html+='<h4>7種目の確定済み熟練度</h4>'+
 ['pve','pvp'].filter(x=>mode==='all'||x===mode).map(m=>
 '<details '+(m==='pve'?'open':'')+'><summary>'+(m==='pve'?'CPU攻略':'対人戦')+'</summary><ul>'+
 Object.entries(names).filter(([g])=>game==='all'||g===game).map(([g,label])=>{
 const item=skills.find(x=>x.mode===m&&x.game===g);
 const points=item?.points??0;
 return '<li>'+safe(label)+'：'+safe(item?.wins??0)+'勝 '+safe(item?.losses??0)+'敗 '+safe(item?.draws??0)+'分 ／ 熟練度 '+safe(points)+' ／ 検証済 '+safe(item?.verified_games??0)+'戦</li>';
 }).join('')+'</ul></details>').join('');
 const items=Array.isArray(data.history)?data.history:[];
 html+='<h4>確定した対局（新しい順）</h4>'+
 (items.length?'<ol>'+items.map(item=>'<li>'+safe(when(item.at))+'　'+safe(names[item.game]??item.game)+' ／ '+(item.mode==='pve'?'CPU':'対人')+' ／ '+safe(result[item.outcome]??'不明')+
 (item.dailyDay?' ／ 日替わり '+safe(item.dailyDay):'')+'</li>').join('')+'</ol>':'<p>条件に一致する確定対局はまだない。</p>')+
 (data.historyHasMore?'<p class="helper">最新20件まで表示。過去の記録が続く可能性がある。</p>':'');
 const sessions=Array.isArray(data.sessions)?data.sessions:[];
 if(mode!=='pvp')html+='<h4>CPU対局の再開・終了履歴</h4>'+
 (sessions.length?'<ol>'+sessions.map(item=>'<li>'+safe(when(item.updatedAt))+'　'+safe(names[item.game]??item.game)+' ／ '+safe(item.level)+
 ' ／ '+(item.status==='active'?'進行中':(item.winner==='human'?'勝利':item.winner==='cpu'?'敗北':item.winner==='draw'?'引き分け':'終了'))+
 (item.dailyDay?' ／ 日替わり '+safe(item.dailyDay):'')+
 (item.status==='active'?'<button class="action-btn" data-duel-history-resume="'+safe(item.id)+'">この対局を再開</button>':'')+'</li>').join('')+'</ol>':'<p>CPU対局の保存記録はまだない。</p>');
 return html+'<p class="helper">'+safe(data.note??'')+'</p></div></section>';
}
export function duelPvePanel({live=false,busy=false,preview=null,match=null,error='',message='',sessionInput='',pending=null,open=false,game='othello',level='normal',rewardsOpen=false,rewards=null,rewardsError='',historyUi=null}={}){
 const active=match&&typeof match.id==='string';
 const expanded=open||active||preview||error||message;
 return '<details class="panel" id="duel-pve-section" '+(expanded?'open':'')+'><summary>🗓️ 今日のCPUチャレンジ（サーバー対戦）</summary><div class="card-body">'+
 '<p class="helper">６種目を日替わりで挑戦。KP残高を賭けず、実戦用のサーバー判定で進行する。既存のPvE報酬規則のみ適用され、日替わり特別KPはない。</p>'+
 (!live?'<p>KP口座への接続が必要です。</p>':
 '<div class="action-row"><button class="action-btn" data-duel-pve-preview="1" '+(busy?'disabled':'')+'>今日の種目を確認</button>'+
 '<button class="action-btn primary" data-duel-pve-start="1" '+(busy||pending?'disabled':'')+'>今日のCPU戦を開始</button></div>'+
 '<div class="panel"><div class="card-body"><p class="helper">サーバーCPU攻略：７種目から選んで挑戦できる。対局と勝敗はサーバーが確定する。</p><label>種目<select id="duel-pve-game">'+Object.entries(names).map(([key,label])=>'<option value="'+key+'" '+(game===key?'selected':'')+'>'+safe(label)+'</option>').join('')+'</select></label><label>CPU難易度<select id="duel-pve-level">'+[['easy','イージー'],['normal','ノーマル'],['strong','ストロング']].map(([key,label])=>'<option value="'+key+'" '+(level===key?'selected':'')+'>'+label+'</option>').join('')+'</select></label><button class="action-btn primary" data-duel-pve-custom-start="1" '+(busy||pending?'disabled':'')+'>選んだ種目でCPU戦を開始</button></div></div>'+
 (preview?'<p class="helper">本日 '+safe(preview.day)+'：'+safe(names[preview.game]??preview.game)+' ／ '+safe(preview.level)+'</p>':'')+
 '<label class="helper">途中のCPU戦を再開（試合ID）<input id="duel-pve-session-input" class="action-input" maxlength="36" placeholder="試合ID" value="'+safe(sessionInput)+'"></label><button class="action-btn" data-duel-pve-resume="1" '+(busy?'disabled':'')+'>再開</button>'+
 (error?'<p role="alert">'+safe(error)+'</p>':'')+(pending?'<p class="helper">直前の送信結果が未確定です。別の操作をせず、同じ操作IDで確認してください。</p><button type="button" class="action-btn primary" data-duel-pve-retry="1" '+(busy?'disabled':'')+'>前回の操作を確認</button>':'')+(message?'<p role="status">'+safe(message)+'</p>':'')+
 (active?'<div class="panel"><div class="card-body"><h3>'+safe(names[match.game]??match.game)+' ／ '+safe(resultName[match.winner]??(match.turn==='human'?'あなたの手番':'処理中'))+'</h3><p class="helper">試合ID：'+safe(match.id)+' ／ 第'+safe(match.version)+'版 ／ あなたの手数：'+safe(match.humanMoves)+'</p>'+
 controls(match,busy)+'</div></div>':''))+'</div></details>'+
 (historyUi?.open?duelHistoryPanel(historyUi):'')+
 (rewardsOpen?'<section class="panel" id="duel-rewards-in-app"><div class="card-body"><h3>決闘の戦績・報酬（サーバー取得）</h3>'+
 (rewardsError?'<p role="alert">'+safe(rewardsError)+'</p>':'')+
 (!rewards?'<p role="status">取得中…</p>':(['pve','pvp'].map(mode=>'<h4>'+(mode==='pve'?'CPU攻略':'対人戦')+'</h4><ul>'+
 Object.entries(names).map(([id,label])=>{const row=(rewards.skills??[]).find(x=>x.mode===mode&&x.game===id);const earned=(rewards.collection??[]).some(x=>x.mode===mode&&x.game===id);return '<li>'+safe(label)+'：'+safe(row?.wins??0)+'勝 '+safe(row?.losses??0)+'敗 '+safe(row?.draws??0)+'分 ／ '+(earned?'獲得済み':'未獲得')+'</li>';}).join('')+'</ul>').join('')))+'</div></section>':'');
}
export function duelOperationsPanel({available=false,busy=false,report=null,error='',auto=false,season=null,archives=null}={}){
 if(!available)return '';
 const counts=report?.counts;
 return '<details class="panel" id="duel-operations-panel" '+(counts||error||auto||season||archives?'open':'')+'><summary>🛡️ 決闘の運営監査（所有者限定）</summary><div class="card-body"><p class="helper">読み取り専用。自動削除・KP補正・個人情報の公開は行わない。</p><button class="action-btn" data-duel-operations-read="1" '+(busy?'disabled':'')+'>最新の監査結果を取得</button><button type="button" class="action-btn" data-duel-operations-auto="1" aria-pressed="'+Boolean(auto)+'">'+(auto?'15分ごとの画面監視を停止':'この画面を開いている間、15分ごとに監査')+'</button><p class="helper">画面を閉じた間やアプリ終了後は実行されません。常時監視・通知サービスではありません。</p>'+
 '<button type="button" class="action-btn" data-duel-season-read="1" '+(busy?'disabled':'')+'>週間シーズン順位とイベントを見る</button>'+
 '<button type="button" class="action-btn" data-duel-season-archive="1" '+(busy?'disabled':'')+'>確定済みシーズン記録を表示</button>'+
 (archives?'<section class="panel" aria-label="確定済みシーズンの履歴"><div class="card-body"><h3>保存されたシーズン順位</h3>'+
 '<p class="helper">週次確定後に保存した成績。KP支給なし。対戦全履歴の復元用バックアップではありません。</p>'+
 ((archives.seasons??[]).map(s=>'<details><summary>'+safe(s.id)+'（'+safe(s.sampledMatches)+'試合）</summary>'+
 '<ol>'+((s.rankings??[]).slice(0,20).map(r=>'<li>登録ID '+safe(r.user)+'：'+safe(r.wins)+'勝 '+safe(r.losses)+'敗 '+safe(r.draws)+'分</li>').join('')||'<li>該当試合なし</li>')+'</ol></details>').join('')||'<p>確定済みシーズンの保存記録はまだありません。次の週次確定後に反映されます。</p>')+'</div></section>':'')+

 (season?'<div role="region" aria-label="週間決闘シーズン" class="panel"><div class="card-body">'+
 '<h3>週次シーズン '+safe(season.season?.id)+'</h3><p class="helper">'+safe(season.event?.title)+' ／ 追加KPなし</p>'+
 '<p class="helper">実データから集計した所有者限定の暫定順位。試合履歴の保存期間と取得上限により、全期間の確定順位ではない。</p>'+
 (season.partial?'<p role="alert">取得上限500試合のため順位は一部集計です。</p>':'')+
 '<ol>'+((season.rankings??[]).slice(0,20).map(row=>'<li>登録ID '+safe(row.user)+'：'+safe(row.wins)+'勝 '+safe(row.losses)+'敗 '+safe(row.draws)+'分</li>').join('')||'<li>対象試合はありません。</li>')+'</ol>'+
 '</div></div>':'')+
 (error?'<p role="alert">'+safe(error)+'</p>':'')+(counts?'<p role="status">集計日時：'+safe(new Date(report.asOf).toLocaleString('ja-JP'))+' ／ 見直し：CPU戦 '+safe(report.retentionReviewDays)+'日、対人戦 '+safe(report.pvpRetentionReviewDays??30)+'日</p>'+
 '<p>終了済み・基準超過：CPU戦 '+safe(counts.staleFinishedPve)+'件 ／ 対人戦 '+safe(counts.staleFinishedPvp)+'件</p><p>進行中：CPU戦 '+safe(counts.activePve)+'件 ／ 対人戦 '+safe(counts.activePvp)+'件</p>'+
 '<p>確認が必要：'+(report.reviewRecommended?'あり':'なし')+' ／ 自動削除：なし</p><button class="action-btn" data-duel-operations-export="1">監査集計を保存</button><button class="action-btn" data-duel-operations-records="1">直近確定対戦の記録を保存</button>':'')+
 '</div></details>';
}

/** Additional casual game, not a wager or a PvE reward mode. */
export function duelTrioPanel({board='.........',level='strong',winner=null,error=''}={}){
 const status=winner==='X'?'あなたの勝ち':winner==='O'?'CPUの勝ち':winner==='draw'?'引き分け':'あなたの番';
 const cell=String(board);
 const valid=/^[.XO]{9}$/.test(cell);
 const safeCells=valid?cell:'.........';
 const finished=Boolean(winner);
 return '<details class="panel" id="duel-trio-panel" '+(board!=='.........'||winner?'open':'')+'><summary>🆕 新種目：三目並べ（CPU練習）</summary><div class="card-body">'+
 '<p class="helper">３つ並べる戦略対戦。強CPUは最後まで読み切る完全探索。ブラウザ内の無料練習のみで、KP・報酬・戦績は変わらない。</p>'+
 '<label>CPUの強さ <select id="duel-trio-level">'+
 [['easy','かんたん'],['normal','ふつう'],['strong','つよい（完全探索）']].map(([v,n])=>'<option value="'+v+'" '+(v===level?'selected':'')+'>'+n+'</option>').join('')+'</select></label>'+
 '<p role="status">'+status+'</p>'+ (error?'<p role="alert">'+safe(error)+'</p>':'')+
 '<div role="grid" aria-label="三目並べの盤面" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));max-width:280px;gap:6px">'+
 [...safeCells].map((v,i)=>'<button type="button" role="gridcell" class="action-btn" data-duel-trio-cell="'+i+'" aria-label="'+(Math.floor(i/3)+1)+'行'+(i%3+1)+'列'+(v==='.'?' 空き':v==='X'?' あなた':' CPU')+'" style="min-height:68px;font-size:28px" '+(v!=='.'||finished?'disabled':'')+'>'+(v==='.'?'・':v==='X'?'×':'○')+'</button>').join('')+'</div>'+
 '<button type="button" class="action-btn" data-duel-trio-reset="1">新しい対戦</button></div></details>';
}
