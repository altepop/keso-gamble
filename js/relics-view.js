import {relicSoundEnabled,relicSoundVolume,RELIC_SOUND_DESIGNS} from './relics-audio.js?v=web-a1bd570bcecb46ec';
import {relicBuildSection,relicPresetsSection,relicSummonHistorySection,relicSpecialSection,relicEffectLogSection,relicEconomySection} from './relics-v7.js?v=web-a1bd570bcecb46ec';
import {relicInventory,relicFilterControls,relicItemCard,relicInventoryPages,relicRevealPanel,relicBonusDashboard} from './relics-v4.js?v=web-a1bd570bcecb46ec';
import {relicExchangeSection} from './relic-exchange-view.js?v=web-a1bd570bcecb46ec';
import {relicMarketSection} from './relic-market-view.js?v=web-a1bd570bcecb46ec';
// Three independent origins: common summons, Steam achievements, and Unite results.
// Never recommend cross-game combinations or require another game's relic for an upgrade.
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const yen=n=>Number(n??0).toLocaleString('ja-JP');
const names={common:'一般',uncommon:'上質',rare:'希少',legendary:'伝説',mythic:'神話',ancient:'古代',transcendent:'🌈 超越',exclusive:'限定'};
const unite=[
 ['unite.first_win','テイアの守護核',390,'ランク戦1勝'],['unite.two_wins','エオスの双星',425,'2連勝'],
 ['unite.three_wins','伝説を奪う手',480,'3連勝'],['unite.four_wins','テイアの不落城',545,'4連勝'],
 ['unite.five_wins','レックウザの逆鱗',620,'5連勝'],
 ['unite.career_10','十勝の結晶',445,'累計10勝'],['unite.career_25','二十五戦の灯台',510,'累計25勝'],
 ['unite.career_50','五十勝の栄光',570,'累計50勝'],['unite.career_100','百戦の星冠',650,'累計100勝'],
 ['unite.career_200','無窮のエオス',710,'累計200勝'],
];
export function relicsPanel(state,{proofs=null,notice='',loading=false,view={},reveal=null,summonBusy=false}={}){
 const collection=state.relics??{totalSummons:0,items:{},equipped:[]};
 const items=Object.values(collection.items??{});
 const uniteList=Array.isArray(proofs?.unite)&&proofs.unite.length?proofs.unite.map(u=>[u.id,u.name,u.power,u.condition]):unite;
 const steamGrade=percent=>{
  const value=Number(percent);
  if(value<=0.01)return'異界';if(value<=0.1)return'深淵';if(value<=1)return'神話';
  if(value<=5)return'偉業';if(value<=10)return'熟練';
  if(value<25)return'挑戦';return'旅路';
 };
 const owned=count=>items.some(x=>x.id===count);
 const catalog=Array.isArray(proofs?.catalog)?proofs.catalog:[];
 const source=new Map(catalog.map(def=>[def.id,def]));
 const milestones=proofs?.milestones??[0,300,750,1350,2100,3000,4050,5250,6600,8100];
 const level=milestones.filter(n=>collection.totalSummons>=n).length;
 const nextMilestone=milestones[level]??null;
 const toNext=nextMilestone===null?0:Math.max(0,nextMilestone-collection.totalSummons);
 const levels=Array.isArray(proofs?.ratesByLevel)?proofs.ratesByLevel:[];
 const displayedRates=levels[level-1]??proofs?.rates??null;
 const maxRates=levels[9]??proofs?.maxRates??null;
 const rateOrder=['common','uncommon','rare','legendary','mythic','ancient','transcendent'];
 const ratesTable=displayedRates&&maxRates?`<details class="rules"><summary>全レアリティの排出率（現在Lv${level}／最大Lv10）</summary>
 <div class="asset-line"><strong>レアリティ</strong><strong>現在 ／ Lv10</strong></div>
 ${rateOrder.map(id=>`<div class="asset-line"><span>${esc(names[id])}</span><strong>${Number(displayedRates[id]??0).toFixed(3)}% ／ ${Number(maxRates[id]??0).toFixed(3)}%</strong></div>`).join('')}
 <p class="helper">Lv10では一般0%。上質も4%。確定天井はなく、超越はLv10でも0.003%（約33,333回に1回）。</p></details>`:'<p class="helper">排出率表はKP口座への接続後、遺物画面を開くと確認できる。</p>';
 const grouped=Object.entries(proofs?.modeNames??{}).map(([id,label])=>{
  const defs=catalog.filter(item=>item.mode===id);
  return `<details class="rules"><summary>${esc(label)} ／ ${defs.length}種類</summary>
   ${defs.map(def=>`<div class="asset-line"><div><span class="badge">${esc(names[def.rarity]??def.rarity)}</span> <strong>${esc(def.name)}</strong><br>
    <small><b>${esc(def.short??def.ability)}</b>${def.trait?' ／ '+esc(def.trait):''}</small></div><span>${owned(def.id)?'✅ 所持':'未所持'}</span></div>`).join('')}</details>`;
 }).join('');


 const power=collection.equipped.reduce((n,id)=>n+(collection.items[id]?.power??0),0);
 const inv=relicInventory(items,source,proofs?.modeNames,view,collection.equipped??[]);
 const equipped=collection.equipped??[];
 const cards=inv.matches.map(item=>relicItemCard(item,source,proofs?.modeNames,equipped)).join('');
 const filterHtml=relicFilterControls(view,proofs?.modeNames,inv);
 const pagesHtml=relicInventoryPages(inv);
 const bonusDashboard=relicBonusDashboard(state,proofs,view);
 const buildTools=relicPresetsSection(collection,proofs)+relicBuildSection(proofs);
 const advanced=relicSummonHistorySection(collection)+relicSpecialSection(collection)+relicEffectLogSection(collection,proofs)+relicEconomySection(collection,proofs);
 const section=['collection','gear','summon','records','exchange','market'].includes(view.section)?view.section:'collection';
 const tabs=[['collection','🎒 図鑑・装備'],['gear','📊 ビルド・試算'],['summon','🔮 召喚'],['exchange','🧩 欠片・交換所'],['market','🌑 闇市'],['records','📊 記録・限定']];
 const nav='<nav class="relic-v8-nav" aria-label="遺物画面の切替">'+tabs.map(([id,label])=>
  '<button type="button" class="relic-v8-tab'+(section===id?' active':'')+'" data-action="relic-tab" data-tab="'+id+'" aria-current="'+(section===id?'page':'false')+'">'+label+'</button>').join('')+'</nav>';
 const pane=(id)=>'<div class="relic-v8-pane'+(section===id?' active':'')+'" data-pane="'+id+'">';
 return relicRevealPanel(reveal)+nav+pane('summon')+`<section class="panel"><div class="card-body"><h2 class="panel-title">🔮 遺物召喚</h2>
   <p><strong>200 KP／1回</strong> · 召喚レベル ${level} · 累計 ${yen(collection.totalSummons)}回</p>
   <div class="relic-level-progress"><strong>${nextMilestone===null?'Lv10到達！':'次のLvまで あと'+yen(toNext)+'回'}</strong><div class="relic-progress-rail"><span style="width:${nextMilestone===null?100:Math.floor(100*(collection.totalSummons-milestones[level-1])/(nextMilestone-milestones[level-1]))}%"></span></div><small>段階別の累計目標：${milestones.map((n,i)=>'Lv'+(i+1)+' '+yen(n)+'回').join(' / ')}</small></div>
   <p class="helper">召喚した累計回数でレベルが上昇する。Lv10到達は累計8,100回。以前の召喚回数・獲得遺物はそのまま残る。Lv10では一般0%、上質4%、超越0.003%。超越の確定天井はない。</p>
   ${ratesTable}
   <p class="helper">🔊 召喚結果の効果音は自動再生が基本だ。いつでも消音できる。</p>
   <button type="button" class="action-btn relic-v8-audio-toggle" data-action="relic-sound-toggle" aria-pressed="${relicSoundEnabled()?'true':'false'}">${relicSoundEnabled()?'🔊 自動効果音：オン':'🔇 自動効果音：オフ'}</button>
   <div class="relic-v9-sound-studio">
    <div class="relic-v9-volume-row"><label for="relic-v9-volume">🎚 効果音の音量</label><output id="relic-v9-volume-value" for="relic-v9-volume">${relicSoundVolume()}%</output></div>
    <input id="relic-v9-volume" data-relic-sound-volume type="range" min="0" max="100" step="5" value="${relicSoundVolume()}" aria-label="召喚効果音の音量">
    <p class="helper">レア度が上がるほど、音の厚み・楽器・盛り上がり・残響が増す。どの音もKPを使わず試聴できる。</p>
    <div class="relic-v9-tier-audition">
     ${Object.entries(RELIC_SOUND_DESIGNS).map(([tier,info])=>`<button type="button" class="relic-v9-tier-button relic-rarity-${tier}" data-action="relic-sound-preview" data-tier="${tier}" aria-label="${info.name}の召喚音を試聴">
       <strong>${info.name}</strong><small>${info.description}</small><span>♫ ${info.duration.toFixed(1)}秒　試聴</span>
      </button>`).join('')}
    </div>
   </div>
   ${summonBusy?'<p class="relic-summon-busy" role="status" aria-live="polite">🔮 召喚を処理中。KPと獲得結果を確認している。連打しても追加購入されない。</p>':''}
   <div class="action-row">${[1,10,100,1000].map(n=>`<button type="button" class="action-btn ${n===10?'primary':''}" data-action="relic-summon" data-count="${n}" ${summonBusy||state.cash<200*n||!state.serverWallet?'disabled':''}>${summonBusy?'処理中…':n+'連 · '+yen(200*n)+' KP'}</button>`).join('')}</div>
   ${notice?`<p class="market-disclaimer" role="status">${esc(notice)}</p>`:''}
 </div></section>
 </div>
 ${pane('gear')}
 <section class="panel"><div class="card-body"><h2 class="panel-title">📊 現在のビルド</h2>
   <p class="helper">遺物を比べて装備する場所は「図鑑」だ。ここでは現在の4枠を確認し、おまかせ装備・プリセット・獲得KPの試算を行える。</p>
   <button type="button" class="action-btn" data-action="relic-tab" data-tab="collection">🎒 図鑑・装備へ</button>
   <p class="helper">4枠の戦力合計：<strong>${yen(power)}</strong>。戦力はKP増加率ではない。装備効果は上限なしで合算する。赤い「代償」を持つ遺物は、ほかの遺物を弱体化させることがある。下で実効倍率を確認できる。</p>
   <div class="field"><label for="relic-slot">装備を外す枠</label><select id="relic-slot" class="select">${[0,1,2,3].map(n=>`<option value="${n}">枠 ${n+1}：${esc(collection.items[collection.equipped[n]]?.name??'未装備')}</option>`).join('')}</select></div>
   <div class="relic-auto-box"><h3>⚡ おまかせ装備</h3><p class="helper">選んだゲームで発動しやすい遺物を4枠に自動編成する。強さだけでなく、条件の組み合わせも考慮する。</p>
   <select class="select" id="relic-goal"><option value="all">どのゲームでも使いやすく</option>${Object.entries(proofs?.modeNames??{}).filter(([id])=>!['universal','finance','fortune','marketplus','racingplus','casinoplus'].includes(id)).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}中心</option>`).join('')}</select>
   <button type="button" class="action-btn primary" data-action="relic-auto-equip" ${!state.serverWallet?'disabled':''}>おすすめ4枠に装備</button></div>
   <button type="button" class="action-btn" data-action="relic-equip" data-relic="">選んだ枠の装備を外す</button>
 </div></section>
 ${bonusDashboard}
 ${buildTools}
 </div>
 ${pane('collection')}
 <section class="panel"><div class="card-body"><h2 class="panel-title">🎒 図鑑・装備（${yen(items.length)}種）</h2>
   <p class="helper">ここで所持品の効果を比較して装備する。まず枠を選び、気になる遺物の詳細を開こう。装備後の追加KPは「ビルド・試算」で確認できる。</p>
   ${filterHtml}
   <label class="relic-v8-slot-picker">① 装備する枠を選ぶ
    <select id="relic-slot-gallery" class="select">${[0,1,2,3].map(n=>`<option value="${n}">枠${n+1}：${esc(collection.items[collection.equipped[n]]?.name??'空き')}</option>`).join('')}</select>
   </label>
   <p class="helper">② 遺物カードの「効果の詳細・装備」を開く → ③「指定枠に装備」を押す。</p>
   <div class="relic-v8-viewbar">
    <button type="button" class="action-btn ${view.layout!=='list'?'active':''}" data-action="relic-layout" data-layout="grid">▦ 2列</button>
    <button type="button" class="action-btn ${view.layout==='list'?'active':''}" data-action="relic-layout" data-layout="list">☰ 1列</button>
    <button type="button" class="action-btn ${view.equippedOnly?'active':''}" data-action="relic-equipped-only">● 装備中だけ</button>
   </div>
   <div class="${view.layout==='list'?'relic-v8-list':'relic-v8-grid'}">${cards||'<p class="helper">条件に合う遺物がない。絞り込みを変更してみよう。</p>'}</div>
   ${pagesHtml}
 </div></section>
 </div>
 ${pane('exchange')}
 ${relicExchangeSection(collection,proofs,Boolean(state.serverWallet))}
 </div>
 ${pane('market')}
 ${relicMarketSection(collection,{...proofs,members:state.members??[]},state.selfUserId,Boolean(state.serverWallet),view.marketConfirmation)}
 </div>
 ${pane('records')}
 ${advanced}
 <section class="panel"><div class="card-body"><h2 class="panel-title">📚 モード別・特殊遺物全${catalog.length||210}種類</h2><p class="helper">通常175種・代償付き8種・固有能力7種・雀魂/通話20種を収録した。倍率は上限なしで合算し、共鳴も発動する。一方で代償を持つ遺物は他の効果を減らすため、単純に高レアを並べるだけでは最強とは限らない。</p>${grouped||'<p class="helper">データ取得中。再度この画面を開いてください。</p>'}</div></section>
 <section class="panel"><div class="card-body"><h2 class="panel-title">🟦 Steam限定遺物</h2>
   <p class="helper">監視登録以降に新規解除し、サーバーが検証して<strong>実際にKPを支給した実績</strong>だけが対象だ。当日（9時〜翌9時）にSteamで5,000KPを稼いだ後は、新しいSteam限定遺物を受け取れない。0KPで記録された実績は翌日も対象外。既に受取済みの遺物は保持する。</p>
   ${proofs?.steam?.some(e=>Number(e.earnedToday)>=5000)?'<p class="relic-steam-cap-alert" role="status">🔒 本日のSteam報酬は5,000／5,000KP。限定遺物の新規受け取りは翌朝9時まで停止中だ。</p>':''}
   ${!state.serverWallet?'<p class="helper">本番KP口座へ接続してください。</p>':loading?'<p class="helper">達成記録を確認中…</p>':proofs?.steam?.length?proofs.steam.map(e=>`<div class="asset-line"><span>${esc(e.title)}<br><small>${steamGrade(e.percent)}の遺物 · 世界解除率 ${yen(e.percent)}% ${Number(e.amount)<=0?' · ⛔ 0KP（対象外）':Number(e.earnedToday)>=5000?' · 🔒 当日上限':' · ✅ 支給'+yen(e.amount)+'KP'}</small></span><button type="button" class="action-btn" data-action="relic-claim-steam" data-event="${esc(e.id)}" ${owned('steam.'+e.id)||Number(e.amount)<=0||Number(e.earnedToday)>=5000?'disabled':''}>${owned('steam.'+e.id)?'受取済み':Number(e.amount)<=0?'対象外':Number(e.earnedToday)>=5000?'翌9時まで不可':'獲得'}</button></div>`).join(''):'<p class="helper">監視開始後の新規実績の記録がまだない。監視前の実績は遡及しない。</p>'}
 </div></section>
 <section class="panel"><div class="card-body"><h2 class="panel-title">🟨 ポケモンユナイト限定遺物</h2>
   <p class="helper">サーバーが確定したランク戦の1〜5連勝、または累計10・25・50・100・200勝から獲得。単体で強力な固有能力を持つ。同時装備は1個まで。ガチャ排出・売買・他遺物の解放条件にはしない。</p>
   ${uniteList.map(([id,name,power,condition])=>`<div class="asset-line"><span><strong>${esc(name)}</strong><br><small>${esc(condition)} ・ 戦力 ${yen(power)}</small></span><button type="button" class="action-btn" data-action="relic-claim-unite" data-tier="${esc(id)}" ${!state.serverWallet||owned(id)?'disabled':''}>${owned(id)?'受取済み':'獲得を確認'}</button></div>`).join('')}
 </div></section>
 <p class="helper">※KP上乗せの合算上限は撤廃。VALORANTやクイズ・通話などは検証済みの確定報酬に限る。カジノはプラス精算、株は原価を超えた売却益、競馬とMリーグは賭け金を差し引いた的中利益だけが対象。購入しただけでは報酬を発生させない。</p></div>`;
}
