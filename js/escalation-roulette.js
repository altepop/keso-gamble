// Visual-only replay of a server-settled VALORANT Escalation reward.
// The roulette NEVER submits, chooses or changes KP. Replays cannot pay twice.
export const BIG_ESC_TIERS=[
 {weight:4000,amount:500,color:'#206e91'},
 {weight:3000,amount:1000,color:'#3654a5'},
 {weight:2000,amount:2500,color:'#673db4'},
 {weight:800,amount:5000,color:'#b77927'},
 {weight:200,amount:15000,color:'#efc65b'},
];
export const SUPER_ESC_TIERS=[
 {weight:5000,amount:10000,color:'#245c9d'},
 {weight:3000,amount:30000,color:'#7448b7'},
 {weight:1500,amount:100000,color:'#b87829'},
 {weight:450,amount:300000,color:'#db9d2f'},
 {weight:50,amount:1000000,color:'#fff1ad'},
];
const HALF_ESC_TIERS=[
 {weight:1800,label:'残高',color:'#2b3346'},
 {weight:1800,label:'照会',color:'#43506c'},
 {weight:2800,label:'½',color:'#9f243c'},
 {weight:1800,label:'清算',color:'#493045'},
 {weight:1800,label:'確定',color:'#362433'},
];
const fmt=n=>Math.trunc(n).toLocaleString('ja-JP');
const money=n=>fmt(Math.abs(n))+' KP';
export function wheelSectors(tiers){
 const total=tiers.reduce((sum,t)=>sum+t.weight,0);
 if(total!==10000)throw Error('Invalid roulette weights');
 let start=0;
 return tiers.map((tier,i)=>{
  const begin=start/10000*360,end=(start+tier.weight)/10000*360;
  start+=tier.weight;
  return {...tier,index:i+1,start:begin,end,center:(begin+end)/2};
 });
}
export function targetRotation(sectors,tier,turns=8){
 const found=sectors.find(s=>s.index===tier);
 if(!found)throw Error('Invalid roulette tier');
 return turns*360-found.center;
}
export function escalationWheelModel(spin){
 if(!spin||!['big','super-lucky','super-unlucky'].includes(spin.kind))throw Error('Invalid wheel outcome');
 const tiers=spin.kind==='big'?BIG_ESC_TIERS:spin.kind==='super-lucky'?SUPER_ESC_TIERS:HALF_ESC_TIERS;
 const sectors=wheelSectors(tiers);
 const stop=spin.kind==='super-unlucky'?3:spin.tier;
 if(!Number.isInteger(stop)||stop<1||stop>5)throw Error('Invalid wheel prize');
 const negative=spin.kind==='super-unlucky'||(spin.kind==='big'&&spin.award<0);
 return {sectors,stop,negative,rotation:targetRotation(sectors,stop,spin.kind==='super-lucky'?10:8)};
}
const escapeHTML=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const currentAmount=spin=>spin.kind==='super-unlucky'?
 '−'+money(spin.beforeBalance-spin.afterBalance):
 (spin.kind==='big'&&spin.award<0?'−':'+')+money(spin.award);
