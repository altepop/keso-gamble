import { escapeHTML } from './progression-views.js?v=web-d2f34f566250e53f';
// 資産 → メンバーのKP推移: everyone's KP (KP − 借KP) at the end of each day, from /api/kp/trend. The chart draws one
// line per member (loaded when a period is chosen, like システムの状態); the list below sorts by person (今のKP・期間の増減・名前) and picks whose line stands out.
// Colors follow the member (fixed order by account), never their rank, so re-sorting never repaints a line.
export const TREND_COLORS=['#3987e5','#d95926','#199e70','#c98500','#d55181','#008300','#9085e9','#e66767'];
export const TREND_SORTS=[['now','今のKP'],['change','期間の増減'],['name','名前']];
const kp=n=>(n<0?'−':'')+Math.abs(n).toLocaleString('ja-JP')+' KP';
const signed=n=>(n>0?'+':n<0?'−':'±')+Math.abs(n).toLocaleString('ja-JP');
const short=n=>{const a=Math.abs(n),s=n<0?'−':'';return a>=10000?s+(a/10000).toFixed(a>=100000?0:1).replace(/\.0$/,'')+'万':s+a.toLocaleString('ja-JP');};

/** Members in list order. dir 1 = largest / あ first. */
export function sortTrend(members,key='now',dir=1){
 const value=m=>key==='change'?m.points.at(-1)-m.points[0]:m.points.at(-1);
 return [...members].sort((a,b)=>key==='name'?dir*a.name.localeCompare(b.name,'ja'):dir*(value(b)-value(a))||a.name.localeCompare(b.name,'ja'));
}
const colorOf=(trend,id)=>{const i=trend.members.findIndex(m=>m.id===id);return i>=0&&i<TREND_COLORS.length?TREND_COLORS[i]:null;};

