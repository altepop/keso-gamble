// Pure, server-authoritative Bluff Dice view. No API or private opponent hand.
import {nextBluffBid,bluffBidEvidence,validBluffBid} from './duel-mini-games.js?v=web-630e0735be90dea5';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pips=Array.from({length:9},()=>'<span class="duel-bluff-pip"></span>').join('');
export function bluffDie(value,{revealed=false}={}){
 const n=Number(value),valid=Number.isInteger(n)&&n>=1&&n<=6;
 return `<span class="duel-bluff-die ${revealed?'duel-bluff-revealed-die':''}" data-value="${valid?n:0}" role="img" aria-label="${valid?n+'の目':'未確認'}"><span class="duel-bluff-pips" aria-hidden="true">${pips}</span></span>`;
}
const diceRow=values=>Array.from({length:5},(_,i)=>bluffDie(Array.isArray(values)?values[i]:null,{revealed:true})).join('');
export function bluffDiceView({r,state,hand,turn,me,a,b,name}){
 const round=Number(state.round)||1;
 const history=Array.isArray(state.history)?state.history:[];
 const last=history.at(-1);
 const bid=state.bid&&Number.isInteger(state.bid.count)&&Number.isInteger(state.bid.face)?state.bid:null;
 const next=nextBluffBid(bid);
 const canChallenge=turn&&bid&&bid.by!==me;
 const evidence=bid?bluffBidEvidence(hand,bid):null;
 const probability=evidence?`<p class="duel-bluff-odds">手元に${bid.face}の目 ${evidence.own}個 ／ 未公開の相手5個を公平なダイスと仮定すると、宣言成立は約 <strong>${Math.round(evidence.chance*100)}%</strong><small>相手の出目を見た数字ではなく、確率上の目安。</small></p>`:'';
 const handHtml=`<div class="duel-private duel-bluff-hand"><span>あなたのダイス5個 <small>相手には非公開</small></span>
  <div class="duel-own-dice" role="group" aria-label="自分のダイス">
   ${Array.from({length:5},(_,i)=>bluffDie(Array.isArray(hand)?hand[i]:null)).join('')}
  </div></div>`;
 const latest=last&&Array.isArray(last.diceA)&&Array.isArray(last.diceB)
  ?`<div class="duel-bluff-showdown duel-mini-round" data-bluff-resolved-round="${Number(last.round)||0}">
   <div class="duel-bluff-reveal-heading"><span>ラウンド${escape(last.round)} · 結果公開</span>
    <strong>${escape(name(last.winner==='a'?a:b))} のラウンド勝利</strong></div>
   <p>「${escape(last.bid?.face)} の目が ${escape(last.bid?.count)} 個以上」→ 実際は <b>${escape(last.actual)} 個</b></p>
   <div class="duel-bluff-reveal-row"><span>${escape(name(a))}</span><div class="duel-bluff-reveal-dice">${diceRow(last.diceA)}</div></div>
   <div class="duel-bluff-reveal-row"><span>${escape(name(b))}</span><div class="duel-bluff-reveal-dice">${diceRow(last.diceB)}</div></div>
   <div class="duel-bluff-verdict">${Number(last.actual)>=Number(last.bid?.count)?'宣言は本当だった！':'ブラフを見破った！'}</div>
  </div>`:'';
 const summary=history.slice().reverse().map(x=>`<div class="duel-bluff-history-item"><b>ラウンド${escape(x.round)}：${escape(name(x.winner==='a'?a:b))}勝利</b>
  <small>宣言 ${escape(x.bid?.face)} の目 ${escape(x.bid?.count)}個 ／ 実際 ${escape(x.actual)}個</small></div>`).join('');
 const actions=turn?`<div class="duel-mini-form duel-bluff-actions">
  <label>個数<select id="duel-bid-count" aria-label="宣言する個数">
   ${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${!next||i+1<next.count?'disabled':''} ${i+1===next?.count?'selected':''}>${i+1}個</option>`).join('')}
  </select></label>
  <label>目<select id="duel-bid-face" aria-label="宣言する出目">
   ${Array.from({length:6},(_,i)=>`<option value="${i+1}" ${!next||!validBluffBid(bid,next.count,i+1)?'disabled':''} ${i+1===next?.face?'selected':''}>${i+1}の目</option>`).join('')}
  </select></label>
  <button type="button" data-duel-act="move" data-duel-mini="bid" class="action-btn primary" ${!next?'disabled':''}>宣言する</button>
  ${canChallenge?'<button type="button" data-duel-act="move" data-duel-mini="challenge" class="action-btn duel-challenge">疑う！ 出目を公開</button>':''}
  ${!next?'<small>これ以上の宣言はできない。相手の宣言を疑ってください。</small>':''}
 </div>`:'';
 return `<section class="duel-bluff-table" data-bluff-match="${escape(r.id)}" data-bluff-version="${Number(r.version)||0}"
  data-bluff-round="${round}" data-bluff-history-count="${history.length}"
  data-bluff-bid="${bid?`${bid.count}:${bid.face}:${escape(bid.by)}`:''}"
  data-bluff-last="${last?`${escape(last.round)}:${escape(last.bid?.count)}:${escape(last.bid?.face)}:${escape(last.bid?.by)}`:''}">
  <div class="duel-bluff-header"><span>ROUND ${round}</span><strong>先に2勝</strong></div>
  <div class="duel-dual-score duel-bluff-score" aria-label="ラウンド勝利数">
   <span>${escape(name(a))} <b>${Number(state.winsA)||0}</b></span>
   <span class="duel-bluff-score-divider">VS</span>
   <span>${escape(name(b))} <b>${Number(state.winsB)||0}</b></span>
  </div>
  ${handHtml}
  <div class="duel-dice-bid duel-bluff-claim" aria-live="polite">
   <span>${bid?'現在の宣言':'あなたの読み合いが始まる'}</span>
   ${bid?`<div class="duel-bluff-claim-main">${bluffDie(bid.face)}<strong>${escape(bid.face)} の目 × ${escape(bid.count)} 個以上</strong></div>
     <small>${bid.by===me?'あなたの宣言':'相手の宣言'}：信じて上げるか、疑うか</small>${probability}`
      :'<strong>宣言する出目と個数を選ぼう</strong><small>相手の5個の出目は見えない。1はワイルドではない。</small>'}
  </div>
  ${actions}
  ${latest}
  ${history.length?`<details class="duel-bluff-history"><summary>過去の結果（${history.length}ラウンド）</summary>${summary}</details>`:''}
 </section>`;
}
