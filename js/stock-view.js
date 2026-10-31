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

// Only render this control for the server-confirmed private casino owner.
// Stock prices are shared by the whole guild. Administrative moves are audited by the Worker.
export function privateStockOperator(market,{selection={},notice=null,confirmation=null}={}){
 const rows=market.map(s=>`<option value="${esc(s.id)}" ${selection.symbol===s.id?'selected':''}>${esc(s.name)} (${esc(s.ticker)})</option>`).join('');
 const option=(value,label,selected)=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${label}</option>`;
 const kind=['success','warning','error'].includes(notice?.kind)?notice.kind:'';
 const message=notice?.text?esc(notice.text):'';
 return `<details class="asset-card rules"><summary class="panel-title">🔒 裏モード：株価オペレーター</summary>
  <p class="helper">自分だけが使える運営メニュー。操作は全員共通の株価に即時反映され、チャート・運営イベント履歴に残ります。保有KP・株数は直接増減しません。</p>
  <div class="field"><label for="admin-stock-symbol">操作する銘柄</label><select id="admin-stock-symbol" class="select">${rows}</select></div>
  <div class="field"><label for="admin-stock-direction">方向</label><select id="admin-stock-direction" class="select">${option('up','📈 急騰させる',selection.direction??'up')}${option('down','📉 急落させる',selection.direction??'up')}</select></div>
  <div class="field"><label for="admin-stock-strength">1回の変動幅</label><select id="admin-stock-strength" class="select">${option('10','10%',String(selection.strength??25))}${option('25','25%',String(selection.strength??25))}${option('50','50%',String(selection.strength??25))}</select></div>
  <p class="helper">毎回、直前の現在値を基準に変動。連続で押すと上昇・下落が累積します。株価は20〜10,000,000 KPに制限されます。</p>
  <div class="action-row"><button type="button" class="action-btn primary" data-action="stock-shock">株価操作を実行</button></div>
  ${confirmation?`<div class="stock-shock-confirmation" role="group" aria-label="株価操作の最終確認">
    <strong>株価操作の最終確認</strong>
    <p>${esc(market.find(s=>s.id===confirmation.symbol)?.name??'選択銘柄')}の共通株価を${confirmation.strength}%${confirmation.direction==='up'?'急騰':'急落'}させる。全メンバーに影響し、操作履歴に記録される。</p>
    <div class="action-row"><button type="button" class="action-btn primary" data-action="stock-shock-approve">この内容で実行する</button><button type="button" class="action-btn" data-action="stock-shock-cancel">キャンセル</button></div>
  </div>`:''}
  <div id="stock-shock-notice" class="stock-shock-notice ${kind}" role="status" aria-live="polite" ${message?'':'hidden'}>${message}</div>
 </details>`;
}
