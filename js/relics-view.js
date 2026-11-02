// Three independent origins: common summons, Steam achievements, and Unite results.
// Never recommend cross-game combinations or require another game's relic for an upgrade.
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const yen=n=>Number(n??0).toLocaleString('ja-JP');
const names={common:'一般',uncommon:'上質',rare:'希少',legendary:'伝説',mythic:'神話',ancient:'古代',transcendent:'🌈 超越',exclusive:'限定'};
const unite=[
 ['unite.first_win','テイアの守護核',390,'ランク戦1勝'],
 ['unite.three_wins','伝説を奪う手',480,'3連勝到達'],
 ['unite.five_wins','レックウザの逆鱗',620,'5連勝到達'],
];
export function relicsPanel(state,{proofs=null,notice='',loading=false}={}){
 const collection=state.relics??{totalSummons:0,items:{},equipped:[]};
 const items=Object.values(collection.items??{});
 const owned=count=>items.some(x=>x.id===count);
 const catalog=Array.isArray(proofs?.catalog)?proofs.catalog:[];
 const source=new Map(catalog.map(def=>[def.id,def]));
 const level=Math.min(10,1+Math.floor(collection.totalSummons/200));
 const levels=Array.isArray(proofs?.ratesByLevel)?proofs.ratesByLevel:[];
 const displayedRates=levels[level-1]??proofs?.rates??null;
 const maxRates=levels[9]??proofs?.maxRates??null;
 const rateOrder=['common','uncommon','rare','legendary','mythic','ancient','transcendent'];
 const ratesTable=displayedRates&&maxRates?`<details class="rules"><summary>全レアリティの排出率（現在Lv${level}／最大Lv10）</summary>
 <div class="asset-line"><strong>レアリティ</strong><strong>現在 ／ Lv10</strong></div>
 ${rateOrder.map(id=>`<div class="asset-line"><span>${esc(names[id])}</span><strong>${Number(displayedRates[id]??0).toFixed(3)}% ／ ${Number(maxRates[id]??0).toFixed(3)}%</strong></div>`).join('')}
 <p class="helper">Lv10では一般0%。上質も4%。確定天井はなく、超越はLv10でも0.01%。</p></details>`:'<p class="helper">排出率表はKP口座への接続後、遺物画面を開くと確認できる。</p>';
 const grouped=Object.entries(proofs?.modeNames??{}).map(([id,label])=>{
  const defs=catalog.filter(item=>item.mode===id);
  return `<details class="rules"><summary>${esc(label)} ／ ${defs.length}種類</summary>
   ${defs.map(def=>`<div class="asset-line"><div><span class="badge">${esc(names[def.rarity]??def.rarity)}</span> <strong>${esc(def.name)}</strong><br>
    <small>${esc(def.ability)}</small></div><span>${owned(def.id)?'✅ 所持':'未所持'}</span></div>`).join('')}</details>`;
 }).join('');


 const power=collection.equipped.reduce((n,id)=>n+(collection.items[id]?.power??0),0);
 const card=item=>`<article class="history-entry"><span class="badge">${esc(names[item.rarity]??item.rarity)}</span>
   <strong>${esc(source.get(item.id)?.name??item.name)}</strong><p class="helper">${esc(item.origin==='unite'?'ユナイト限定':item.origin==='steam'?'Steam限定':'通常召喚'+(source.get(item.id)?.mode?'・'+(proofs?.modeNames?.[source.get(item.id).mode]??source.get(item.id).mode)+'特化':''))} ・ 戦力 ${yen(item.power)} ・ 所持${yen(item.count)}${item.origin==='normal'?'（育成Lv'+(1+Math.floor(Math.log2(item.count)))+'）':''}</p>
   <p class="helper">${esc(source.get(item.id)?.ability??item.ability)}</p>
   <button type="button" class="action-btn" data-action="relic-equip" data-relic="${esc(item.id)}">指定枠に装備</button></article>`;
 const sorted=[...items].sort((a,b)=>b.power-a.power);
 return `<section class="panel"><div class="card-body"><h2 class="panel-title">🔮 遺物召喚</h2>
   <p><strong>200 KP／1回</strong> · 召喚レベル ${level} · 累計 ${yen(collection.totalSummons)}回</p>
   <p class="helper">200連ごとに召喚レベル上昇。上がるほど一般・上質が減り、希少〜古代が増える。Lv10は一般0%、上質4%。超越の天井はない。重複すると能力と戦力が強化される。</p>
   ${ratesTable}
   <div class="action-row">${[1,10,100,1000].map(n=>`<button type="button" class="action-btn ${n===10?'primary':''}" data-action="relic-summon" data-count="${n}" ${state.cash<200*n||!state.serverWallet?'disabled':''}>${n}連 · ${yen(200*n)} KP</button>`).join('')}</div>
   ${notice?`<p class="market-disclaimer" role="status">${esc(notice)}</p>`:''}
 </div></section>
 <section class="panel"><div class="card-body"><h2 class="panel-title">🧰 装備</h2>
   <p class="helper">4枠の戦力合計：<strong>${yen(power)}</strong>。遺物ごとの戦力は単独で決まり、他ゲームの遺物を要求する組み合わせ効果はない。</p>
   <div class="field"><label for="relic-slot">装備先</label><select id="relic-slot" class="select">${[0,1,2,3].map(n=>`<option value="${n}">枠 ${n+1}：${esc(collection.items[collection.equipped[n]]?.name??'未装備')}</option>`).join('')}</select></div>
   <button type="button" class="action-btn" data-action="relic-equip" data-relic="">指定枠を外す</button>
 </div></section>
 <section class="panel"><div class="card-body"><h2 class="panel-title">🎒 遺物図鑑（${yen(items.length)}種）</h2>
   ${sorted.length?sorted.map(card).join(''):'<p class="helper">まだ遺物を持っていない。通常ガチャから始められる。</p>'}
 </div></section>
 <section class="panel"><div class="card-body"><h2 class="panel-title">📚 モード別遺物全98種類</h2><p class="helper">14モード×各7レアリティ。モードを開くと固有能力と所持状況を確認できる。ユナイト限定は他の遺物の解放条件にならない。</p>${grouped||'<p class="helper">データ取得中。再度この画面を開いてください。</p>'}</div></section>
 <section class="panel"><div class="card-body"><h2 class="panel-title">🟦 Steam限定遺物</h2>
   <p class="helper">接続後にサーバーが記録した、世界解除率10%以下の有料ゲーム実績から受け取れる。通常ガチャでは出ない。売買不可。</p>
   ${!state.serverWallet?'<p class="helper">本番KP口座へ接続してください。</p>':loading?'<p class="helper">達成記録を確認中…</p>':proofs?.steam?.length?proofs.steam.map(e=>`<div class="asset-line"><span>${esc(e.title)}<br><small>世界解除率 ${yen(e.percent)}%</small></span><button type="button" class="action-btn" data-action="relic-claim-steam" data-event="${esc(e.id)}" ${owned('steam.'+e.id)?'disabled':''}>${owned('steam.'+e.id)?'受取済み':'獲得'}</button></div>`).join(''):'<p class="helper">希少実績の支給記録はまだない。既存のSteam実績を遡ってKP支給する仕組みではない。</p>'}
 </div></section>
 <section class="panel"><div class="card-body"><h2 class="panel-title">🟨 ポケモンユナイト限定遺物</h2>
   <p class="helper">サーバーが確定したランク戦の勝利・連勝記録から獲得。単体で最強格の戦力を持つ。同時装備は1個まで。ガチャ排出・売買・他遺物の解放条件にはしない。</p>
   ${unite.map(([id,name,power,condition])=>`<div class="asset-line"><span><strong>${esc(name)}</strong><br><small>${esc(condition)} ・ 戦力 ${yen(power)}</small></span><button type="button" class="action-btn" data-action="relic-claim-unite" data-tier="${esc(id)}" ${!state.serverWallet||owned(id)?'disabled':''}>${owned(id)?'受取済み':'獲得を確認'}</button></div>`).join('')}
 </div></section>
 <p class="helper">※対象モードの検証済みプレイ・取引には、装備遺物の条件付き追加KPが発生する。VALORANT系は1件最大80KPかつ元報酬の15%まで。カジノ・株・競馬・Mリーグなどの取引系は最大1%・1日合計120KPまで。クイズ・通話も確認済み記録のみで判定する。KESO LOOP限定遺物は未実装。</p>`;
}
