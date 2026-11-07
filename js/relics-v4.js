import {relicCombinationsSection} from './relics-v7.js?v=web-0f68b2c668fb1902';
// Presentation-only helpers; KP, ownership and equipped slots stay server authoritative.
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const number=x=>Number(x??0).toLocaleString('ja-JP');
export const relicRarityNames={common:'一般',uncommon:'上質',rare:'希少',legendary:'伝説',mythic:'神話',ancient:'古代',transcendent:'超越',exclusive:'限定'};
export const relicDefaultView=()=>({query:'',source:'all',rarity:'all',mode:'all',sort:'power',ownership:'all',page:0,section:'collection',layout:'grid',equippedOnly:false,exchangeQuery:'',exchangeOwnership:'all',exchangeSort:'price',exchangeSelected:''});
const displayMode=(item,source,modeNames)=>{
 const mode=source.get(item.id)?.mode??item.mode??'universal';
 return modeNames?.[mode]??(item.origin==='steam'?'Steam実績':item.origin==='unite'?'ユナイト':'全ゲーム共通');
};
export function relicInventory(items,source,modeNames,view={},equipped=[]){
 const v={...relicDefaultView(),...view};
 const q=String(v.query||'').trim().toLocaleLowerCase('ja-JP');
 // Public server catalog is display-only: unowned entries never enter the wallet.
 const ownedIds=new Set(items.map(i=>i.id));
 const undiscovered=[...source.values()].filter(d=>d?.id&&d?.rarity&&!ownedIds.has(d.id))
  .map(d=>({...d,origin:'normal',count:0,unowned:true}));
 const combined=[...items,...undiscovered];
 const matching=combined.filter(i=>{
  const unowned=i.unowned===true;
  if(v.ownership==='owned'&&unowned)return false;
  if(v.ownership==='unowned'&&!unowned)return false;
  const def=source.get(i.id);
  const mode=def?.mode??i.mode??'universal';
  if(v.equippedOnly&&!equipped.includes(i.id))return false;
  if(v.source!=='all'&&v.source!==i.origin)return false;
  if(v.rarity!=='all'&&v.rarity!==i.rarity)return false;
  if(v.mode!=='all'&&v.mode!==mode)return false;
  if(!q)return true;
  return [i.name,def?.name,i.ability,def?.ability,displayMode(i,source,modeNames),relicRarityNames[i.rarity]].some(x=>String(x??'').toLocaleLowerCase('ja-JP').includes(q));
 });
 matching.sort((a,b)=>{
  const aDef=source.get(a.id),bDef=source.get(b.id);
  if(v.sort==='copies')return b.count-a.count||b.power-a.power;
  if(v.sort==='percent')return ((bDef?.percent??b.percent??0)+(b.foil?.percent??0)+(b.mutation?.percent??0))-((aDef?.percent??a.percent??0)+(a.foil?.percent??0)+(a.mutation?.percent??0))||b.power-a.power;
  if(v.sort==='rarity'){
   const seq=Object.keys(relicRarityNames);
   return seq.indexOf(b.rarity)-seq.indexOf(a.rarity)||b.power-a.power;
  }
  if(v.sort==='owned')return Number(Boolean(a.unowned))-Number(Boolean(b.unowned))||b.power-a.power;
  if(v.sort==='name')return (aDef?.name??a.name).localeCompare(bDef?.name??b.name,'ja');
  return b.power-a.power||(aDef?.name??a.name).localeCompare(bDef?.name??b.name,'ja');
 });
 const perPage=12,totalPages=Math.max(1,Math.ceil(matching.length/perPage));
 const page=Math.max(0,Math.min(totalPages-1,Number(v.page)||0));
 return {matches:matching.slice(page*perPage,(page+1)*perPage),matching:matching.length,page,totalPages,all:items.length,unowned:undiscovered.length,total:combined.length};
}
const options=(items,value)=>items.map(([id,label])=>'<option value="'+esc(id)+'"'+(id===value?' selected':'')+'>'+esc(label)+'</option>').join('');
export function relicFilterControls(view,modeNames,inv){
 const v={...relicDefaultView(),...view};
 return '<div class="relic-controls"><label class="relic-search-label" for="relic-search">遺物を検索</label>'+
  '<input id="relic-search" class="relic-search" type="search" data-relic-filter="query" placeholder="名前・能力・対象ゲーム" autocomplete="off" value="'+esc(v.query)+'">'+
  '<div class="relic-filter-grid">'+
  '<label>入手元<select class="select" data-relic-filter="source" id="relic-source">'+options([['all','すべて'],['normal','通常召喚'],['steam','Steam'],['unite','ユナイト']],v.source)+'</select></label>'+
  '<label>所持状況<select class="select" data-relic-filter="ownership" id="relic-ownership">'+options([['all','すべて'],['owned','所持のみ'],['unowned','未所持のみ']],v.ownership)+'</select></label>'+
  '<label>レアリティ<select class="select" data-relic-filter="rarity" id="relic-rarity">'+options([['all','すべて'],...Object.entries(relicRarityNames)],v.rarity)+'</select></label>'+
  '<label>ゲーム・効果先<select class="select" data-relic-filter="mode" id="relic-mode">'+options([['all','すべて'],...Object.entries(modeNames??{})],v.mode)+'</select></label>'+
  '<label>並べ替え<select class="select" data-relic-filter="sort" id="relic-sort">'+options([['power','戦力が高い順'],['percent','倍率が高い順'],['rarity','レア度が高い順'],['copies','所持数が多い順'],['owned','所持品を先に'],['name','名前順']],v.sort)+'</select></label></div>'+
  '<p class="relic-found">表示 '+number(inv.matching)+'種類 / 全'+number(inv.total??inv.all)+'種類（所持 '+number(inv.all)+'・未所持 '+number(inv.unowned??0)+'） · '+(inv.page+1)+'/'+inv.totalPages+'ページ</p></div>';
}
export function relicItemCard(item,source,modeNames,equipped,exchangePrices={}){
 const def=source.get(item.id),rarity=Object.hasOwn(relicRarityNames,item.rarity)?item.rarity:'exclusive';
 const label=relicRarityNames[rarity],name=def?.name??item.name;
 const mode=displayMode(item,source,modeNames);
 const effect=def?.ability??item.ability??'効果未設定';
 const conditions={spark:'報酬獲得時',rescue:'少額報酬時',advance:'基準額以上',surge:'基準額以上',
 highroll:'高額報酬時',master:'勝利・達成時',sovereign:'勝利・達成時',
 lucky7:'末尾7の報酬',odd:'奇数KPの報酬',even:'偶数KPの報酬',prime:'素数KPの報酬',
 square:'平方数KPの報酬',quarter:'25の倍数KPの報酬',mod11:'11の倍数KPの報酬',
 mod13:'13の倍数KPの報酬',digit7:'桁の合計が7の倍数',double:'数字が2つ連続',
 reverse:'左右対称の数字',near:'基準額+50以内',thin:'基準額未満',heavy:'高額ラインの2倍以上',
 triple:'3の倍数',lucky77:'数字に77を含む'};
 const base=Number(def?.percent??item.percent??0);
 const special=Boolean(def?.special);
 const duplicates=item.origin==='normal'&&!special?Math.min(5,Math.floor(Math.log2(Math.max(1,Number(item.count)||1)))):0;
 const effective=base+duplicates+(!special?(item.mutation?.percent??0)+(item.foil?.percent??0):0);
 const extraTitle=(item.foil?'✨ '+({holographic:'ホログラム',starlit:'星紋',abyss:'深淵'}[item.foil.kind]??'特殊個体')+' ／ ':'')+
  (item.mutation?'🧬 '+({prism:'虹彩変異',risk:'偶数覚醒',comeback:'逆境覚醒'}[item.mutation.kind]??'突然変異'):'');
 const headline=def?.short??(conditions[item.skill]??'条件を満たした時')+'：KP報酬＋'+base+'%';
 const cap=Number(def?.cap??item.cap??0); // kept as legacy definition; no longer a payout ceiling
 const trait=def?.trait??(item.origin==='steam'||item.origin==='unite'?'出自の加護：条件達成時に固定KPを追加':'');
 const title=item.origin==='unite'?'ユナイト限定':item.origin==='steam'?'Steam実績限定':'通常召喚';
 const isEquipped=equipped.includes(item.id);
 const unowned=item.unowned===true;
 const count=unowned?0:(Number(item.count)||1);
 const exchangePrice=item.origin==='normal'?Number(exchangePrices[item.rarity]??0):0;
 return '<article class="relic-card relic-rarity-'+rarity+(unowned?' relic-unowned':'')+(isEquipped?' relic-equipped':'')+(item.foil?' relic-holographic':'')+(item.mutation?' relic-mutated':'')+'">'+
  '<div class="relic-card-top"><span class="relic-rarity-badge">'+esc(label)+'</span><span class="relic-mode">'+esc(mode)+'</span></div>'+
  '<span class="relic-ownership-badge '+(unowned?'missing':'owned')+'">'+(unowned?'◇ 未所持':'✓ 所持済み')+'</span>'+
  '<strong class="relic-card-title">'+esc(name)+'</strong>'+(extraTitle?'<p class="relic-v7-item-badges">'+esc(extraTitle)+'</p>':'')+
  '<p class="relic-card-effect"><b>'+esc(headline)+'</b></p>'+
  '<div class="relic-card-stats"><span class="relic-percent-stat">'+(special?'固有能力 <b>倍率なし</b>':'設定 <b>＋'+esc(effective)+'%</b>')+'</span><span class="relic-v8-extra-stat">合算上限 <b>なし</b></span><span class="relic-v8-extra-stat">戦力 <b>'+number(item.power)+'</b></span><span>所持 <b>'+number(count)+'</b></span>'+(isEquipped?'<span class="relic-current">● 装備中</span>':'')+'</div>'+
  '<details class="relic-card-detail"><summary>'+(unowned?'効果の詳細・入手方法':'効果の詳細・装備')+'</summary>'+
  '<p>入手方法：'+esc(title)+'</p><p>対象：'+esc(mode)+'</p><p>元の効果：＋'+esc(base)+'%'+(duplicates?' ／ 重複強化：＋'+duplicates+'ポイント':'')+'</p>'+(extraTitle?'<p>変異・特殊個体の条件付き効果：'+esc(extraTitle)+'。発動条件で実際の倍率が変化する。</p>':'')+(trait?'<p class="relic-trait">★ '+esc(trait)+'</p>':'')+'<p>'+esc(effect)+'</p>'+(def?.drawback?'<p class="relic-drawback">⚠ デメリット：'+esc(def.drawback)+'</p>':'')+
  (item.origin==='normal'&&!unowned?'<p>重ねて入手すると戦力が成長する。現在の育成段階：'+number(1+Math.floor(Math.log2(count)))+'</p>':'')+
  (unowned?'<p class="relic-unowned-help">未所持のため装備はできない。図鑑では効果を確認できる。</p>':
   '<button type="button" class="action-btn" data-action="relic-equip" data-relic="'+esc(item.id)+'">'+(isEquipped?'別の枠に装備':'指定枠に装備')+'</button>')+
  (exchangePrice>0?'<button type="button" class="action-btn" data-action="relic-open-exchange" data-relic="'+esc(item.id)+'">🧩 欠片交換で確認（'+number(exchangePrice)+'欠片）</button>':'')+'</details></article>';
}
export function relicInventoryPages(inv){
 return '<div class="relic-pagination"><button type="button" class="action-btn" data-action="relic-page" data-page="'+(inv.page-1)+'"'+(inv.page===0?' disabled':'')+'>← 前の12件</button>'+
  '<span>'+(inv.page+1)+' / '+inv.totalPages+'</span>'+
  '<button type="button" class="action-btn" data-action="relic-page" data-page="'+(inv.page+1)+'"'+(inv.page+1===inv.totalPages?' disabled':'')+'>次の12件 →</button></div>';
}
export function relicRevealPanel(reveal){
 if(!reveal)return '';
 const summary=reveal.summary??{},highlights=Array.isArray(reveal.highlights)?reveal.highlights:[];
 const rank=['transcendent','ancient','mythic','legendary','rare','uncommon','common'];
 const rarity=rank.find(x=>Number(summary[x])>0)??'common';
 const title={transcendent:'🌈 超越、降臨',ancient:'✴ 古代遺物、覚醒',mythic:'◆ 神話遺物、顕現',legendary:'✦ 伝説遺物、解放'}[rarity]??'召喚完了 · '+(relicRarityNames[rarity]??rarity);
 const big=['legendary','mythic','ancient','transcendent'].includes(rarity);
 const top=highlights.filter(x=>x.rarity===rarity).slice(0,4);
 const breakdown=rank.filter(k=>Number(summary[k])>0).map(k=>'<span class="relic-result-pill relic-rarity-'+k+'">'+esc(relicRarityNames[k])+' × '+number(summary[k])+'</span>').join('');
 const extra=[...(reveal.mutations??[]).map(x=>'🧬 突然変異 '+x),...(reveal.foils??[]).map(x=>'✨ 特殊個体 '+x)].slice(0,5);
 const extraHtml=extra.length?'<div class="relic-v7-extras">'+extra.map(x=>'<strong>'+esc(x)+'</strong>').join('')+'</div>':'';
 const symbols=['✦','◇','✧','✶','✷','⌘','✧','◇'];
 const runes=big?'<div class="relic-cinematic-runes" aria-hidden="true">'+symbols.map((g,i)=>'<span style="--rune-index:'+i+'">'+g+'</span>').join('')+'</div>':'';
 const rays=big?'<div class="relic-cinematic-rays" aria-hidden="true">'+Array.from({length:8},(_,i)=>'<i style="--ray-index:'+i+'"></i>').join('')+'</div>':'';
 const seals=big?'<div class="relic-cinematic-rings" aria-hidden="true"><i></i><i></i><i></i></div><div class="relic-cinematic-flash" aria-hidden="true"></div>':'';
 const overline=big?'✶ '+(rarity==='transcendent'?'最上位の神域へ':rarity==='ancient'?'禁じられた遺物の目覚め':rarity==='mythic'?'伝承を超えた力':'黄金の封印が解かれる')+' ✶':'';
 return '<div class="relic-reveal relic-reveal-'+rarity+(big?' relic-reveal-cinematic':'')+'" role="dialog" aria-modal="true" aria-labelledby="relic-result-title">'+
  '<div class="relic-reveal-content"><div class="relic-cinematic-ceremony" aria-hidden="true">'+rays+seals+runes+'<div class="relic-summon-orb"><span>✦</span></div></div>'+
  '<p class="relic-reveal-overline">'+number(reveal.count)+'連召喚 · '+number(reveal.cost)+' KP</p>'+
  (big?'<p class="relic-cinematic-subtitle">'+esc(overline)+'</p>':'')+
  '<h2 id="relic-result-title">'+esc(title)+'</h2>'+
  (top.length?'<div class="relic-highlight">'+top.map((x,i)=>'<strong class="relic-reveal-hit relic-reveal-hit-'+rarity+'" style="--hit:'+i+'">'+esc(x.name)+'</strong>').join('')+'</div>':
   '<p class="relic-reveal-note">獲得した遺物は図鑑に追加された。</p>')+
  '<div class="relic-result-breakdown">'+breakdown+'</div>'+extraHtml+
  (big?'<div class="relic-reveal-actions"><button type="button" class="action-btn relic-skip-btn" data-action="relic-reveal-skip">演出をスキップ</button><button type="button" class="action-btn relic-sound-btn" data-action="relic-reveal-sound">♫ 効果音をもう一度聴く</button></div>':'')+
  '<button type="button" class="action-btn primary relic-reveal-close" data-action="relic-reveal-close">結果を確認して図鑑へ</button>'+
  '<p class="relic-reveal-footnote">抽選はサーバーで確定済み。スキップしても獲得結果は変わらない。動きの軽減設定にも対応。</p></div></div>';
}

