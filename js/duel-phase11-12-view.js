import {duelLegalMoves} from './duel-rules.js?v=web-28517c2c1efaf40b';
import {hitBlowRemaining} from './duel-hitblow-view.js?v=web-28517c2c1efaf40b';
import {bluffDie} from './duel-bluff-view.js?v=web-28517c2c1efaf40b';
import {pokerCardMarkup} from './duel-poker-view.js?v=web-28517c2c1efaf40b';
/** UI-only rendering for authenticated, server-authoritative six-mode CPU duels.
 * The browser cannot choose the daily game/level or award KP.
 */
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={trio:'三目並べ',othello:'オセロ',gomoku:'五目並べ',connect4:'四目並べ',hitblow:'ヒット＆ブロー',bluffdice:'ブラフダイス',poker:'５カードポーカー'};
const resultName={human:'勝利',cpu:'敗北',draw:'引き分け'};
/** Pure UI helpers. The Worker remains the only authority for moves, rewards and winner. */
const cardSuit=id=>['♠','♥','♦','♣'][id%4];
const cardRank=id=>['2','3','4','5','6','7','8','9','10','J','Q','K','A'][Math.floor(id/4)];
function pveWinningLine(board,side){
 if(typeof board!=='string'||!/^[.ab]{42}$/.test(board)||!['a','b'].includes(side))return [];
 for(let row=0;row<6;row++)for(let col=0;col<7;col++){
  if(board[row*7+col]!==side)continue;
  for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
   const cells=Array.from({length:4},(_,k)=>(row+dr*k)*7+col+dc*k);
   if(cells.every((index,k)=>row+dr*k>=0&&row+dr*k<6&&col+dc*k>=0&&col+dc*k<7&&board[index]===side))return cells;
  }
 }
 return [];
}
function gravitySlot(board,col){
 if(!Number.isInteger(col)||col<0||col>6||board[col]!=='.')return -1;
 for(let row=5;row>=0;row--)if(board[row*7+col]==='.')return row*7+col;
 return -1;
}
/** Returns only real gravity-supported added slots; missed/replaced snapshots never animate. */
export function classifyPveConnect4Transition(before,after){
 if(!/^[.ab]{42}$/.test(before??'')||!/^[.ab]{42}$/.test(after??''))return [];
 const changes=[];
 for(let i=0;i<42;i++)if(before[i]!==after[i]){
  if(before[i]!=='.'||!['a','b'].includes(after[i]))return [];
  changes.push(i);
 }
 if(!changes.length||changes.length>2)return [];
 // Server CPU replies may commit human 'a' and CPU 'b' simultaneously.
 const ordered=changes.length===2?[changes.find(i=>after[i]==='a'),changes.find(i=>after[i]==='b')]:changes;
 if(ordered.some(x=>x===undefined))return [];
 let board=before;
 for(const i of ordered){
  if(gravitySlot(board,i%7)!==i)return [];
  board=board.slice(0,i)+after[i]+board.slice(i+1);
 }
 return board===after?ordered:[];
}
function controls(match,busy,{selectedCell=null,pokerPicks=[],animationSlots=[]}={}){
 const board=String(match.board??''),game=match.game,can=match.turn==='human'&&!busy;
 if(['othello','gomoku','connect4','trio'].includes(game)){
  const n=game==='trio'?3:game==='connect4'?7:game==='othello'?8:15;
  const valid=game==='trio'?/^[.XO]{9}$/.test(board):game==='connect4'?/^[.ab]{42}$/.test(board):new RegExp('^[.BW]{'+n*n+'}$').test(board);
  if(!valid)return '<p role="alert">盤面の形式を確認できません。再取得してください。</p>';
  if(game==='connect4'){
   const line=match.turn==='finished'&&match.winner==='human'?pveWinningLine(board,'a'):
    match.turn==='finished'&&match.winner==='cpu'?pveWinningLine(board,'b'):[];
   const wins=new Set(line),motion=new Set(animationSlots);
   const top=Array.from({length:7},(_,col)=>
    '<button type="button" data-duel-pve-cell="'+col+'" aria-label="'+(col+1)+'列に石を落とす" '+
    (!can||board[col]!=='.'?'disabled':'')+' aria-disabled="'+(!can||board[col]!=='.')+'">▼<span class="duel-pve-col-number">'+(col+1)+'</span></button>').join('');
   const cells=[...board].map((v,i)=>{
    const label=v==='a'?'あなたの赤い石':v==='b'?'CPUの黄色い石':'空き';
    const active=can&&board[i%7]==='.';
    return '<button type="button" class="duel-connect4-space '+(v==='.'?'':v)+' '+(wins.has(i)?'duel-c4-win':'')+
     ' '+(motion.has(i)?'duel-c4-new-chip':'')+'" data-duel-pve-slot="'+i+'" aria-label="'+(Math.floor(i/7)+1)+'行'+(i%7+1)+'列 '+label+
     '" data-duel-pve-board-col="'+(i%7)+'" '+(active?'':'disabled')+
     ' style="--c4-drop-duration:620ms;--c4-drop-distance:'+(Math.floor(i/7)+1)*43+'px;--c4-drop-delay:'+(animationSlots.indexOf(i)>0?'-160ms':'0ms')+'"><i aria-hidden="true"></i></button>';
   }).join('');
   return '<div class="duel-pve-connect4 duel-pve-premium" style="max-width:360px;width:100%">'+
    '<p class="helper">赤：あなた ／ 黄：CPU。列の矢印、または盤面内の好きな段をタップして落とす。縦・横・斜めに4つ揃えれば勝ち。</p>'+
    '<div class="duel-connect4-head" role="group" aria-label="四目並べの投入列" style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr))">'+top+'</div>'+
    '<div class="duel-connect4-board '+(wins.size?'duel-c4-victory-board':'')+'" data-c4-match="'+safe(match.id)+'" data-c4-version="'+safe(match.version)+
    '" role="grid" aria-label="四目並べの盤面（６行７列）" style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr))">'+cells+'</div>'+
    (wins.size?'<div class="duel-c4-celebration" role="status" aria-live="polite"><strong>４つ揃った！</strong></div>':'')+'</div>';
  }
  if(game==='trio'){
   return '<div class="duel-pve-board duel-pve-board-trio" style="--duel-cols:3" role="grid" aria-label="三目並べ">'+
    [...board].map((v,i)=>'<button type="button" class="duel-pve-cell duel-pve-trio-cell '+(v==='X'?'human':v==='O'?'cpu':'')+
     '" data-duel-pve-cell="'+i+'" '+(!can||v!=='.'?'disabled':'')+' aria-label="'+(Math.floor(i/3)+1)+'行'+(i%3+1)+'列 '+
     (v==='X'?'あなた':v==='O'?'CPU':'空き')+'">'+(v==='X'?'×':v==='O'?'○':'')+'</button>').join('')+'</div>';
  }
  let allowed=[];
  try{allowed=duelLegalMoves(game,board,'B');}catch{return '<p role="alert">盤面を検証できません。</p>';}
  const legal=new Set(allowed);
  const gomoku=game==='gomoku';
  const grid=[...board].map((v,i)=>{
   const open=legal.has(i);
   const label=(Math.floor(i/n)+1)+'行'+(i%n+1)+'列 '+(v==='B'?'あなたの石':v==='W'?'CPUの石':open?'着手可能':'空き');
   return '<button type="button" class="duel-pve-cell duel-pve-premium-cell '+(v==='B'?'human':v==='W'?'cpu':open?'available':'')+
    (selectedCell===i?' is-selected':'')+'" data-duel-pve-cell="'+i+'" '+(!can||!open?'disabled':'')+
    ' aria-label="'+label+'" aria-pressed="'+(selectedCell===i)+'">'+
    (v==='.'?(open?'<span class="duel-pve-legal-hint" aria-hidden="true">'+(selectedCell===i?'◎':'·')+'</span>':''):'<span class="duel-pve-stone '+(v==='B'?'human':'cpu')+'" aria-hidden="true"></span>')+'</button>';
  }).join('');
  return '<div class="duel-pve-premium duel-pve-premium-'+game+'">'+
   '<p class="helper">'+(gomoku?'盤面は横・縦スクロール可能。置く位置を選び、確認してから確定する。':'淡い目印が置ける場所。黒があなた、白がCPU。')+'</p>'+
   '<div class="duel-pve-premium-scroll" '+(gomoku?'role="region" tabindex="0" aria-label="五目並べ盤面（スクロール可能）"':'')+'>'+
   '<div class="duel-pve-board duel-pve-board-'+game+'" style="--duel-cols:'+n+'" role="grid" aria-label="'+(gomoku?'五目並べ':'オセロ')+'の確定盤面">'+grid+'</div></div>'+
   (gomoku&&selectedCell!==null?'<div class="duel-pve-confirm-row"><span role="status">選択：'+(Math.floor(selectedCell/15)+1)+'行'+(selectedCell%15+1)+'列</span>'+
   '<button class="action-btn primary" type="button" data-duel-pve-confirm="'+selectedCell+'" '+(!can?'disabled':'')+'>ここに置く</button>'+
   '<button class="action-btn" type="button" data-duel-pve-cancel="1">選び直す</button></div>':'')+'</div>';
 }
 const pub=(()=>{try{return JSON.parse(board)}catch{return null}})();
 if(!pub||typeof pub!=='object')return '<p role="alert">盤面の形式を確認できません。</p>';
 const hand=Array.isArray(match.ownHand?.value)?match.ownHand.value:null;
 if(game==='hitblow'){
  const history=Array.isArray(pub.history)?pub.history:[];
  const remaining=hitBlowRemaining(history,'a');
  return '<div class="duel-pve-premium duel-pve-hidden"><p class="helper">重複しない４桁を推理。数字だけ一致＝ブロー、位置も一致＝ヒット。CPUの正解は公開されない。</p>'+
   (remaining!==null?'<p class="duel-pve-insight" role="status">公開された自分の結果から残る候補：'+safe(remaining)+'通り</p>':'')+
   '<label>４桁の予想<input id="duel-pve-guess" class="action-input" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="0123"></label>'+
   '<button class="action-btn primary" data-duel-pve-move="guess" '+(!can?'disabled':'')+'>予想を確定</button>'+
   (history.length?'<details class="duel-pve-history"><summary>公開された予想履歴 '+history.length+'件</summary><ol>'+
     history.map(h=>'<li>'+safe(h.by==='a'?'あなた':'CPU')+' <strong>'+safe(h.guess)+'</strong>　'+safe(h.hit)+'ヒット・'+safe(h.blow)+'ブロー</li>').join('')+'</ol></details>':'')+'</div>';
 }
 if(game==='bluffdice'){
  const dice=hand?.length===5?hand:[];
  const bid=pub.bid;
  return '<div class="duel-pve-premium duel-pve-hidden">'+
   '<p class="helper">あなたのダイス（CPUの手札は非公開）</p><div class="duel-pve-dice-row">'+
   dice.map(v=>bluffDie(v)).join('')+'</div>'+
   '<p role="status" class="duel-pve-insight">現在の宣言：'+(bid?safe(bid.count)+'個・'+safe(bid.face)+'の目（'+(bid.by==='a'?'あなた':'CPU')+'）':'まだ宣言なし')+'</p>'+
   '<div class="duel-pve-bid-row"><label>個数<select id="duel-pve-count">'+Array.from({length:10},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'</option>').join('')+'</select></label>'+
   '<label>目<select id="duel-pve-face">'+Array.from({length:6},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'</option>').join('')+'</select></label></div>'+
   '<div class="duel-pve-confirm-row"><button class="action-btn primary" data-duel-pve-move="bid" '+(!can?'disabled':'')+'>宣言する</button>'+
   '<button class="action-btn" data-duel-pve-move="challenge" '+(!can||!bid||bid.by==='a'?'disabled':'')+'>相手の宣言を疑う</button></div>'+
   (Array.isArray(pub.history)&&pub.history.length?'<details><summary>公開されたラウンド履歴 '+pub.history.length+'件</summary><ol>'+pub.history.map(h=>'<li>第'+safe(h.round)+'回：'+safe(h.actual)+'個／'+safe(h.winner==='a'?'あなた':'CPU')+'勝利</li>').join('')+'</ol></details>':'')+'</div>';
 }
 if(game==='poker'){
  const cards=hand?.length===5&&hand.every(v=>Number.isInteger(v)&&v>=0&&v<52)?hand:[];
  return '<div class="duel-pve-premium duel-pve-hidden"><p class="helper">交換するカードを最大3枚選択。CPUの手札は決着まで非公開。</p>'+
   '<div class="duel-pve-poker-hand">'+cards.map((v,i)=>pokerCardMarkup(v,{index:i,selected:pokerPicks.includes(i),disabled:!can}).replace('data-duel-card="'+i+'"','data-duel-pve-poker="'+i+'"')).join('')+'</div>'+
   '<p role="status" class="duel-pve-insight">交換予定：'+pokerPicks.length+' / 3枚</p>'+
   '<button class="action-btn primary" data-duel-pve-move="poker" '+(!can?'disabled':'')+'>選択したカードを交換</button>'+
   (pub.showdown?'<details><summary>確定済みの公開決着情報</summary><pre>'+safe(JSON.stringify(pub.showdown))+'</pre></details>':'')+'</div>';
 }
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
 (item.status==='active'?'<button type="button" class="action-btn" data-duel-history-resume="'+safe(item.id)+'">この対局を再開</button><button type="button" class="action-btn" data-duel-pve-abandon="'+safe(item.id)+'">この対局を破棄</button>':'')+'</li>').join('')+'</ol>':'<p>CPU対局の保存記録はまだない。</p>');
 return html+'<p class="helper">'+safe(data.note??'')+'</p></div></section>';
}
export function duelPvePanel({live=false,busy=false,preview=null,match=null,error='',message='',sessionInput='',pending=null,open=false,game='othello',level='normal',rewardsOpen=false,rewards=null,rewardsError='',historyUi=null,abandonConfirm='',skillSummary=null,selectedCell=null,pokerPicks=[],animationSlots=[]}={}){
 const active=match&&typeof match.id==='string';
 const expanded=open||active||preview||error||message;
 return '<section class="duel-pve-stage" id="duel-pve-section" aria-label="CPU攻略の対局画面"><div class="duel-pve-stage-head"><span class="duel-pve-kicker">SERVER CPU · MAIN MODE</span><h3>CPU攻略アリーナ</h3><p>種目を選んで、何度でも本気の対局へ。勝敗と熟練度はサーバーで確定する。</p></div><div class="duel-pve-stage-body">'+
 '<div class="panel"><div class="card-body"><strong>遊び方は2つ</strong><p class="helper"><b>今日の種目：</b>日付ごとにサーバーが種目・難易度を決定。日替わりの開始・完了・勝利回数を記録。日替わり特別KPはない。</p><p class="helper"><b>好きな種目：</b>自分で種目と難易度を指定。日替わり回数には含めない。いずれもサーバーで自然終局した場合だけ熟練度・既存報酬の判定対象となる。</p><p class="helper">同時に進行中のCPU戦は直近24時間で最大3件。新規開始は今の盤面を自動破棄しない。不要な対局は下の「破棄」で無報酬終了できる。</p></div></div>'+
 '<button type="button" class="action-btn" data-duel-history-open="1" '+(busy?'disabled':'')+'>7種目の対局履歴・熟練度を見る</button>'+ 
 '<details class="panel"><summary>ドロップ・報酬の確率と条件</summary><div class="card-body"><p class="helper">自然終局してサーバーで確定した試合のみ抽選対象。報酬は種目別の「獲得済み」記録であり、装備できる遺物や個別アイテムを配る仕組みではない。放棄した試合、練習、未確定試合は抽選しない。</p><p class="helper">確率は運用中の報酬設定に依存する。抽選記録がなければドロップなし。下の結果欄で実際の確率と抽選値を確認できる。</p></div></details>'+
 (!live?'<p>KP口座への接続が必要です。</p>':
 '<div class="action-row"><button class="action-btn" data-duel-pve-preview="1" '+(busy?'disabled':'')+'>今日の種目を確認</button>'+
 '<button class="action-btn primary" data-duel-pve-start="1" '+(busy||pending?'disabled':'')+'>今日のCPU戦を開始</button></div>'+
 '<div class="duel-pve-setup"><p class="helper">選択した種目：'+safe(names[game]??game)+'。上の種目カードから変更できる。</p><label class="duel-pve-legacy-select">種目<select id="duel-pve-game">'+Object.entries(names).map(([key,label])=>'<option value="'+key+'" '+(game===key?'selected':'')+'>'+safe(label)+'</option>').join('')+'</select></label><label>CPU難易度<select id="duel-pve-level">'+[['easy','イージー'],['normal','ノーマル'],['strong','ストロング']].map(([key,label])=>'<option value="'+key+'" '+(level===key?'selected':'')+'>'+label+'</option>').join('')+'</select></label><button class="action-btn primary" data-duel-pve-custom-start="1" '+(busy||pending?'disabled':'')+'>この種目でCPU戦を始める →</button></div>'+
 (preview?'<p class="helper">本日 '+safe(preview.day)+'：'+safe(names[preview.game]??preview.game)+' ／ '+safe(preview.level)+'</p>':'')+
 '<details class="duel-pve-recovery"><summary>以前の試合をIDで再開</summary><label class="helper">途中のCPU戦を再開（試合ID）<input id="duel-pve-session-input" class="action-input" maxlength="36" placeholder="試合ID" value="'+safe(sessionInput)+'"></label><button class="action-btn" data-duel-pve-resume="1" '+(busy?'disabled':'')+'>再開</button></details>'+
 (error?'<p role="alert">'+safe(error)+'</p>':'')+(pending?'<p class="helper">直前の送信結果が未確定です。別の操作をせず、同じ操作IDで確認してください。</p><button type="button" class="action-btn primary" data-duel-pve-retry="1" '+(busy?'disabled':'')+'>前回の操作を確認</button>':'')+(message?'<p role="status">'+safe(message)+'</p>':'')+
 (active?'<div class="duel-pve-arena" data-duel-pve-state="'+safe(match.turn)+'"><div class="duel-pve-arena-top"><span>LIVE MATCH · '+safe(names[match.game]??match.game)+'</span><span>第'+safe(match.version)+'版</span></div><h3>'+safe(resultName[match.winner]??(match.turn==='human'?'あなたの手番':'CPU処理中'))+'</h3><p class="duel-pve-turn">あなたの手数 '+safe(match.humanMoves)+' · '+(match.turn==='finished'?'対局終了':'サーバー判定で対局中')+'</p>'+
 controls(match,busy,{selectedCell,pokerPicks,animationSlots})+
 (match.turn==='finished'?'<div class="duel-pve-after"><h3>対局結果</h3><p>熟練度：'+(skillSummary?'確定 '+safe(skillSummary.points)+'pt'+(skillSummary.delta===null?'（前回値未取得）':'（確認済みの前回値から '+(skillSummary.delta>=0?'+':'')+safe(skillSummary.delta)+'pt）'):'記録を取得できないため増減未確認')+'</p><p class="helper">報酬の抽選結果は直下に表示。次も同じ種目・難易度なら「もう一局」で即開始できる。</p><button type="button" class="action-btn primary" data-duel-pve-custom-start="1" '+(busy||pending?'disabled':'')+'>もう一局（選択中の種目・難易度）</button></div>':
 '<div class="action-row"><button type="button" class="action-btn" data-duel-pve-abandon="'+safe(match.id)+'" '+(busy||pending?'disabled':'')+'>このCPU戦を破棄</button></div>')+'</div>':''))+'</div></section>'+
 (historyUi?.open?duelHistoryPanel(historyUi):'')+
 (abandonConfirm?'<section class="panel"><div class="card-body"><p role="alert">この対局を無報酬で破棄しますか？熟練度・ドロップは発生しません。</p><button type="button" class="action-btn" data-duel-pve-abandon="'+safe(abandonConfirm)+'" data-duel-pve-confirm="yes">破棄を確定する</button><button type="button" class="action-btn" data-duel-pve-abandon-cancel="1">やめる</button></div></section>':'')+
 (rewardsOpen?'<section class="panel" id="duel-rewards-in-app"><div class="card-body"><h3>決闘の戦績・報酬（サーバー取得）</h3>'+
 (rewardsError?'<p role="alert">'+safe(rewardsError)+'</p>':'')+
 (!rewards?'<p role="status">取得中…</p>':
  '<h4>CPU戦のドロップ抽選</h4>'+
  ((rewards.policy??[]).filter(p=>p.mode==='pve').map(p=>'<p class="helper">運用中の確率：勝利 '+safe((p.win_bps/100).toFixed(2))+'% ／ 敗北 '+safe((p.loss_bps/100).toFixed(2))+'% ／ 引き分け '+safe((p.draw_bps/100).toFixed(2))+'%。'+(p.daily_cap===null?'日次抽選上限なし':'日次抽選上限 '+safe(p.daily_cap)+'回')+'</p>').join('')||'<p class="helper">現在有効なCPU戦ドロップ設定はない。抽選対象外のため獲得なし。</p>')+
  (match?.turn==='finished'?(()=>{
   const roll=(rewards.rolls??[]).find(r=>r.mode==='pve'&&r.match_id===match.id);
   return roll?'<p role="status">この対局：'+(roll.roll<roll.chance_bps?'ドロップ当選':'ドロップなし')+'（実適用確率 '+safe((roll.chance_bps/100).toFixed(2))+'%、抽選値 '+safe(roll.roll)+'/9999）。種目別の獲得記録として保存。</p>':'<p role="status">この対局：抽選記録なし（ドロップなし／抽選条件未達・未設定など）。</p>';
  })():'')+
  (['pve','pvp'].map(mode=>'<h4>'+(mode==='pve'?'CPU攻略':'対人戦')+'</h4><ul>'+
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
