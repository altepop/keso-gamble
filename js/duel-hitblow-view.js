// Hit & Blow UI only. Derive possibilities from the viewer's own public
// guesses and feedback. Never access or infer a private opponent secret.
import {hitBlowAnswer} from './duel-mini-games.js?v=web-630e0735be90dea5';
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isCode=code=>typeof code==='string'&&/^[0-9]{4}$/.test(code)&&new Set(code).size===4;
const allCodes=(()=>{
 const codes=[];
 for(let a=0;a<10;a++)for(let b=0;b<10;b++)for(let c=0;c<10;c++)for(let d=0;d<10;d++){
  if(new Set([a,b,c,d]).size===4)codes.push(''+a+b+c+d);
 }
 return codes;
})();
const candidateCache=new Map();
export function hitBlowRemaining(history,side){
 if(!Array.isArray(history)||!['a','b'].includes(side))return null;
 const own=history.filter(x=>x?.by===side);
 if(own.some(x=>!isCode(x.guess)||!Number.isInteger(x.hit)||!Number.isInteger(x.blow)||
      x.hit<0||x.blow<0||x.hit+x.blow>4))return null;
 const key=own.map(x=>x.guess+':'+x.hit+':'+x.blow).join('|');
 if(candidateCache.has(key))return candidateCache.get(key);
 let remaining=0;
 for(const code of allCodes){
  if(own.every(x=>{
   const result=hitBlowAnswer(x.guess,code);
   return result.hit===x.hit&&result.blow===x.blow;
  }))remaining++;
 }
 if(candidateCache.size>=64)candidateCache.clear();
 candidateCache.set(key,remaining);
 return remaining;
}
export function hitBlowDraftStatus(draft){
 if(!draft)return {valid:false,message:'異なる数字4桁を入力（先頭の0も使用可能）'};
 if(!/^[0-9]*$/.test(draft))return {valid:false,message:'数字だけを入力してください'};
 if(draft.length!==4)return {valid:false,message:'あと'+Math.max(0,4-draft.length)+'桁で完成'};
 if(new Set(draft).size!==4)return {valid:false,message:'同じ数字は使えません'};
 return {valid:true,message:'入力OK。この4桁で予想できる'};
}
const tiles=(code,secret=false)=>Array.from({length:4},(_,i)=>`<span class="duel-hb-digit" aria-label="${secret?'自分の番号':''}${i+1}桁目">${h(code?.[i]??'–')}</span>`).join('');
export function hitBlowView({r,state,hand,turn,me,finished,guessDraft=''}) {
 const history=Array.isArray(state.history)?state.history:[];
 const own=history.filter(x=>x?.by===me),theirs=history.filter(x=>x?.by!==me);
 const remaining=hitBlowRemaining(history,me);
 const draft=hitBlowDraftStatus(guessDraft);
 const reveal=finished&&state.reveal&&isCode(state.reveal.a)&&isCode(state.reveal.b);
 const last=history.at(-1);
 const fourHit=finished&&reveal&&last?.hit===4&&last?.blow===0;
 const progress=remaining===null?0:Math.min(100,Math.max(0,100*(5040-remaining)/5040));
 const rows=history.slice(-40).reverse().map((x,i)=>{
  const good=x.by===me,hit=Number(x.hit)||0,blow=Number(x.blow)||0;
  const key=`${x.by}:${x.guess}:${hit}:${blow}`;
  return `<div class="duel-guess-row duel-hb-row ${good?'own':'opponent'}" data-hb-history="${h(key)}">
     <span class="duel-hb-side">${good?'あなた':'相手'}</span>
     <b class="duel-hb-guess" aria-label="予想 ${h(x.guess)}">${tiles(String(x.guess??''))}</b>
     <strong class="duel-hb-feedback"><span class="duel-hb-hit">${hit} Hit</span><span class="duel-hb-blow">${blow} Blow</span></strong>
   </div>`;
 }).join('');
 return `<section class="duel-hb-table" data-hb-match="${h(r.id)}" data-hb-version="${Number(r.version)||0}"
  data-hb-history-count="${history.length}" data-hb-last="${last?`${h(last.by)}:${h(last.guess)}:${Number(last.hit)||0}:${Number(last.blow)||0}`:''}">
  <div class="duel-private duel-hb-private"><span>自分の秘密番号 <small>相手には非公開</small></span>
   <div class="duel-hb-own-code" role="group" aria-label="自分の秘密番号">${tiles(isCode(hand)?hand:'----',true)}</div>
  </div>
  <div class="duel-hb-intro"><strong>HIT &amp; BLOW</strong><span>Hit：数字と位置が一致　／　Blow：数字だけ一致</span></div>
  <div class="duel-hb-logic"><div><span>あなたの推理 ${own.length}回</span><span>相手の推理 ${theirs.length}回</span></div>
   <p>自分の公開済みヒントから絞った残り候補 <strong>${remaining===null?'確認中':remaining.toLocaleString('ja-JP')} 通り</strong><small>初期 5,040通り。相手の秘密番号は参照していない。</small></p>
   <div class="duel-hb-progress" role="progressbar" aria-label="候補を絞り込んだ割合" aria-valuenow="${Math.round(progress)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress.toFixed(2)}%"></span></div>
  </div>
  ${turn?`<div class="duel-hb-entry">
    <label for="duel-guess">次に予想する4桁</label>
    <div class="duel-mini-form duel-hb-entry-row">
      <input id="duel-guess" type="text" inputmode="numeric" autocomplete="off" autocapitalize="off" spellcheck="false"
       value="${h(guessDraft)}" maxlength="4" pattern="[0-9]{4}" placeholder="例：0123"
       aria-label="推理する4桁の数字" aria-describedby="duel-hb-draft-help">
      <button type="button" data-duel-act="move" data-duel-mini="hitblow" class="action-btn primary duel-hb-submit">予想を確定</button>
    </div>
    <p id="duel-hb-draft-help" class="duel-hb-draft-help ${draft.valid?'valid':''}" role="status">${draft.message}</p>
  </div>`:''}
  <div class="duel-hb-history-head"><strong>推理の履歴</strong><small>最新が上</small></div>
  <div class="duel-guess-history duel-hb-history">${rows||'<p class="helper">まだ予想はありません。最初の4桁を選ぼう。</p>'}</div>
  ${reveal?`<div class="duel-hb-code-reveal" role="status">
    <strong>${fourHit?'4 HIT! CODE BREAKER':'正解を公開'}</strong>
    <p>プレイヤーA ${h(state.reveal.a)} ／ プレイヤーB ${h(state.reveal.b)}</p>
  </div>`:''}
 </section>`;
}
