import {connect4LegalMoves,pokerHandName,pokerShowdownReason,validBluffBid} from './duel-mini-games.js?v=web-29ed04bdab6ca23f';
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
  content=`<div class="duel-connect4-head">${Array.from({length:7},(_,i)=>`<button type="button" data-duel-cell="${i}" ${can.has(i)?'':'disabled'} aria-label="${i+1}列に落とす">▼</button>`).join('')}</div>
 <div class="duel-connect4-board">${[...r.board].map(c=>`<span class="duel-connect4-space ${c==='a'?'a':c==='b'?'b':''}"><i></i></span>`).join('')}</div>`;
  note='縦・横・斜めに4個並べると勝ち。駒は列の一番下から入る。';
 }else if(r.game==='hitblow'){
  content=`<div class="duel-private"><span>自分の数字</span><strong>${h(hand||'----')}</strong><small>異なる数字4桁。相手には非公開。</small></div>
  <div class="duel-mini-hint">相手の4桁の数字を当てる。Hitは数字と位置が一致、Blowは数字だけ一致。</div>
  <div class="duel-guess-history">${(state.history??[]).slice(-40).reverse().map(x=>`<div class="duel-guess-row"><span>${x.by===me?'あなた':'相手'}</span><b>${h(x.guess)}</b><strong>${x.hit} Hit / ${x.blow} Blow</strong></div>`).join('')||'<p class="helper">予想履歴はまだありません。</p>'}</div>
  ${turn?`<div class="duel-mini-form"><input id="duel-guess" value="${h(guessDraft)}" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" placeholder="例：0123" aria-label="推理する4桁の数字"><button type="button" data-duel-act="move" data-duel-mini="hitblow" class="action-btn primary">数字を予想する</button></div>`:''}
  ${state.reveal?`<p class="duel-mini-hint">正解：${h(state.reveal.a)} / ${h(state.reveal.b)}</p>`:''}`;
  note='交互に数字を予想し、先に4 Hitで勝ち。40手で終わらなければ引き分け。';
 }else if(r.game==='bluffdice'){
  const bid=state.bid,canRaise=turn&&(bid?.by!==me),canChallenge=canRaise&&bid;
   const noHigher=!!bid&&!validBluffBid(bid,10,6),firstCount=bid?(bid.face===6?Math.min(bid.count+1,10):bid.count):1,firstFace=bid&&bid.face<6?bid.face+1:1;
  content=`<div class="duel-private"><span>自分のダイス5個</span><div class="duel-own-dice">${Array.isArray(hand)?hand.map(n=>`<b>${h(n)}</b>`).join(''):'－'}</div></div>
  <div class="duel-dual-score"><span>${h(name(a))}：${state.winsA??0}勝</span><b>先に2勝</b><span>${h(name(b))}：${state.winsB??0}勝</span></div>
  <div class="duel-dice-bid">${bid?`現在の宣言 <strong>「${bid.face}の目が ${bid.count}個以上」</strong><small>${bid.by===me?'自分の宣言':'相手の宣言'}</small>`:'個数と目を宣言してください。'}</div>
  ${turn?`<div class="duel-mini-form"><label>個数<select id="duel-bid-count">${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${bid&&i+1<bid.count?"disabled":""} ${i+1===firstCount?"selected":""}>${i+1}個</option>`).join('')}</select></label><label>目<select id="duel-bid-face">${Array.from({length:6},(_,i)=>`<option value="${i+1}" ${!validBluffBid(bid,firstCount,i+1)?"disabled":""} ${i+1===firstFace?"selected":""}>${i+1}の目</option>`).join('')}</select></label>
  <button type="button" data-duel-act="move" data-duel-mini="bid" class="action-btn primary" ${noHigher?'disabled':''}>宣言する</button>${noHigher?'<small>これ以上の宣言はできない。相手の宣言を疑ってください。</small>':''}
  ${canChallenge?'<button type="button" data-duel-act="move" data-duel-mini="challenge" class="action-btn duel-challenge">宣言を疑う</button>':''}</div>`:''}
  ${(state.history??[]).slice().reverse().map(x=>`<div class="duel-mini-round"><b>ラウンド${x.round}：${h(name(x.winner==='a'?a:b))}勝利</b><small>宣言 ${x.bid.face}の目 ${x.bid.count}個 ／ 実際 ${x.actual}個</small><small>公開：${x.diceA.join(' ')} 対 ${x.diceB.join(' ')}</small></div>`).join('')}`;
  note='各自5個のダイスを使う。前の宣言より大きな数を宣言するか、相手の宣言を疑う。宣言が正しければ宣言した人、違えば疑った人がそのラウンドの勝ち。1はワイルドではない。';
 }else if(r.game==='poker'){
  const cards=Array.isArray(hand)?hand:[],picked=new Set(picks);
  content=`<div class="duel-private"><span>自分の手札5枚</span></div>
  <div class="duel-cards">${cards.map((c,i)=>`<button type="button" class="duel-card ${cardColor(c)} ${picked.has(i)?'selected':''}" data-duel-card="${i}" ${turn?'':'disabled'}><b>${h(cardName(c))}</b><small>${picked.has(i)?'交換':'保持'}</small></button>`).join('')}</div>
  <div class="duel-mini-hint">現在の自分の役：${cards.length===5?h(pokerHandName(cards)):'確認中'}。先手：${state.doneA?'交換済み':'未確定'}　後手：${state.doneB?'交換済み':'未確定'}</div>
  ${turn?`<button type="button" class="action-btn primary duel-poker-submit" data-duel-act="move" data-duel-mini="poker">${picked.size}枚交換して確定（最大3枚）</button>`:''}
  ${state.showdown?`<div class="duel-showdown"><p>カード公開</p><span>${h(name(a))}：${state.showdown.a.map(cardName).join(' ')}（${h(pokerHandName(state.showdown.a))}）</span><span>${h(name(b))}：${state.showdown.b.map(cardName).join(' ')}（${h(pokerHandName(state.showdown.b))}）</span><p class="duel-mini-hint">${h(pokerShowdownReason(state.showdown.a,state.showdown.b))}</p></div>`:''}`;
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
