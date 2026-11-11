import {ESCALATION_ART,escalationArt} from './escalation-rank-assets.js?v=web-1b4bb156e63886a6';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number.isFinite(Number(n))?Number(n):0;
function emblem(tier,alt='',className=''){
 const art=escalationArt(tier),url=new URL('../assets/escalation-ranks/'+art.key+'.svg',import.meta.url);url.search=new URL(import.meta.url).search;
 return `<img class="esca-emblem ${className}" src="${url.href}" alt="${esc(alt)}" width="128" height="128" decoding="async">`;
}
export function escalationRankPanel(state){
 const p=state.escalationRating??{},rank=p.rank??p.inheritedRank,recognized=p.rating!=null,art=escalationArt(rank?.tier);
 const done=num(p.measurementGames),required=Math.max(1,num(p.measurementRequired)||3),rr=Math.max(0,Math.floor(num(rank?.rr)));
 const kind=p.placementKind==='act'?'ACT更新':p.placementKind==='episode'?'エピソード更新':'初回';
 const status=p.act===null?'ACT情報の取得を待っています':p.placementKind==='waiting'?'エピソード情報の取得を待っています':recognized?`今回のシリーズ ${num(p.seriesWins)}勝 ${num(p.seriesLosses)}敗`:`${kind}認定 ${done}/${required}試合`;
 const name=rank?.name??'未認定',members=Array.isArray(state.members)?state.members:[];
 const board=(Array.isArray(p.leaders)?p.leaders:[]).map((r,i)=>`<li class="esca-board-row"><span class="esca-place">${i+1}</span>${emblem(r.rank?.tier)}<span class="esca-board-name">${esc(members.find(m=>m.id===r.user)?.name??'メンバー '+String(r.user).slice(-4))}</span><strong>${esc(r.rank?.name??r.grade??'認定中')}${r.rank?`<small>${num(r.rank.rr)} RR</small>`:''}</strong></li>`).join('');
 const archives=(Array.isArray(p.previousActs)?p.previousActs:[]).map(a=>`<article class="esca-archive"><span class="esca-archive-act">${esc(a.name||a.act)}</span><strong>${esc(a.measured?a.grade||'認定済み':'認定途中')}</strong><span>最高 ${esc(a.peakGrade||'未認定')}</span><small>${num(a.wins)}勝${num(a.losses)}敗</small></article>`).join('');
 const progress=recognized?(rank?.tier===8?'<p class="esca-next">レディアント到達 · RRを伸ばして上位へ</p>':`<div class="esca-progress-label"><span>次の段階まで</span><b>${Math.max(0,100-rr)} RR</b></div><progress class="esca-rr" value="${Math.min(100,rr)}" max="100" aria-label="次のランクまでのRR"></progress>`):`<div class="esca-placement" aria-label="認定 ${done}/${required}試合">${Array.from({length:required},(_,i)=>`<span class="${i<done?'complete':''}">${i<done?'✓':i+1}</span>`).join('')}</div>`;
 return `<section class="panel esca-rank-card" style="--rank-color:${art.color}" aria-label="エスカランク"><div class="card-body">
 <div class="esca-heading"><div><span class="esca-eyebrow">ESCALATION · KESO RANKED</span><h2 class="panel-title">エスカランク</h2></div><span class="esca-act">ACT：${esc(p.act?.name||p.act?.id||'情報待ち')}</span></div>
 <div class="esca-rank-hero">${emblem(rank?.tier,name+'の紋章','esca-hero-emblem')}<div class="esca-rank-summary"><span class="esca-eyebrow">${recognized?'CURRENT RANK':rank?'PREVIOUS ACT':'PLACEMENT'}</span><h3>${esc(name)}</h3><p class="esca-rank-rr">${rank?`${rr} RR${!recognized?' · 前ACTから引き継ぎ':''}`:'認定戦で最初のランクが決まります'}</p>${progress}</div></div>
 <p class="esca-status" role="status">${status}</p>
 <div class="esca-stats"><div><span>今ACTの最高</span><strong>${esc(p.peakGrade||'認定後に記録')}</strong></div><div><span>今ACTの戦績</span><strong>${num(p.wins)}<small>勝</small> ${num(p.losses)}<small>敗</small></strong></div><div><span>前回の更新</span><strong>${p.lastSeriesAt?(num(p.lastChange)>=0?'+':'')+num(p.lastChange)+' RR':'—'}</strong></div></div>
 ${p.lastSeriesAt?`<p class="helper">前回 ${num(p.lastSeriesWins)}勝${num(p.lastSeriesLosses)}敗 ／ RR ${num(p.lastChange)>=0?'+':''}${num(p.lastChange)}（成績補正＋${num(p.lastPerformance)}を含む）</p>`:''}
 ${p.placementConsistencyBonus?'<p class="esca-bonus">初回認定：3試合連続KDプラス ＋100 RR</p>':''}
 <p class="esca-command">Discordでも <code>/kp rank</code> で確認できるで。</p>
 <details class="rules esca-details"><summary>更新幅・ランキング</summary><p class="helper">初回は認定3試合。3試合ともキル数がデス数を上回れば認定に＋100 RR。全敗でもアイアンⅡになります。ACT更新は認定1試合で前のランクを引き継ぎ、この認定では降格しません。エピソード更新は認定3試合で、基本は2ランク下から再開。内部レートと認定成績が高ければ1ランク下・据え置き・昇格もあります。VALORANT本体とは別のKESO独自ランクです。</p>
 <p class="helper">アイアン〜イモータルはⅠ・Ⅱ・Ⅲ、さらにレディアント。100 RRで1段階、3段階で1ランク。認定後は3勝または3敗でシリーズ終了し、3勝0敗＋100／3勝1敗＋70／3勝2敗＋40 RR。負け越しは逆の幅が基本です。30キル以上・高いKD・15アシスト以上で成績補正。補正は1試合最大＋3、1シリーズ最大＋5。負け越しでは減少を軽減するだけで上昇にはなりません。同じACTで認定済みの上位10人を表示します。</p>
 <h3>今ACTのランキング</h3>${board?`<ol class="esca-board">${board}</ol>`:'<p class="helper">認定を終えたメンバーがここに並びます。</p>'}
 ${archives?'<h3>前ACTの記録</h3><div class="esca-archives">'+archives+'</div>':''}
 <h3>ランク一覧</h3><div class="esca-ladder">${ESCALATION_ART.map((a,i)=>`<div>${emblem(i)}<span>${esc(a.name)}</span></div>`).join('')}</div></details></div></section>`;
}
