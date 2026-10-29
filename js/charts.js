import { fmt, fmt0 } from './format.js?v=web-0190be587dceba29';
function genCandles(base,id){
  const out=[];let close=base*0.98;let seed=id.split('').reduce((a,c)=>a+c.charCodeAt(0),0)+77;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  for(let i=0;i<46;i++){
    const open=close + (rand()-.5)*base*0.035;
    close=Math.max(base*0.78,Math.min(base*1.18, open + (rand()-.5)*base*0.07));
    const high=Math.max(open,close)+rand()*base*0.03;
    const low=Math.min(open,close)-rand()*base*0.03;
    const vol=150000+Math.floor(rand()*130000);
    const date=new Date(Date.now()-(45-i)*86400000);const label=`${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')}`;
    out.push({open,high,low,close,vol,date:label});
  }
  out[out.length-1].close=base;
  out[out.length-1].high=Math.max(out[out.length-1].high,base+base*0.012);
  out[out.length-1].low=Math.min(out[out.length-1].low,base-base*0.012);
  return out;
}

function movingAverage(data,n){
  return data.map((_,i)=>{
    const start=Math.max(0,i-n+1); const slice=data.slice(start,i+1).map(v=>v.close);
    return slice.reduce((a,b)=>a+b,0)/slice.length;
  });
}

function svgCandles(data,w=660,h=560,showMA=true,label='デモ相場のローソク足チャート'){
  const pad={t:22,r:70,b:36,l:18};
  const plotW=w-pad.l-pad.r, plotH=h-pad.t-pad.b;
  const max=Math.max(...data.map(d=>d.high));
  const min=Math.min(...data.map(d=>d.low));
  const range=max-min||1;
  const y=v=>pad.t + (max-v)/range*plotH;
  const step=plotW/data.length;
  const body=Math.min(22,Math.max(6,step*.56));
  const ma5=movingAverage(data,5), ma10=movingAverage(data,10), ma25=movingAverage(data,25);
  const maPath=(arr)=>arr.map((v,i)=>`${i?'L':'M'} ${pad.l+step*i+step/2} ${y(v)}`).join(' ');
  const gridY=[0,.25,.5,.75,1].map(r=>min+(range*(1-r)));
  const labelsY=gridY.map(v=>Math.round(v/10)*10);
  const lowIdx=data.reduce((m,v,i)=>v.low<data[m].low?i:m,0);
  const highIdx=data.reduce((m,v,i)=>v.high>data[m].high?i:m,0);
  return `
  <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${label}">
    <rect x="0" y="0" width="${w}" height="${h}" fill="#02091f"/>
    ${labelsY.map(v=>`<g><line x1="${pad.l}" x2="${pad.l+plotW}" y1="${y(v)}" y2="${y(v)}" stroke="#263759" stroke-width="1"/><text x="${w-8}" y="${y(v)+5}" text-anchor="end" fill="#eef3ff" font-size="14">${fmt0(v)}</text></g>`).join('')}
    ${[...new Set(Array.from({length:4},(_,i)=>Math.round((data.length-1)*i/3)))].map(i=>`<g><line x1="${pad.l+step*i+step/2}" x2="${pad.l+step*i+step/2}" y1="${pad.t}" y2="${pad.t+plotH}" stroke="#263759" stroke-width="1"/><text x="${pad.l+step*i+step/2}" y="${h-8}" text-anchor="middle" fill="#eef3ff" font-size="14">${data[i].date}</text></g>`).join('')}
    ${showMA ? `<path d="${maPath(ma5)}" fill="none" stroke="#f0db33" stroke-width="2.5"/>
    <path d="${maPath(ma10)}" fill="none" stroke="#ff7a32" stroke-width="2.5"/>
    <path d="${maPath(ma25)}" fill="none" stroke="#59d3ff" stroke-width="2.5"/>` : ''}
    ${data.map((c,i)=>{
      const x=pad.l+step*i+step/2;const color=c.close>=c.open?'#ff5b52':'#15d13f';
      const yOpen=y(c.open), yClose=y(c.close), yHigh=y(c.high), yLow=y(c.low);
      const top=Math.min(yOpen,yClose), bottom=Math.max(yOpen,yClose), height=Math.max(3,bottom-top);
      return `<g><line x1="${x}" x2="${x}" y1="${yHigh}" y2="${yLow}" stroke="${color}" stroke-width="2"/><rect x="${x-body/2}" y="${top}" width="${body}" height="${height}" fill="${color}" rx="1.5"/></g>`;
    }).join('')}
    <line x1="${pad.l}" x2="${pad.l+plotW}" y1="${y(data.at(-1).close)}" y2="${y(data.at(-1).close)}" stroke="#d7bb22" stroke-width="2" stroke-dasharray="10 8"/>
    <rect x="${w-85}" y="${y(data.at(-1).close)-14}" width="78" height="28" rx="8" fill="#d3a800"/>
    <text x="${w-46}" y="${y(data.at(-1).close)+6}" text-anchor="middle" fill="#111" font-size="18" font-weight="700">${fmt(data.at(-1).close)}</text>
    <text x="${pad.l+step*highIdx+10}" y="${y(data[highIdx].high)-10}" fill="#fff" font-size="16">${fmt(data[highIdx].high)}</text>
    <text x="${pad.l+step*lowIdx+10}" y="${y(data[lowIdx].low)-8}" fill="#fff" font-size="16">${fmt(data[lowIdx].low)}</text>
  </svg>`;
}


export { genCandles, movingAverage, svgCandles };