function wheelInfo(spin){
 const title=spin.kind==='big'?'🎰 エスカ大勝負':spin.kind==='super-lucky'?'🌈 超ラッキー':'💀 超アンラッキー';
 const subtitle=spin.kind==='big'?'5段階の大勝負':spin.kind==='super-lucky'?'特別賞金抽選':'手持ちKP半額のお知らせ';
 return {title,subtitle};
}
export function makeEscalationWheel(spin,close=()=>{}){
 const m=escalationWheelModel(spin),info=wheelInfo(spin);
 const root=document.createElement('div');root.className='esc-roulette-backdrop';
 root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','エスカレーションのルーレット');
 const ring=m.sectors.map(s=>`${s.color} ${s.start.toFixed(4)}deg ${s.end.toFixed(4)}deg`).join(',');
 const tags=m.sectors.filter(s=>s.end-s.start>=10).map(s=>{
   const radians=s.center*Math.PI/180;
   const x=50+35*Math.sin(radians),y=50-35*Math.cos(radians);
   const label=spin.kind==='super-unlucky'?s.label:s.index===5?'Ⅴ':spin.kind==='big'?money(s.amount).replace(' KP',''):money(s.amount).replace(' KP','');
   return `<span class="esc-wheel-label" style="left:${x.toFixed(3)}%;top:${y.toFixed(3)}%">${escapeHTML(label)}</span>`;
 }).join('');
 const showBalance=spin.kind!=='big';
 root.innerHTML=`<div class="esc-roulette-card ${m.negative?'danger':''}">
   <div class="esc-roulette-head"><span class="esc-roulette-kicker">1通のお知らせです。</span><button class="esc-roulette-close" aria-label="閉じる" type="button">×</button></div>
   <h2>${info.title}</h2><p class="esc-roulette-sub">${info.subtitle} · 確定した結果を再生</p>
   <div class="esc-wheel-stage">
     <div class="esc-wheel-pointer" aria-hidden="true"></div>
     <div class="esc-wheel-spinner" style="background:conic-gradient(${ring})">${tags}<div class="esc-wheel-core"><span>KESO</span><b>PLAY</b></div></div>
     <div class="esc-wheel-ball-orbit" aria-hidden="true"><div class="esc-wheel-ball"></div></div>
   </div>
   <p class="esc-wheel-phase" aria-live="polite">ルーレットが回転しています…</p>
   <div class="esc-roulette-result" aria-live="polite" hidden>
     <small>${m.negative?'減額確定':'獲得確定'}</small><strong>${currentAmount(spin)}</strong>
     ${showBalance?`<p>手持ちKP　${fmt(spin.beforeBalance)} → <b>${fmt(spin.afterBalance)} KP</b></p>`:`<p>第${spin.tier}段階・${spin.award>=0?'勝利':'敗北'}の結果</p>`}
   </div>
   <div class="esc-roulette-footer"><button type="button" class="esc-wheel-skip">演出をスキップ</button><button type="button" class="esc-wheel-dismiss" hidden>確認しました</button></div>
   <p class="esc-wheel-disclaimer">抽選とKPの精算はサーバー側で完了済みだ。演出の再生・スキップで金額は変わらない。</p>
 </div>`;
 document.body.append(root);document.body.classList.add('esc-wheel-open');
 const spinner=root.querySelector('.esc-wheel-spinner'),ball=root.querySelector('.esc-wheel-ball-orbit');
 const skip=root.querySelector('.esc-wheel-skip'),dismiss=root.querySelector('.esc-wheel-dismiss');
 const phase=root.querySelector('.esc-wheel-phase'),result=root.querySelector('.esc-roulette-result');
 const ms=spin.kind==='super-lucky'?8500:spin.kind==='super-unlucky'?7200:6100;
 let finished=false,timer;
 const finish=()=>{
  if(finished)return;
  finished=true;clearTimeout(timer);
  spinner.style.transition='none';spinner.style.transform=`rotate(${m.rotation}deg)`;
  ball.style.transition='none';ball.style.transform='rotate(0deg)';
  result.hidden=false;dismiss.hidden=false;skip.hidden=true;
  phase.textContent='結果が確定しました。';
  root.classList.add('esc-wheel-finished');
 };
 const shut=()=>{clearTimeout(timer);root.remove();document.body.classList.remove('esc-wheel-open');close();};
 root.querySelector('.esc-roulette-close').addEventListener('click',shut);
 dismiss.addEventListener('click',shut);
 skip.addEventListener('click',finish);
 root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();shut();}});
 // Give the initial frame a paint, so the browser must animate 8-10 complete revolutions.
 if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){finish();}
 else {
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   if(!root.isConnected)return;
   spinner.style.transition=`transform ${ms}ms cubic-bezier(.12,.76,.14,1)`;
   ball.style.transition=`transform ${ms}ms cubic-bezier(.1,.70,.11,1)`;
   spinner.style.transform=`rotate(${m.rotation}deg)`;
   ball.style.transform='rotate(-3240deg)';
   timer=setTimeout(finish,ms+150);
  }));
 }
 skip.focus();
 return root;
}
