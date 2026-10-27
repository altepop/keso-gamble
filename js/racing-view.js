import { BET_TYPES, COURSE_M, CONDITIONS, GOINGS, MIN_BET, BET_STEP, RUN_MS, STYLES, WEEKLY_LIMIT, distanceAt, payoutFor, placeSlots } from './racing.js?v=20261027-racelive';
import { escapeHTML } from './progression-views.js?v=20261027-racelive';
const kp=n=>n.toLocaleString('ja-JP')+' KP';
const odd=v=>(v/10).toFixed(1)+'倍';
export const SILKS=[['#f5f5f5','#111'],['#1f1f1f','#fff'],['#e03131','#fff'],['#1c7ed6','#fff'],['#fcc419','#111'],['#2f9e44','#fff'],['#f76707','#fff'],['#f783ac','#111'],['#845ef7','#fff'],['#20c997','#111']];
const clock=time=>new Date(time).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
const badge=n=>`<span class="race-no" style="background:${SILKS[n-1][0]};color:${SILKS[n-1][1]}">${n}</span>`;

function stage(watch,state){
 const {card,result,runs,odds}=watch;
 const head=`<div class="race-stage-head"><strong>${escapeHTML(card.name)} · ${clock(card.start)}発走</strong><span id="race-clock" class="helper"></span></div>`;
 if(watch.loading)return `<section class="race-stage">${head}<p class="helper">レース情報を読み込んでいます…</p></section>`;
 if(!runs)return `<section class="race-stage">${head}<p class="race-void">投票がなかったため不成立</p><p class="helper">このゲームでは、誰も馬券を買っていないレースは行いません（大きなレースは別）。次のレースで馬券を買うと、発走後にここで観戦できます。</p></section>`;
 const done=watch.finished;
 const mine=(state.raceBets??[]).filter(b=>b.raceId===card.id);
 const table=done?`<table class="race-table race-result"><caption>着順</caption><thead><tr><th>着</th><th>馬</th><th>1着当て</th></tr></thead><tbody>${result.order.map((n,i)=>`<tr><td>${i+1}</td><td>${badge(n)} ${escapeHTML(card.horses[n-1].name)}</td><td>${odd(odds.win[n])}</td></tr>`).join('')}</tbody></table>`:'';
 const tickets=mine.length?`<p class="helper">あなたの馬券: ${mine.map(b=>`${b.horse}番 ${BET_TYPES[b.type].label} ${kp(b.amount)}${b.status==='won'?` → 的中 ${kp(b.payout)}`:b.status==='lost'?' → 外れ':done?' → 精算中（1分ほどで反映）':''}`).join(' / ')}</p>`:'';
 const proof=watch.hash?`<p class="helper race-proof">${watch.verified===true?'✓ 締切前に公開したハッシュとシード値が一致（結果は後から変えられていません）':watch.verified===false?'⚠ シード値がハッシュと一致しません。管理者に知らせてください':'シード値を確認しています…'}<br><span class="mono">${watch.hash.slice(0,16)}…</span></p>`:'';
 return `<section class="race-stage">${head}<canvas id="race-canvas" class="race-canvas" role="img" aria-label="${escapeHTML(card.name)}の映像。実況と着順は下に文字で表示します"></canvas><ol id="race-commentary" class="race-commentary"></ol>${tickets}${table}${proof}</section>`;
}

export function racePreview(card,odds,{type,horse,amount}){
 const chosen=horse&&card.horses[horse-1];
 if(!chosen)return '<p class="helper">出る馬一覧から馬を選んでください。</p>';
 const value=Number(amount),label=`${horse}番 ${escapeHTML(chosen.name)}の${BET_TYPES[type].label}・${odd(odds[type][horse])}`;
 return `<p class="helper">${label}。${Number.isSafeInteger(value)&&value>=MIN_BET?`当たれば ${kp(payoutFor(value,odds[type][horse]))}`:'金額を入れてください'}</p>`;
}
function betPanel(open,odds,draft,state,weeklyLeft){
 const {card,hash}=open,type=draft.type,horse=draft.horse;
 const rows=card.horses.map(h=>`<tr class="${horse===h.number?'selected':''}"><td><button class="race-pick" data-race-horse="${h.number}" aria-pressed="${horse===h.number}">${badge(h.number)}<span>${escapeHTML(h.name)}</span></button></td><td>${STYLES[h.style].label}<br><span class="helper">${CONDITIONS[h.condition].label}</span></td><td>${odd(odds.win[h.number])}</td><td>${odd(odds.place[h.number])}</td></tr>`).join('');
 const preview=racePreview(card,odds,draft);
 const form=`<div class="segment">${Object.entries(BET_TYPES).map(([id,t])=>`<button data-race-type="${id}" class="${type===id?'active':''}">${t.label}<small>（${t.formal}）</small></button>`).join('')}</div><div class="field"><label for="race-amount">金額（${MIN_BET} KP以上・${BET_STEP} KP単位）</label><input id="race-amount" class="input" type="number" min="${MIN_BET}" step="${BET_STEP}" inputmode="numeric"></div><div id="race-preview">${preview}</div><div class="action-row"><button class="action-btn primary" data-action="race-bet">馬券を買う</button></div><p class="helper">今週あと ${kp(weeklyLeft)} 買えます（1週間 ${kp(WEEKLY_LIMIT)} まで・月曜0時に戻ります）。</p>${hash?`<p class="helper">結果のハッシュ（締切前に公開）: <span class="mono">${hash.slice(0,16)}…</span></p>`:''}`;
 return `<section class="trade-box race-card"><h3>${escapeHTML(card.name)} · ${clock(card.start)}発走</h3><p class="helper">締切まで <span id="race-countdown">--:--</span> · ${card.size}頭 · コース ${GOINGS[card.going].label} · ${COURSE_M}m</p><table class="race-table"><caption>出る馬一覧と倍率</caption><thead><tr><th>馬</th><th>走り方・調子</th><th>1着当て</th><th>${placeSlots(card.size)}着以内当て</th></tr></thead><tbody>${rows}</tbody></table>${form}</section>`;
}

