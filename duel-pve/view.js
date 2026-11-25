// Authenticated server PvE Activity panel. No local CPU or fabricated outcome.
import {duelLegalMoves} from '../js/duel-rules.js?v=p94c';
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const games={othello:'オセロ',gomoku:'五目並べ',connect4:'四目並べ',hitblow:'Hit & Blow',bluffdice:'ブラフダイス',poker:'5カードポーカー'};
const tactics={
 othello:'角を取れる手を探し、取れないときは角の斜め隣に置く前に相手の返し手を確認。',
 gomoku:'自分の列を伸ばす前に、両端が空いた相手の三連を確認。',
 connect4:'置く列だけでなく、その石の上に相手が置けるようになる段も確認。',
 hitblow:'直前の予想から数字1つだけを変え、HitとBlowの差を比較。',
 bluffdice:'先に自分の同じ目を数え、宣言が成立するには相手側に何個必要か考える。',
 poker:'ペアは残し、他の札を交換する前にストレートやフラッシュの候補を確認。',
};
const attackTactics={
 othello:'角を確保したら、その角と同じ色で辺をつなげる手を探す。',
 gomoku:'次の一手で二方向に同時に脅威を作れる交点を探す。',
 connect4:'次のターンに異なる二列で四連を作れる形を探す。',
 hitblow:'候補が多い間は、残った候補を複数の結果に分けられる予想を優先。',
 bluffdice:'自分の手元で同じ目が多ければ、その目で宣言を続けられるか確認。',
 poker:'同じスートが4枚なら、1枚交換でフラッシュを狙えるか確認。',
};
export function pveBuildPanel(profile,build,busy,message){
 if(!profile)return '';
 const owned=Object.entries(games).filter(([game])=>profile.collection.some(row=>row.mode==='pve'&&row.game===game));
 return '<section class="panel duel-reward-panel" aria-labelledby="pve-build-heading"><h2 id="pve-build-heading">PvE攻略ビルド</h2>'+
  '<p>種目ごとに攻めか守りのヒントを装備できます。</p>'+
  (owned.length?owned.map(([game,label])=>{
   const style=build.find(row=>row.game===game)?.style??'';
   return '<label class="pve-build-choice">'+esc(label)+'<select data-pve-build="'+game+'"'+(busy?' disabled':'')+'>'+
    [['','装備なし'],['attack','攻め'],['defense','守り']].map(([key,name])=>'<option value="'+key+'"'+(style===key?' selected':'')+'>'+name+'</option>').join('')+'</select></label>';
  }).join(''):'<p>種目の攻略遺物を獲得すると装備できます。</p>')+
  '<p role="status">'+esc(message)+'</p></section>';
}
export function duelRewardPanel(profile){
 if(!profile)return '';
 return '<section id="duel-rewards" class="panel duel-reward-panel" aria-label="決闘の戦績と報酬">'+
 ['pve','pvp'].map(mode=>'<details><summary>'+(mode==='pve'?'PvE攻略遺物':'PvP記念章')+'</summary>'+
  (!profile.enabled.includes(mode)?'<p>報酬の発行は準備中です。</p>':'')+
  '<ul>'+Object.entries(games).map(([game,label])=>{
   const record=profile.skills.find(row=>row.mode===mode&&row.game===game);
   const earned=profile.collection.some(row=>row.mode===mode&&row.game===game);
   return '<li><strong>'+esc(label)+'</strong> <span>'+esc(record?.wins??0)+'勝 '+esc(record?.losses??0)+'敗 '+esc(record?.draws??0)+'分</span> <span>'+(earned?'獲得済み':'未獲得')+'</span></li>';
  }).join('')+'</ul></details>').join('')+'</section>';
}
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
export function pvePanel({match=null,connected=false,busy=false,error='',pending=false,selected=null,picks=[],game='othello',level='normal',savedId=false,guessDraft='',build=[]}={}){
 const active=match&&Object.hasOwn(games,match.game);
 const status=active?match.turn==='finished'
  ?'確定結果：'+(match.winner==='human'?'あなたの勝ち':match.winner==='cpu'?'CPUの勝ち':'引き分け')
  :'あなたの手番（CPUの行動もサーバーで確定済み）':'';
 const body=active?(Object.hasOwn(games,match.game)&&['othello','gomoku'].includes(match.game)
  ?boardPanel(match,selected,busy,pending):match.game==='connect4'
   ?connectPanel(match,busy,pending):hiddenPanel(match,busy,pending,picks,guessDraft)):'';
 const style=active&&match.turn==='human'?build.find(row=>row.game===match.game)?.style:null;
 const hint=style?'<details><summary>攻略遺物のヒント（'+(style==='attack'?'攻め':'守り')+'）</summary><p>'+
  esc((style==='attack'?attackTactics:tactics)[match.game])+'</p></details>':'';
 const controls='<div class="duel-pve-config"><label>ゲーム<select id="pve-game">'+Object.entries(games).map(([k,v])=>'<option value="'+k+'" '+(game===k?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label><label>CPUの強さ<select id="pve-level">'+Object.entries(levels).map(([k,v])=>'<option value="'+k+'" '+(level===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'
  +'<button class="action-btn primary" data-pve-submit="start" '+(!connected||busy||pending?'disabled':'')+'>新しくCPU戦を始める</button></div>';
 return '<details class="duel-pve-panel panel" '+(active?'open':'')+'><summary>サーバーCPU攻略（PvE）'+(active?' · '+esc(games[match.game]):'')+'</summary><div class="card-body">'
  +'<p class="helper">CPUも着手・判定をサーバーで確定します。ブラウザ内の練習モードとは別です。</p>'
  +(error?'<p class="storage-warning" role="alert">'+esc(error)+'</p>':'')
  +(pending?'<p role="alert">送信結果が未確認です。新しい操作を送らず、同じ操作IDで確認してください。</p><button class="action-btn" data-pve-retry="1" '+(busy?'disabled':'')+'>前回の操作を確認する</button>':'')
  +(active?'<p class="duel-pve-status" role="status">'+esc(status)+'</p><p class="helper">難易度：'+esc(levels[match.level])+'／サーバー確定操作 '+esc(match.version)+'回</p>'+hint+body+'<button class="action-btn" data-pve-refresh="1" '+(busy?'disabled':'')+'>試合状態を再取得</button>':'')
  +(!active&&savedId?'<button class="action-btn" data-pve-resume="1" '+(busy?'disabled':'')+'>保存済みのCPU戦を開く</button>':'')
  +controls+'</div></details>';
}
