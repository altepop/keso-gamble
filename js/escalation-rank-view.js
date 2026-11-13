import {ESCALATION_ART,escalationArt} from './escalation-rank-assets.js?v=web-332712cc932d20c7';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number.isFinite(Number(n))?Number(n):0;
function emblem(tier,alt='',className='',division=1){
 const art=escalationArt(tier,division),url=new URL('../assets/escalation-ranks/'+art.file,import.meta.url);url.search=new URL(import.meta.url).search;
 return `<img class="esca-emblem ${className}" src="${url.href}" alt="${esc(alt)}" width="128" height="128" decoding="async">`;
}
export function escalationRankPanel(state){
 const p=state.escalationRating??{},rank=p.rank??p.inheritedRank,recognized=p.rating!=null,art=escalationArt(rank?.tier);
 const done=num(p.measurementGames),required=Math.max(1,num(p.measurementRequired)||3),rr=Math.max(0,Math.floor(num(rank?.rr)));
 const kind=p.placementKind==='act'?'ACT更新':p.placementKind==='episode'?'エピソード更新':'初回';
 const status=p.act===null?'ACT情報の取得を待っています':p.placementKind==='waiting'?'エピソード情報の取得を待っています':recognized?'毎試合評価 · 勝ち＋10〜＋30 RR／負け−30〜−10 RR':`${kind}認定 ${done}/${required}試合`;
 const signed=n=>(num(n)>=0?'+':'')+num(n);
 const shields=p.rankShields,shieldCount=shields?.eligible?Math.max(0,Math.min(2,Math.floor(num(shields.remaining)))):0;
 const shieldPanel=recognized&&shields?.eligible?`<div class="esca-shields" role="group" aria-label="ランクシールド 残り${shieldCount}/2"><span class="esca-shield-icons" aria-hidden="true">${[0,1].map(i=>`<span class="${i<shieldCount?'filled':'empty'}">🛡️</span>`).join('')}</span><div><strong>ランクシールド ${shieldCount}/2</strong><p>${shields.lastConsumed?'前の試合で1枚使用 · 0 RRで降格を回避':shieldCount?'0 RRでの敗北からランクを守ります':'残りなし · 次に0 RRで負けると降格'}</p></div></div>`:'';
 const previous=p.lastUpdateKind==='placement'?'認定結果':p.lastUpdateKind==='legacy-series'?'以前のシリーズ結果':'直前の試合';
 const name=rank?.name??'未認定',members=Array.isArray(state.members)?state.members:[];
 const board=(Array.isArray(p.leaders)?p.leaders:[]).map((r,i)=>`<li class="esca-board-row"><span class="esca-place">${i+1}</span>${emblem(r.rank?.tier,'','',r.rank?.division)}<span class="esca-board-name">${esc(members.find(m=>m.id===r.user)?.name??'メンバー '+String(r.user).slice(-4))}</span><strong>${esc(r.rank?.name??r.grade??'認定中')}${r.rank?`<small>${num(r.rank.rr)} RR</small>`:''}</strong></li>`).join('');
 const archives=(Array.isArray(p.previousActs)?p.previousActs:[]).map(a=>`<article class="esca-archive"><span class="esca-archive-act">${esc(a.name||a.act)}</span><strong>${esc(a.measured?a.grade||'認定済み':'認定途中')}</strong><span>最高 ${esc(a.peakGrade||'未認定')}</span><small>${num(a.wins)}勝${num(a.losses)}敗</small></article>`).join('');
 const progress=recognized?(rank?.tier===8?'<p class="esca-next">レディアント到達 · RRを伸ばして上位へ</p>':`<div class="esca-progress-label"><span>次の段階まで</span><b>${Math.max(0,100-rr)} RR</b></div><progress class="esca-rr" value="${Math.min(100,rr)}" max="100" aria-label="次のランクまでのRR"></progress>`):`<div class="esca-placement" aria-label="認定 ${done}/${required}試合">${Array.from({length:required},(_,i)=>`<span class="${i<done?'complete':''}">${i<done?'✓':i+1}</span>`).join('')}</div>`;
 return `<section class="panel esca-rank-card" style="--rank-color:${art.color}" aria-label="エスカランク"><div class="card-body">
 <div class="esca-heading"><div><span class="esca-eyebrow">ESCALATION · KESO RANKED</span><h2 class="panel-title">エスカランク</h2></div><span class="esca-act">ACT：${esc(p.act?.name||p.act?.id||'情報待ち')}</span></div>
 <div class="esca-rank-hero">${emblem(rank?.tier,name+'の紋章','esca-hero-emblem',rank?.division)}<div class="esca-rank-summary"><span class="esca-eyebrow">${recognized?'CURRENT RANK':rank?'PREVIOUS ACT':'PLACEMENT'}</span><h3>${esc(name)}</h3><p class="esca-rank-rr">${rank?`${rr} RR${!recognized?' · 前ACTから引き継ぎ':''}`:`認定まであと${Math.max(0,required-done)}試合`}</p>${progress}</div></div>
 ${shieldPanel}
 <p class="esca-status" role="status">${status}</p>
 <div class="esca-stats"><div><span>今ACTの最高</span><strong>${esc(p.peakGrade||'認定後に記録')}</strong></div><div><span>今ACTの戦績</span><strong>${num(p.wins)}<small>勝</small> ${num(p.losses)}<small>敗</small></strong></div><div><span>前回の更新</span><strong>${p.lastSeriesAt?(num(p.lastChange)>=0?'+':'')+num(p.lastChange)+' RR':'—'}</strong></div></div>
 ${p.lastSeriesAt?`<p class="helper">${previous} ${num(p.lastSeriesWins)}勝${num(p.lastSeriesLosses)}敗 ／ RR ${num(p.lastChange)>=0?'+':''}${num(p.lastChange)}（成績補正${signed(p.lastPerformance)}を含む）</p>`:''}
 ${p.placementConsistencyBonus?'<p class="esca-bonus">初回認定：3試合連続KDプラス ＋100 RR</p>':''}
 <p class="esca-command">Discordでも <code>/esca rank</code> で確認できるで。</p>
 <details class="rules esca-details"><summary>更新幅・ランキング</summary><p class="helper">初回は認定3試合。3試合ともキル数がデス数を上回れば認定に＋100 RR。全敗ならアイアンⅠです。3勝でブロンズⅢ、3試合ともKDプラスならシルバーⅠになります。ACT更新は認定1試合で前のランクを引き継ぎ、この認定では降格しません。エピソード更新は認定3試合で、基本は2ランク下から再開。内部レートと認定成績が高ければ1ランク下・据え置き・昇格もあります。VALORANT本体とは別のKESO独自ランクです。ランク画像 © Riot Games。Riot Gamesの公認・提供ではありません。</p>
 <p class="helper">アイアン〜イモータルはⅠ・Ⅱ・Ⅲ、さらにレディアント。100 RRで1段階、3段階で1ランク。認定後は毎試合更新。勝ち＋20／負け−20 RRを基準に、KD・チーム内キル数・アシストで−10〜＋10を補正します。勝ちは＋10〜＋30、負けは−30〜−10 RR。低キル・低デスだけで高評価にはなりません。成績データが欠ける場合の補正は0。RRが残った状態から負けても、その段階の0 RRで止まります。ブロンズ〜イモータルのⅠにはシールド2枚。0 RRで負けるたび1枚消費し、2敗まで耐えられます。残り0枚でさらに負けると降格。勝利だけでは補充されず、昇格・降格でⅠへ移動した場合に2枚補充します。Ⅱ・Ⅲとレディアントはシールドなし。アイアンⅠは全体の下限です。同じACTで認定済みの上位10人を表示します。</p>
 <h3>今ACTのランキング</h3>${board?`<ol class="esca-board">${board}</ol>`:'<p class="helper">認定を終えたメンバーがここに並びます。</p>'}
 ${archives?'<h3>前ACTの記録</h3><div class="esca-archives">'+archives+'</div>':''}
 <h3>ランク一覧</h3><div class="esca-ladder">${ESCALATION_ART.map((a,i)=>`<div>${emblem(i)}<span>${esc(a.name)}</span></div>`).join('')}</div></details></div></section>`;
}