/** Pure HTML view of server-generated examples: no KP or outcome is decided in the browser. */
export function relicBonusDashboard(state,proofs,view={}){
 const previews=Array.isArray(proofs?.previews)?proofs.previews:[];
 const modes=proofs?.modeNames??{};
 const mode=String(view.previewMode??'competitive');
 const amount=Number(view.previewAmount??500);
 const current=previews.find(x=>x.mode===mode&&x.amount===amount);
 const select=(id,value,options)=>'<select class="select" data-relic-preview="'+id+'" id="relic-preview-'+id+'">'+
  options.map(([key,label])=>'<option value="'+esc(key)+'"'+(String(key)===String(value)?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select>';
 const availableModes=[...new Set(previews.map(x=>x.mode))];
 const controls='<div class="relic-preview-controls"><label>対象ゲーム'+
  select('mode',mode,availableModes.map(x=>[x,modes[x]??x]))+'</label><label>報酬の例'+
  select('amount',amount,(mode==='spikerush'?[20,40,100,500]:[100,500,900,5000]).map(x=>[x,number(x)+' KP']))+'</label></div>';
 const recent=(Array.isArray(state?.ledger)?state.ledger:[]).filter(x=>x.kind==='relic').slice(0,3);
 const recentHtml=recent.length?'<div class="relic-last-real"><b>確定済みの遺物ボーナス（最新3件）</b><small>コンペ・アンレ・雀魂などハラハラ枠は勝てば上限なし、最下位やラスは遺物の倍率で損も膨らむ（借KPあり）。スパイクラッシュは基礎40／20KPで計算し、追加分は勝ち400／負け200KPまで。ほかの安全枠は元の報酬と同額まで。</small>'+
  recent.map(x=>Number(x.delta)>0?'<span>実際に付与：<strong>＋'+number(x.delta)+' KP</strong></span>':
   Number(x.delta)<0?'<span>🩸 反動：<strong>−'+number(-Number(x.delta))+' KP</strong></span>':'').join('')+
  '</div>':'';
 const last=proofs?.lastNativeEffect;
 const lastHtml=last&&Number.isFinite(last.bonus)
   ?'<div class="relic-last-real"><b>直近の実支給</b><span>'+esc(modes[last.mode]??last.mode)+
    '：'+number(last.amount)+' KPに対し <strong>＋'+number(last.bonus)+' KP（実効＋'+esc(last.percent)+'%）</strong></span>'+
    '<small>'+esc((last.names??[]).join('・'))+'</small></div>'
   :'<p class="helper">取引系の追加KPが確定すると、ここに直近の実績が表示される。</p>';
 if(!current)return '<section class="panel"><div class="card-body"><h2 class="panel-title">📊 遺物の効果を数値で見る</h2>'+
  '<p class="helper">効果一覧は本番KP口座から取得する。装備中の倍率と実際の受取額を表示する。</p>'+lastHtml+recentHtml+'</div></section>'
 const lines=current.lines??[];
 const items=lines.map(line=>{
  const label=line.trait?' <span class="relic-trait-tag">'+esc(line.trait)+'</span>':'';
  const pact=(proofs?.catalog??[]).find(item=>item.id===line.id);
  const drawback=pact?.drawback?'<small class="relic-risk-notice">⚠ '+esc(pact.drawback)+'</small>':'';
  const active=Number(line.base??0)+Number(line.exotic??0);
  return '<div class="relic-preview-row"><div><b>'+esc(line.name)+'</b>'+label+
   '<small>'+esc(line.reason)+'</small>'+drawback+'</div><div class="relic-preview-stats"><strong>'+(pact?.special?'固有能力':'＋'+esc(line.effectivePercent)+'%')+'</strong>'+
   '<span>実例 '+(active?'+':'')+number(active)+' KP ／ 実効 '+(Number(amount)>0?((active/amount)*100).toFixed(1):'0')+'%</span>'+
   (line.exotic?'<small>特殊効果 ＋'+number(line.exotic)+' KP</small>':'')+'</div></div>';
 }).join('');
 const realPercent=Number(current.effectivePercent)||0;
 const cap=Number(current.cap)||0;
 const spikeCount=Number(proofs?.spikeGamesBefore??0);
 const opening=current.spikeOpening;
 const spikeHeadline=mode==='spikerush'
  ?'<div class="relic-spike-kick"><strong>⚡ スパイクラッシュ初動強化｜通算'+number(spikeCount+1)+'試合目</strong>'+
    (opening?'<p>対象遺物 <b>'+number(opening.eligible)+'個</b> · 1個ごとに固定 <b>＋'+number(opening.flatPerRelic)+'KP</b> · 倍率分 <b>×'+opening.multiplier+'</b></p>':
    '<p>41試合目以降は通常の遺物倍率。対象遺物が装備されていれば引き続き発動する。</p>')+
    '<small>初動の追加効果はスパイクラッシュ対応遺物と全モード対応遺物だけ。装備していない遺物・他ゲーム専用遺物には乗らない。</small></div>'
  :'';
 return '<section class="panel"><div class="card-body"><h2 class="panel-title">📊 今の装備で何％増える？</h2>'+
  '<p class="helper">装備中の4枠をサーバーで計算する。勝利・達成時（取引系は精算時）の報酬を例にした試算だ。</p>'+
  controls+spikeHeadline+
  '<div class="relic-preview-total"><div><small>発動した設定倍率（デメリット適用前）</small><b>＋'+esc(current.percent)+'%</b></div>'+
  '<div><small>上限を反映した追加報酬</small><b>＋'+number(current.bonus)+' KP</b></div>'+
  '<p>元の報酬 '+number(amount)+' KP → 遺物込み <strong>'+number(amount+current.bonus)+' KP</strong>（実効＋'+esc(realPercent)+'%）</p></div>'+
  '<p class="relic-cap-note">発動した効果の合計 '+number(current.gross)+' KP。倍率の合算・追加KPにゲーム内の人工的な上限はない'+
  (Number(current.resonance)>0?' ／ 七重共鳴 ＋'+number(current.resonance)+' KPを含む':'')+
  '。'+(['casino','racing','market','mleague'].includes(mode)?'取引系は実際に利益が確定した場合に発動する。':'検証済み報酬だけに発動する。')+'</p>'+
  relicCombinationsSection(current)+
  '<h3 class="relic-readout-title">装備別の効果</h3>'+
  (lines.length?items:'<p class="helper">遺物を装備すると、ここに各遺物の倍率が表示される。</p>')+
  '<small class="relic-example-note">赤い代償がある遺物は、ほかの効果を減少・無効化することがある。上の「実効＋%」が実際の追加率だ。試算はKPを消費しない。</small>'+
  lastHtml+recentHtml+'</div></section>';
}
