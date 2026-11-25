// Poker presentation only. No hidden opponent cards enter the DOM before
// the server-published showdown. The server remains sole KP/winner authority.
import {pokerHandName,pokerShowdownReason} from './duel-mini-games.js?v=web-630e0735be90dea5';
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const pokerCardLabel=id=>{
 if(!Number.isInteger(id)||id<0||id>=52)return null;
 const ranks='23456789TJQKA',suits=['♠','♥','♦','♣'];
 return {rank:ranks[Math.floor(id/4)],suit:suits[id%4],red:id%4===1||id%4===2};
};
const labelRank=x=>x==='T'?'10':x;
export function pokerCardMarkup(id,{index=null,selected=false,disabled=false,showdown=false}={}){
 const card=pokerCardLabel(id);
 if(!card)return '';
 const text=labelRank(card.rank)+card.suit;
 const inner=`<span class="duel-poker-corner" aria-hidden="true"><b>${labelRank(card.rank)}</b><span>${card.suit}</span></span>
  <span class="duel-poker-center" aria-hidden="true">${card.suit}</span>
  <span class="duel-poker-card-bottom" aria-hidden="true">${labelRank(card.rank)} ${card.suit}</span>`;
 const color=card.red?'red':'black';
 if(showdown)return `<span class="duel-poker-reveal-card duel-card ${color}" role="img" aria-label="${text}">${inner}</span>`;
 return `<button type="button" class="duel-card duel-poker-hand-card ${color} ${selected?'selected':''}"
   data-duel-card="${index}" aria-label="${text}、${selected?'交換する':'保持する'}" aria-pressed="${selected?'true':'false'}"
   ${disabled?'disabled':''}>${inner}<small>${selected?'交換':'保持'}</small></button>`;
}
export function pokerView({r,state,hand,picks=[],turn,finished,a,b,name}){
 const cards=Array.isArray(hand)&&hand.length===5&&hand.every(x=>pokerCardLabel(x))?hand:[];
 const unique=cards.length===5&&new Set(cards).size===5;
 const validPicks=new Set(Array.isArray(picks)?picks.filter(x=>Number.isInteger(x)&&x>=0&&x<5).slice(0,3):[]);
 const doneA=state.doneA===true,doneB=state.doneB===true,waiting=doneA!==doneB;
 const show=finished&&state.showdown&&Array.isArray(state.showdown.a)&&Array.isArray(state.showdown.b)
  &&state.showdown.a.length===5&&state.showdown.b.length===5
  &&state.showdown.a.every(x=>pokerCardLabel(x))&&state.showdown.b.every(x=>pokerCardLabel(x));
 const steps=`<div class="duel-poker-steps" aria-label="交換の確定状況">
   <span class="${doneA?'done':''}">${h(name(a))} <b>${doneA?'交換確定':'未確定'}</b></span>
   <span aria-hidden="true">◆</span>
   <span class="${doneB?'done':''}">${h(name(b))} <b>${doneB?'交換確定':'未確定'}</b></span></div>`;
 const instruction=turn?'交換するカードを最大3枚まで選択。0枚のままでも確定できる。':
  waiting?'交換が確定したプレイヤーの手札は非公開。相手の確定を待機中。':'手札を確認。相手のカードは公開決着まで非表示。';
 const showdown=show?`<section class="duel-showdown duel-poker-showdown" data-poker-reveal="true" aria-label="確定したカードの公開">
   <div class="duel-poker-showdown-title"><span>SHOWDOWN</span><strong>カード公開</strong></div>
   ${[['a',a],['b',b]].map(([side,id])=>`<div class="duel-poker-reveal-row">
     <div class="duel-poker-reveal-name"><b>${h(name(id))}</b><strong>${h(pokerHandName(state.showdown[side]))}</strong></div>
     <div class="duel-poker-reveal-cards">${state.showdown[side].map(card=>pokerCardMarkup(card,{showdown:true})).join('')}</div>
   </div>`).join('')}
   <p class="duel-poker-verdict">${h(pokerShowdownReason(state.showdown.a,state.showdown.b))}</p>
  </section>`:'';
 return `<section class="duel-poker-table" data-poker-match="${h(r.id)}" data-poker-version="${Number(r.version)||0}"
   data-poker-revealed="${show?'true':'false'}" data-poker-done="${Number(doneA)}:${Number(doneB)}">
   <div class="duel-poker-table-head"><strong>5-CARD DRAW</strong><span>各自1回・最大3枚交換</span></div>
   ${steps}
   <div class="duel-private duel-poker-private"><span>あなたの手札5枚 <small>相手には非公開</small></span>
    <div class="duel-cards duel-poker-hand" role="group" aria-label="自分のポーカー手札">
     ${unique?cards.map((c,i)=>pokerCardMarkup(c,{index:i,selected:validPicks.has(i),disabled:!turn})).join(''):
       '<span class="duel-poker-wait">手札を確認中</span>'}
    </div>
   </div>
   <div class="duel-poker-choice-summary">
     <span>現在の役：<strong>${unique?h(pokerHandName(cards)):'確認中'}</strong></span>
     <span class="duel-poker-selected-count">交換予定 <b>${turn?validPicks.size:0}</b> / 3 枚</span>
   </div>
   <p class="duel-poker-guide">${instruction}</p>
   ${turn?`<button type="button" class="action-btn primary duel-poker-submit" data-duel-act="move" data-duel-mini="poker">
       ${validPicks.size?validPicks.size+'枚を交換して確定':'交換せず確定'}
     </button>`:''}
   ${showdown}
 </section>`;
}