function history(state){
 const bets=(state.raceBets??[]).slice(0,10);
 return `<div class="asset-card"><h2 class="panel-title">自分の馬券</h2>${bets.length?bets.map(b=>`<div class="history-entry"><div>${clock(b.raceId)}発走 · ${b.horse}番 ${BET_TYPES[b.type].label} ${kp(b.amount)}（${odd(b.odds)}）</div><div class="helper">${b.status==='pending'?'結果待ち':b.status==='won'?`的中 +${kp(b.payout)}`:'外れ'}</div></div>`).join(''):'<p class="helper">まだ馬券を買っていません。</p>'}</div>`;
}

export function raceScreen({state,live,watch,open,openOdds,draft,weeklyLeft,tabs,nav}){
 const note=live?'本番口座のKPで遊ぶ競馬です。15分おきに発走し、発走1分前に締め切ります。着順はサーバーが決め、締切前に公開したハッシュで後から検証できます。オッズは胴元の取り分なし。':'デモの競馬です。15分おきに発走し、発走1分前に締め切ります。オッズは胴元の取り分なしで、当たる確率どおり。本番口座のKPは使いません。';
 return `<div class="screen"><header class="topbar"><div class="toprow"><h1 class="title">競馬</h1><span class="badge">${kp(state.cash)}</span></div></header>${tabs}<div class="market-disclaimer">${note}</div>${stage(watch,state)}${betPanel(open,openOdds,draft,state,weeklyLeft)}${history(state)}${nav}</div>`;
}

