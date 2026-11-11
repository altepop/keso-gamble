// Client-only replay of an already paid Hold & Respin bonus.
// Every coin and respin came from the server's crypto draw inside the original single slot operation.
import {TEMPLE_SIZE,TEMPLE_RESPINS,templeGridAt,templeCoinKP} from './slot-temple.js?v=web-b58f659eecfb7ce3';
const number=n=>Math.floor(n).toLocaleString('ja-JP');
const coinFace=(bet,units)=>units>=100
 ?`<span class="maya-coin-top">${units>=300?'SOLAR':'GOLD'}</span><strong>${number(templeCoinKP(bet,units))}</strong><small>KP</small>`
 :`<span class="maya-coin-top">✧</span><strong>${number(templeCoinKP(bet,units))}</strong><small>KP</small>`;
export function templeBoard(bonus,bet,step=0,{backdrop=false}={}){
 const grid=templeGridAt(bonus,step),revealed=step>0?(bonus.steps?.[step-1]?.landed??[]).map(x=>x.cell):[];
 const cells=grid.map((units,i)=>{
  const present=units>0,arriving=revealed.includes(i),rich=units>=50;
  return `<span class="maya-cell ${present?'locked':'open'} ${arriving?'arriving':''} ${rich?'rare':''}" ${present?`aria-label="${number(templeCoinKP(bet,units))} KPの黄金コイン"`:'aria-label="再抽選待ち"'}><span class="maya-cell-back"></span>${present?`<span class="maya-coin">${coinFace(bet,units)}</span>`:`<span class="maya-ghost">✦</span>`}</span>`;
 }).join('');
 return `<div class="maya-board ${backdrop?'as-backdrop':''}" role="img" aria-label="黄金コインを固定する5列3段の15マス盤面">${cells}</div>`;
}
export function templeRespinScene(reveal){
 const {done}=reveal,bonus=done?.bonus;
 if(!bonus||bonus.mode!=='respin')return '';
 const step=Math.max(0,Math.min(bonus.steps.length,Number(reveal.step)||0));
 const remaining=step===0?TEMPLE_RESPINS:bonus.steps[step-1].remaining;
 const grid=templeGridAt(bonus,step);
 const unitSum=grid.reduce((a,b)=>a+b,0);
 const running=templeCoinKP(done.bet,unitSum);
 const last=step?bonus.steps[step-1]:null,arrivals=last?.landed?.length||0;
 const finished=step>=bonus.steps.length,full=bonus.filled&&finished;
 const title=finished?'黄金の祝福が完成':'黄金コインを集めろ';
 const right=Array.from({length:TEMPLE_RESPINS},(_,i)=>`<span class="${i<remaining?'lit':'out'}">${i<remaining?'◆':'◇'}</span>`).join('');
 const status=finished?(full?'15マス制覇！ フルボードボーナス！':'フィーチャー終了 · 獲得額を集計中')
  :step===0?'最初の6枚を固定。空きマスだけを再抽選する'
   :arrivals?`黄金コイン +${arrivals}！ 残り回数が3回に回復！`:'新しいコインなし。残り回数が1回減少';
 return `<div class="slot-ceremony maya-scene" role="dialog" aria-modal="true" aria-label="黄金マヤ文明風フィーチャーゲーム">
   <div class="maya-sky" aria-hidden="true"><span class="maya-sun-stone">☼</span><span class="maya-obelisk left">◈</span><span class="maya-obelisk right">◈</span></div>
   <button type="button" class="slot-close" data-action="slot-close-reveal" aria-label="演出を閉じる">×</button>
   <div class="maya-cabinet">
    <div class="maya-jackpots"><span>✧ MINI<br><strong>10×</strong></span><span>✦ MAJOR<br><strong>30×</strong></span><span>☼ GRAND<br><strong>200×</strong></span></div>
    <div class="maya-nameplate"><span class="maya-mask" aria-hidden="true">☼</span><div><small>THE LOST SUN TEMPLE</small><h2>黄金神殿<span>フィーチャーゲーム</span></h2></div><span class="maya-mask" aria-hidden="true">☼</span></div>
    <div class="maya-machine">
     <div class="maya-respin-left" aria-label="残り再抽選回数"><small>RESPINS</small><strong>${remaining}</strong><span>LEFT</span></div>
     ${templeBoard(bonus,done.bet,step)}
     <div class="maya-respin-right" aria-hidden="true"><small>RESPINS</small><div>${right}</div><strong>${remaining}</strong></div>
    </div>
    <div class="maya-progress"><div><small>LOCKED COINS</small><strong>${grid.filter(Boolean).length}<span> / ${TEMPLE_SIZE}</span></strong></div><div><small>ACCUMULATED</small><strong>${number(running)} <span>KP</span></strong></div></div>
    ${full?`<div class="maya-full-award">✦ FULL BOARD · 特等賞 ${number(templeCoinKP(done.bet,bonus.fillUnits||0))} KP（総額） ✦</div>`:''}
    <p class="maya-status" role="status" aria-live="polite">${status}</p>
    <div class="maya-bottom"><span class="maya-bet">BET ${number(done.bet)} KP</span><span class="maya-step">${finished?'BONUS COMPLETE':`RESPIN ${step+1}`}</span><button type="button" data-action="slot-feature-skip" class="maya-skip">${finished?'WINを見る ›':'スキップ »'}</button></div>
    <p class="maya-safety">報酬はスピン時に確定済み · 再抽選は演出として自動再生</p>
   </div>
 </div>`;
}
export function templeWinBackdrop(done){
 const bonus=done?.bonus;
 if(bonus?.mode!=='respin')return '';
 return `<div class="maya-win-backdrop" aria-hidden="true">${templeBoard(bonus,done.bet,bonus.steps.length,{backdrop:true})}</div>`;
}