function chart(trend,focus,day){
 const W=320,H=170,L=44,R=8,T=10,B=22,n=trend.days.length;
 const shown=trend.members.slice(0,TREND_COLORS.length);
 const all=shown.flatMap(m=>m.points);let lo=Math.min(0,...all),hi=Math.max(0,...all);if(hi===lo)hi=lo+1000;
 const pad=(hi-lo)*0.06;lo=lo<0?lo-pad:lo;hi+=pad;
 const x=i=>L+(n===1?0:i*(W-L-R)/(n-1)),y=v=>T+(hi-v)*(H-T-B)/(hi-lo);
 // Top, 0 and bottom; a label too close to one already placed is dropped (0 keeps its line).
 const ticks=[hi-pad,0,lo<0?lo+pad:null].filter((v,i,a)=>v!==null&&a.indexOf(v)===i);
 const placed=[];
 const grid=ticks.map(v=>{const at=y(v),label=placed.every(p=>Math.abs(p-at)>=12);if(label)placed.push(at);
  return `<line x1="${L}" x2="${W-R}" y1="${at.toFixed(1)}" y2="${at.toFixed(1)}" class="${v===0?'trend-zero':'trend-grid'}"/>${label?`<text x="${L-6}" y="${(at+3.5).toFixed(1)}" class="trend-axis" text-anchor="end">${short(Math.round(v))}</text>`:''}`;}).join('');
 const xs=[0,Math.floor((n-1)/2),n-1].filter((v,i,a)=>a.indexOf(v)===i).map(i=>`<text x="${x(i).toFixed(1)}" y="${H-6}" class="trend-axis" text-anchor="${i===0?'start':i===n-1?'end':'middle'}">${trend.days[i]}</text>`).join('');
 const order=focus?[...shown.filter(m=>m.id!==focus),...shown.filter(m=>m.id===focus)]:shown;
 const lines=order.map(m=>{const c=colorOf(trend,m.id),dim=focus&&m.id!==focus;return `<polyline points="${m.points.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="${focus===m.id?3:2}" stroke-linejoin="round" stroke-linecap="round" opacity="${dim?0.22:1}"/><circle cx="${x(n-1).toFixed(1)}" cy="${y(m.points.at(-1)).toFixed(1)}" r="4" fill="${c}" stroke="var(--panel)" stroke-width="2" opacity="${dim?0.22:1}"/>`;}).join('');
 const cross=day!==null&&day>=0&&day<n?`<line x1="${x(day).toFixed(1)}" x2="${x(day).toFixed(1)}" y1="${T}" y2="${H-B}" class="trend-cross"/>${order.map(m=>`<circle cx="${x(day).toFixed(1)}" cy="${y(m.points[day]).toFixed(1)}" r="4" fill="${colorOf(trend,m.id)}" stroke="var(--panel)" stroke-width="2" opacity="${focus&&m.id!==focus?0.22:1}"/>`).join('')}`:'';
 const step=n===1?W:(W-L-R)/(n-1);
 const hits=trend.days.map((_,i)=>`<rect class="trend-hit" data-trend-day="${i}" x="${Math.max(0,x(i)-step/2).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}" fill="transparent"/>`).join('');
 return `<svg class="trend-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="メンバーのKP推移（${trend.days[0]}〜${trend.days.at(-1)}）">${grid}${xs}${lines}${cross}${hits}</svg>`;
}
function readout(trend,day,focus){
 if(day===null||day<0||day>=trend.days.length)return '<p class="helper trend-readout">グラフをタップすると、その日の全員のKPが出ます。</p>';
 const rows=sortTrend(trend.members.map(m=>({...m,points:m.points.slice(0,day+1)})),'now').slice(0,TREND_COLORS.length);
 return `<div class="trend-readout" role="status"><strong>${trend.days[day]}の終わり</strong>${rows.map(m=>`<span class="${focus&&focus!==m.id?'dim':''}"><i class="trend-key" style="background:${colorOf(trend,m.id)}"></i>${escapeHTML(m.name)} ${kp(m.points.at(-1))}</span>`).join('')}</div>`;
}
export function trendPanel(trend,{loading=false,error='',days=7,sort='now',dir=1,focus=null,day=null}={}){
 const head='<h2 class="panel-title">メンバーのKP推移</h2>';
 const range=`<div class="segment trend-range" role="radiogroup" aria-label="期間">${[7,30].map(d=>`<button role="radio" data-action="load-trend" data-days="${d}" class="${d===days?'active':''}" aria-checked="${d===days}" ${loading?'disabled':''}>${d}日</button>`).join('')}</div>`;
 if(!trend)return `<div class="asset-card trend-card">${head}<p class="helper">全員のKP（借KPはマイナス）が毎日どう動いたかを比べられます。</p>${error?`<p class="helper">⚠️ ${escapeHTML(error)}</p>`:''}${range}<p class="helper">${loading?'読み込み中…':'期間を選ぶと表示します。'}</p></div>`;
 if(!trend.members.length)return `<div class="asset-card trend-card">${head}${range}<p class="helper">まだKPの動きがありません。</p></div>`;
 const list=sortTrend(trend.members,sort,dir);
 const sorts=`<div class="segment trend-sort" role="group" aria-label="並べ替え">${TREND_SORTS.map(([id,label])=>`<button data-trend-sort="${id}" class="${id===sort?'active':''}" aria-pressed="${id===sort}">${label}${id===sort?(dir===1?' ↓':' ↑'):''}</button>`).join('')}</div>`;
 const rows=list.map((m,i)=>{const c=colorOf(trend,m.id),change=m.points.at(-1)-m.points[0];
  return `<button class="trend-row ${focus===m.id?'active':''} ${focus&&focus!==m.id?'dim':''}" data-trend-focus="${escapeHTML(m.id)}" aria-pressed="${focus===m.id}"><span class="trend-rank">${i+1}</span><i class="trend-key" style="background:${c??'transparent'};${c?'':'border:1px dashed var(--muted)'}"></i><span class="trend-name">${escapeHTML(m.name)}${m.debt>0?` <small>💸借KP ${kp(m.debt)}</small>`:''}</span><strong>${kp(m.points.at(-1))}</strong><span class="trend-change ${change>0?'up':change<0?'down':''}">${signed(change)}</span></button>`;}).join('');
 const more=trend.members.length>TREND_COLORS.length?`<p class="helper">グラフは${TREND_COLORS.length}人まで。残りは下の一覧だけに出ます。</p>`:'';
 return `<div class="asset-card trend-card">${head}${range}${chart(trend,focus,day)}${readout(trend,day,focus)}${more}${sorts}<div class="trend-list" role="list">${rows}</div><p class="helper">KPは使えるKPから借KPを引いた額（株・馬の評価額は含まない）。名前をタップするとその人の線が目立ちます。${new Date(trend.at).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'})}時点。</p></div>`;
}
