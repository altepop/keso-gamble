/**
 * KESO PLAY — the big-win show for casino results (original design; no third-party art, music or voice).
 *
 * A win of 8× the bet or more takes over the screen: a gold BIG WIN title, the amount counting up, coins and sparkles.
 * Bigger wins climb on the way up — BIG WIN → MEGA WIN → SUPER MEGA WIN — and a jackpot is its own show. With 効果音
 * on, the count has a coin shower, each step a fanfare, and an announcer calls the title. Tap to skip the count; tap
 * again (or wait) to close. The show is display only: the wallet was already settled by the server.
 */
import {play,announce,stopAnnounce} from './sfx.js?v=web-e00ff8b2a251354e';

export const BIG_WIN_TIERS=Object.freeze([
 {id:'big',label:'BIG WIN',call:'Big win!',at:8},
 {id:'mega',label:'MEGA WIN',call:'Mega win!',at:20},
 {id:'super',label:'SUPER MEGA WIN',call:'Super mega win!',at:50},
]);
const JACKPOT={id:'jackpot',label:'JACKPOT',call:'Jackpot!',at:0};

/** The tiers a result climbs through (empty when it is not a big win). 100,000 KP or more is at least BIG WIN. */
export function bigWinSteps(net,bet,{jackpot=false}={}){
 if(!Number.isFinite(net)||net<=0)return [];
 if(jackpot)return [JACKPOT];
 const multiple=bet>0?net/bet:0;
 const steps=BIG_WIN_TIERS.filter(t=>multiple>=t.at);
 return steps.length?steps:net>=100000?[BIG_WIN_TIERS[0]]:[];
}

let active=null;
const fmt=n=>Math.round(n).toLocaleString('ja-JP');
const ease=x=>1-Math.pow(1-x,3);

/** Shows the big-win overlay; resolves when it closes. Returns false (and shows nothing) for a normal win. */
export function showBigWin(net,bet,{jackpot=false,reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches}={}){
 const steps=bigWinSteps(net,bet,{jackpot});
 if(!steps.length||typeof document==='undefined')return false;
 active?.close();
 const top=steps[steps.length-1],duration=reducedMotion?0:({big:3200,mega:4800,super:6400,jackpot:6400})[top.id];
 const root=document.createElement('div');
 root.className=`bigwin bigwin-${steps[0].id}`;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',`${top.label} +${fmt(net)} KP`);
 root.innerHTML=`<div class="bigwin-rays" aria-hidden="true"></div><div class="bigwin-coins" aria-hidden="true">${reducedMotion?'':Array.from({length:26},(_,i)=>`<i style="--x:${(i*37)%100}%;--d:${(1.4+((i*13)%10)/7).toFixed(2)}s;--delay:${((i*7)%20)/10}s;--s:${(0.7+((i*11)%6)/10).toFixed(2)}"></i>`).join('')}</div>
 <div class="bigwin-card"><div class="bigwin-title" data-bigwin-title>${steps[0].label}</div><div class="bigwin-amount"><span data-bigwin-count>0</span><small>KP</small></div><p class="bigwin-hint">タップでスキップ</p></div>
 <div class="bigwin-sparks" aria-hidden="true">${reducedMotion?'':Array.from({length:18},(_,i)=>`<b style="--x:${(i*53)%100}%;--y:${(i*29)%100}%;--delay:${((i*3)%12)/10}s"></b>`).join('')}</div>`;
 document.body.append(root);
 const title=root.querySelector('[data-bigwin-title]'),count=root.querySelector('[data-bigwin-count]');
 let shown=0,frame=0,finished=false,closeTimer=0,resolveClose;
 const done=new Promise(resolve=>{resolveClose=resolve;});
 // Each step takes over when the count passes its share of the amount.
 const marks=steps.map((s,i)=>({...s,from:i===0?0:net*(s.at/top.at)*.92}));
 const reach=index=>{const s=marks[index];root.className=`bigwin bigwin-${s.id}`;title.textContent=s.label;title.classList.remove('bigwin-pop');void title.offsetWidth;title.classList.add('bigwin-pop');
  play(index===0?'rise':'fanfare',{level:index+1,duration:.9});announce(s.call);};
 const finish=()=>{if(finished)return;finished=true;cancelAnimationFrame(frame);count.textContent=fmt(net);
  if(shown<marks.length-1)reach(marks.length-1);shown=marks.length-1;
  root.classList.add('bigwin-done');root.querySelector('.bigwin-hint').textContent='タップで閉じる';
  play(top.id==='big'?'fanfare':'bigwin',{level:marks.length});closeTimer=setTimeout(close,2600);};
 const close=()=>{if(!root.isConnected)return;clearTimeout(closeTimer);cancelAnimationFrame(frame);stopAnnounce();root.remove();if(active?.root===root)active=null;resolveClose();};
 root.addEventListener('click',()=>finished?close():finish());
 reach(0);
 if(!duration)finish();
 else{
  play('coins',{duration:duration/1000});
  const start=performance.now();
  const tick=now=>{const p=Math.min(1,(now-start)/duration),value=net*ease(p);count.textContent=fmt(value);
   while(shown<marks.length-1&&value>=marks[shown+1].from)reach(++shown);
   if(p<1)frame=requestAnimationFrame(tick);else finish();};
  frame=requestAnimationFrame(tick);
 }
 active={root,close};
 return done;
}