// ---- Canvas playback (side-scrolling, broadcast style) ----
const VIEW_M=90;
function horseShape(ctx,x,y,s,phase,[silk,ink],number){
 ctx.save();ctx.translate(x,y);
 ctx.strokeStyle='#3b2414';ctx.lineWidth=Math.max(1.5,s*.12);ctx.lineCap='round';
 const legs=[[.75,0],[.55,Math.PI],[-.55,Math.PI*.5],[-.75,Math.PI*1.5]];
 for(const [lx,off] of legs){const a=Math.sin(phase+off)*.6;ctx.beginPath();ctx.moveTo(lx*s,.15*s);ctx.lineTo(lx*s+Math.sin(a)*.55*s,.15*s+Math.cos(a)*.55*s);ctx.stroke();}
 ctx.fillStyle='#7a4a24';ctx.beginPath();ctx.ellipse(0,0,s*1.05,s*.42,0,0,Math.PI*2);ctx.fill();
 ctx.beginPath();ctx.moveTo(s*.8,-s*.1);ctx.lineTo(s*1.35,-s*.75);ctx.lineTo(s*1.6,-s*.6);ctx.lineTo(s*1.1,0);ctx.closePath();ctx.fill();
 ctx.beginPath();ctx.ellipse(s*1.55,-s*.68,s*.3,s*.16,.5,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#2a170b';ctx.beginPath();ctx.moveTo(-s,-s*.05);ctx.quadraticCurveTo(-s*1.5,-s*.1+Math.sin(phase)*s*.15,-s*1.55,s*.35);ctx.stroke();
 ctx.fillStyle='#fff';ctx.fillRect(-s*.45,-s*.3,s*.6,s*.5);
 ctx.fillStyle='#111';ctx.font=`bold ${Math.round(s*.45)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(number),-s*.15,-s*.04);
 ctx.fillStyle=silk;ctx.fillRect(-s*.1,-s*.95,s*.45,s*.6);
 ctx.beginPath();ctx.arc(s*.25,-s*1.08,s*.2,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=ink==='#fff'?'rgba(255,255,255,.5)':'rgba(0,0,0,.35)';ctx.lineWidth=1;ctx.strokeRect(-s*.1,-s*.95,s*.45,s*.6);
 ctx.restore();
}
export function drawRace(canvas,card,timeline,t,highlight=new Set()){
 const dpr=Math.min(2,globalThis.devicePixelRatio||1),W=canvas.clientWidth||320,H=canvas.clientHeight||240;
 if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);}
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);
 const numbers=card.horses.map(h=>h.number),dist=Object.fromEntries(numbers.map(n=>[n,distanceAt(timeline,n,t)]));
 const lead=Math.max(...Object.values(dist));
 const camX=Math.max(-8,Math.min(lead-VIEW_M*.65,COURSE_M+22-VIEW_M*.85)),scale=W/VIEW_M,X=m=>(m-camX)*scale;
 // sky, stands and infield
 const sky=ctx.createLinearGradient(0,0,0,H*.35);sky.addColorStop(0,'#0d2a5c');sky.addColorStop(1,'#3d6fb3');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#24456e';for(let i=-1;i<W/60+2;i++){const x=i*60-(camX*scale*.25)%60;ctx.fillRect(x,H*.2,52,H*.12);}
 ctx.fillStyle='#2f7d32';ctx.fillRect(0,H*.32,W,H*.06);
 const top=H*.38,bottom=H-6;
 ctx.fillStyle='#a8743f';ctx.fillRect(0,top,W,bottom-top);
 ctx.fillStyle='rgba(255,255,255,.06)';for(let m=Math.floor(camX/4)*4;m<camX+VIEW_M+4;m+=4)ctx.fillRect(X(m),top,1,bottom-top);
 // rail with posts every 10 m and boards every 200 m
 ctx.fillStyle='#f1f3f5';ctx.fillRect(0,top-5,W,3);
 for(let m=Math.floor(camX/10)*10;m<camX+VIEW_M+10;m+=10)ctx.fillRect(X(m)-1,top-12,2,10);
 ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';
 for(let m=Math.floor(camX/200)*200;m<camX+VIEW_M+200;m+=200)if(m>0&&m<COURSE_M){ctx.fillStyle='#fff';ctx.fillRect(X(m)-24,top-30,48,16);ctx.fillStyle='#111';ctx.fillText(`残り${COURSE_M-m}m`,X(m),top-15);}
 // finish post and start gate
 const fx=X(COURSE_M);
 if(fx>-20&&fx<W+20){for(let i=0;i<(bottom-top)/6;i++){ctx.fillStyle=i%2?'#fff':'#111';ctx.fillRect(fx-3,top+i*6,6,6);}ctx.fillStyle='#e03131';ctx.fillRect(fx-2,top-40,4,40);ctx.fillStyle='#fff';ctx.fillRect(fx-22,top-56,44,16);ctx.fillStyle='#e03131';ctx.fillText('ゴール',fx,top-41);}
 if(t<2500&&X(0)>-40){ctx.fillStyle='rgba(30,30,40,.85)';ctx.fillRect(X(0)-6,top,10,bottom-top);}
 // horses, far lane first
 const laneH=(bottom-top-10)/card.size,s=Math.max(7,Math.min(16,laneH*.62));
 for(const n of numbers){
  const y=top+8+laneH*(n-.35),x=X(dist[n]);
  if(x<-60||x>W+60)continue;
  ctx.fillStyle='rgba(255,236,200,.35)';for(let k=1;k<=3;k++){if(t>0&&dist[n]<COURSE_M){ctx.beginPath();ctx.arc(x-s*(1.3+k*.6),y+s*.6,s*.18*k,0,Math.PI*2);ctx.fill();}}
  horseShape(ctx,x,y,s,dist[n]/1.1,SILKS[n-1],n);
  const h=timeline.horses[n];
  ctx.textAlign='center';ctx.textBaseline='bottom';ctx.font='bold 12px sans-serif';
  if(h.late&&t<6000){ctx.fillStyle='#ffd43b';ctx.fillText('!?',x,y-s*1.3);}
  else if(highlight.has(n)){ctx.fillStyle='#ffd43b';ctx.fillText('▼',x+s*.2,y-s*1.3);}
 }
 // course map: everyone's position on the whole course
 ctx.fillStyle='rgba(2,8,26,.82)';ctx.fillRect(0,0,W,26);
 ctx.fillStyle='#8b9ab8';ctx.fillRect(12,13,W-24,2);
 ctx.font='10px sans-serif';ctx.textBaseline='middle';ctx.textAlign='right';ctx.fillText('ゴール',W-14,6);
 for(const n of [...numbers].sort((a,b)=>dist[a]-dist[b])){const px=12+(W-24)*Math.min(1,dist[n]/COURSE_M);ctx.fillStyle=SILKS[n-1][0];ctx.beginPath();ctx.arc(px,14,5,0,Math.PI*2);ctx.fill();ctx.fillStyle=SILKS[n-1][1];ctx.font='bold 8px sans-serif';ctx.textAlign='center';ctx.fillText(String(n),px,14.5);}
}
export const raceElapsed=(card,now)=>Math.max(0,Math.min(RUN_MS,now-card.start));
