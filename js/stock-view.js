const kp=n=>Math.floor(n).toLocaleString('ja-JP')+' KP';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function stockPrice(base,benefits){const percent=benefits?.percent??0;return base-Math.min(2000,Math.floor(base*percent/100));}
export function stockPanel(state){
 const m=state.stockMarket;if(!m)return '<p class="market-disclaimer">デモ相場です。本番では全員同じ株価で売買します。</p>';
 const benefit=state.stockBenefits??{eligibleValue:0,percent:0};
 const clock=n=>new Date(n).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
 return `<section class="stock-panel"><div class="stock-panel-head"><h2>共通相場</h2><span class="badge">売買で即時変動</span></div><p class="helper">全銘柄とも買われると上昇し、売られると下落します。注文数量に応じて約定価格も変わります。通常相場は5分ごと・変動幅は従来の2倍です。更新 ${clock(m.at)}</p><div class="stock-summary"><div><span>毎朝9時の配当</span><strong>日1% <small>上限500 KP</small></strong></div><div><span>あなたの株主優待</span><strong>${benefit.percent?`${benefit.percent}%割引`:'対象の保有株なし'}</strong></div></div><p class="helper">配当・優待は24時間以上の保有分が対象です。優待は保有額1万KPで3%、5万KPで5%。指名・高級品が1回最大2,000 KP安くなります。</p><p class="helper">優待対象の評価額 ${kp(benefit.eligibleValue)}。売る時は古い保有分から減ります。</p>${m.dividends?.length?`<details><summary>配当履歴</summary>${m.dividends.map(d=>`<div class="asset-line"><span>${esc(d.day)} 9時分</span><strong>+${kp(d.amount)}</strong></div>`).join('')}</details>`:'<p class="helper">9時の時点で24時間以上保有している株に自動入金されます。</p>'}</section>${m.news?.length?`<section class="stock-panel"><h2>株ニュース</h2><p class="helper">KESOはVALORANT関連。RISOはQUIZ協賛。YUYAは競馬関連。YANOは売買活況が材料です。</p>${m.news.slice(0,8).map(n=>`<article class="stock-news"><span class="stock-news-symbol">${esc(n.symbol.toUpperCase())}</span><div><strong>${esc(n.label)}</strong><small>${clock(n.at)} · 材料 ${n.bps>0?'+':''}${(n.bps/100).toFixed(2)}%</small></div></article>`).join('')}</section>`:''}`;
}
export function stockCandles(market,symbol){
 // A stock listed later has no price in the older ticks; its chart starts at its listing.
 const rows=(market?.ticks??[]).filter(r=>Number.isSafeInteger(r.prices?.[symbol]));
 return rows.map((r,i)=>{const close=r.prices[symbol],open=i?rows[i-1].prices[symbol]:close;return {open,close,high:Math.max(open,close),low:Math.min(open,close),vol:0,date:new Date(r.at).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'})};});
}
