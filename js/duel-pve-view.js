// Authenticated server PvE Activity panel. No local CPU or fabricated outcome.
import {duelLegalMoves} from './duel-rules.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const games={othello:'オセロ',gomoku:'五目並べ',connect4:'四目並べ',hitblow:'Hit & Blow',bluffdice:'ブラフダイス',poker:'5カードポーカー'};
const levels={easy:'イージー',normal:'ノーマル',strong:'ストロング'};
const disabled=(busy,pending,turn)=>busy||pending||turn!=='human'?' disabled':'';
function boardPanel(m,selected,busy,pending){
 const n=m.game==='gomoku'?15:8;
 const allowed=new Set(m.turn==='human'?duelLegalMoves(m.game,m.board,'B'):[]);
 const cells=[...m.board].map((v,i)=>'<button type="button" class="duel-pve-cell '+(v==='B'?'human':v==='W'?'cpu':'empty')+'" data-pve-cell="'+i+'" aria-label="'+(Math.floor(i/n)+1)+'行'+(i%n+1)+'列 '+(v==='B'?'あなた':v==='W'?'CPU':allowed.has(i)?'着手可能':'空き')+'" '+(!allowed.has(i)||busy||pending?'disabled':'')+' aria-pressed="'+(selected===i)+'">'+(v==='B'?'●':v==='W'?'○':selected===i?'◎':'')+'</button>').join('');
 return '<div class="duel-pve-board-wrap '+(m.game==='gomoku'?'wide':'')+'" role="region" tabindex="0" aria-label="CPU戦の盤面（広い盤面はスクロールできます）"><div class="duel-pve-board" style="--pve-size:'+n+'">'+cells+'</div></div>'
 + (m.game==='gomoku'&&selected!==null?'<div class="duel-pve-actions"><button class="action-btn primary" data-pve-confirm="'+selected+'" '+disabled(busy,pending,m.turn)+'>この位置に置く</button><button class="action-btn" data-pve-cancel="1">取り消す</button></div>':'');
}
function connectPanel(m,busy,pending){
 const cols=Array.from({length:7},(_,i)=>'<button type="button" class="action-btn" data-pve-col="'+i+'" '+(m.board[i]==='.'?disabled(busy,pending,m.turn):'disabled')+' aria-label="'+(i+1)+'列に置く">'+(i+1)+'列</button>').join('');
 const cells=[...m.board].map((v,i)=>'<span class="duel-pve-disc '+(v==='a'?'human':v==='b'?'cpu':'')+'" aria-label="'+(Math.floor(i/7)+1)+'段 '+(i%7+1)+'列 '+(v==='a'?'あなた':v==='b'?'CPU':'空き')+'">'+(v==='.'?'·':'●')+'</span>').join('');
 return '<div class="duel-pve-columns">'+cols+'</div><div class="duel-pve-connect-board" role="img" aria-label="四目並べの確定盤面">'+cells+'</div>';
}
function hiddenPanel(m,busy,pending,picks,guessDraft=''){
 const pub=JSON.parse(m.board);
 if(m.game==='hitblow'){
  const history=Array.isArray(pub.history)?pub.history:[];
  const latest=history.at(-1);
  return '<p class="helper">異なる数字4桁を入力してください。CPUの秘密の数字は確定まで公開されません。</p>'
   +(latest?'<p role="status">直前の結果：'+esc(latest.by==='a'?'あなた':'CPU')+' '+esc(latest.guess)+'／'+esc(latest.hit)+' Hit・'+esc(latest.blow)+' Blow</p>':'')
   +'<div class="duel-pve-actions"><label>4桁の予想<input type="text" id="pve-guess" value="'+esc(guessDraft)+'" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off"></label><button class="action-btn primary" data-pve-submit="hitblow" '+disabled(busy,pending,m.turn)+'>予想を確定</button></div>'
   +(history.length?'<details><summary>これまでの予想 '+history.length+'回</summary><ol>'+history.map(h=>'<li>'+esc(h.by==='a'?'あなた':'CPU')+' '+esc(h.guess)+'：'+esc(h.hit)+' Hit／'+esc(h.blow)+' Blow</li>').join('')+'</ol></details>':'');
 }
 if(m.game==='bluffdice'){
  const dice=Array.isArray(m.ownHand?.value)?m.ownHand.value:[];
  const bid=pub.bid,history=Array.isArray(pub.history)?pub.history:[];
  return '<p>あなたのダイス：'+dice.map(x=>'<strong class="duel-pve-die">'+esc(x)+'</strong>').join(' ')+'</p>'
   +'<p role="status">最新の宣言：'+(bid?esc(bid.count)+'個以上の '+esc(bid.face)+'の目（'+(bid.by==='a'?'あなた':'CPU')+'）':'まだ宣言なし')+'</p>'
   +'<div class="duel-pve-actions"><label>個数<select id="pve-bid-count">'+Array.from({length:10},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'</option>').join('')+'</select></label>'
   +'<label>目<select id="pve-bid-face">'+Array.from({length:6},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'</option>').join('')+'</select></label>'
   +'<button class="action-btn primary" data-pve-submit="bid" '+disabled(busy,pending,m.turn)+'>宣言する</button>'
   +'<button class="action-btn" data-pve-submit="challenge" '+(bid&&bid.by==='b'?disabled(busy,pending,m.turn):'disabled')+'>疑う</button></div>'
   +(history.length?'<details><summary>公開された過去ラウンド '+history.length+'件</summary><ol>'+history.map(h=>'<li>'+esc(h.round)+'回：'+esc(h.actual)+'個（'+esc(h.winner==='a'?'あなた':'CPU')+'勝利）</li>').join('')+'</ol></details>':'');
 }
 const hand=Array.isArray(m.ownHand?.value)?m.ownHand.value:[];
 const ranks=n=>({11:'J',12:'Q',13:'K',14:'A'}[n]??String(n));
 const suits=['♠','♥','♦','♣'];
 return '<p class="helper">交換するカードを0〜3枚選んで確定してください。CPUの手札は決着まで非公開です。</p>'
  +'<div class="duel-pve-cards">'+hand.map((card,i)=>'<button type="button" class="duel-pve-card" data-pve-card="'+i+'" aria-pressed="'+picks.includes(i)+'" '+disabled(busy,pending,m.turn)+'>'+esc(ranks(Math.floor(card/4)+2))+' '+suits[card%4]+'</button>').join('')+'</div>'
  +'<p>交換予定：'+picks.length+'枚／最大3枚</p>'
  +'<button class="action-btn primary" data-pve-submit="poker" '+disabled(busy,pending,m.turn)+'>交換して確定</button>'
  +(pub.showdown?'<details><summary>決着した手札を見る</summary><pre>'+esc(JSON.stringify(pub.showdown))+'</pre></details>':'');
}
export function pvePanel({match=null,connected=false,busy=false,error='',pending=false,selected=null,picks=[],game='othello',level='normal',savedId=false,guessDraft=''}={}){
 const active=match&&Object.hasOwn(games,match.game);
 const status=active?match.turn==='finished'
  ?'確定結果：'+(match.winner==='human'?'あなたの勝ち':match.winner==='cpu'?'CPUの勝ち':'引き分け')
  :'あなたの手番（CPUの行動もサーバーで確定済み）':'';
 const body=active?(Object.hasOwn(games,match.game)&&['othello','gomoku'].includes(match.game)
  ?boardPanel(match,selected,busy,pending):match.game==='connect4'
   ?connectPanel(match,busy,pending):hiddenPanel(match,busy,pending,picks,guessDraft)):'';
 const controls='<div class="duel-pve-config"><label>ゲーム<select id="pve-game">'+Object.entries(games).map(([k,v])=>'<option value="'+k+'" '+(game===k?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label><label>CPUの強さ<select id="pve-level">'+Object.entries(levels).map(([k,v])=>'<option value="'+k+'" '+(level===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'
  +'<button class="action-btn primary" data-pve-submit="start" '+(!connected||busy||pending?'disabled':'')+'>新しくCPU戦を始める</button></div>';
 return '<details class="duel-pve-panel panel" '+(active?'open':'')+'><summary>サーバーCPU攻略（PvE）'+(active?' · '+esc(games[match.game]):'')+'</summary><div class="card-body">'
  +'<p class="helper">CPUも着手・判定をサーバーで確定します。KPと遺物のPvE報酬は未導入で、ブラウザ内の練習モードとは別です。</p>'
  +(error?'<p class="storage-warning" role="alert">'+esc(error)+'</p>':'')
  +(pending?'<p role="alert">送信結果が未確認です。新しい操作を送らず、同じ操作IDで確認してください。</p><button class="action-btn" data-pve-retry="1" '+(busy?'disabled':'')+'>前回の操作を確認する</button>':'')
  +(active?'<p class="duel-pve-status" role="status">'+esc(status)+'</p><p class="helper">難易度：'+esc(levels[match.level])+'／サーバー確定操作 '+esc(match.version)+'回</p>'+body+'<button class="action-btn" data-pve-refresh="1" '+(busy?'disabled':'')+'>試合状態を再取得</button>':'')
  +(!active&&savedId?'<button class="action-btn" data-pve-resume="1" '+(busy?'disabled':'')+'>保存済みのCPU戦を開く</button>':'')
  +controls+'</div></details>';
}
