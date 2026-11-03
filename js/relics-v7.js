// V7 UI: data comes only from authenticated KP wallet / on-demand relic endpoint.
const h=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const num=x=>Number(x??0).toLocaleString('ja-JP');
const date=t=>t?new Date(t).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const rank={transcendent:'超越',ancient:'古代',mythic:'神話',legendary:'伝説',rare:'希少',uncommon:'上質',common:'一般'};
const title=(name)=>'<h2 class="panel-title">'+name+'</h2>';
const section=(t,s)=>'<section class="panel relic-v7-panel"><div class="card-body">'+title(t)+s+'</div></section>';

export function relicBuildSection(proofs){
 const d=proofs?.diagnosis;
 if(!d)return section('🧠 ビルド診断','<p class="helper">KP口座に接続すると、装備4枠を自動診断する。</p>');
 const outcomes=(d.best??[]).map(item=>'<div class="asset-line"><span>'+h(proofs.modeNames?.[item.mode]??item.mode)+'</span>'+
  '<strong>平均＋'+h(item.average)+'%　最大＋'+h(item.max)+'%</strong></div>').join('');
 return section('🧠 ビルド診断',
  '<p class="relic-v7-hero">'+h(d.style)+'</p>'+
  '<div class="relic-v7-stats"><div><small>全対象の平均増加</small><b>＋'+h(d.average)+'%</b></div>'+
  '<div><small>最強の条件差</small><b>'+h(d.volatility)+'pt</b></div></div>'+
  '<h3 class="relic-v7-subtitle">特に強いモード</h3>'+outcomes+
  '<p class="helper">'+h(d.sample)+ '。平均は実際のプレイ頻度や確率を予測したものではなく、指定した条件の試算値だ。</p>');
}
export function relicPresetsSection(collection,proofs){
 const legacy={balanced:'バランス',valorant:'VALORANT',racing:'競馬',casino:'カジノ',market:'株式',risk:'危険なビルド'};
 const fromState=Object.entries(collection?.presets??{}).filter(([,ids])=>Array.isArray(ids)).map(([id,ids])=>({
  id,name:legacy[id]??id,equipped:ids.filter(Boolean).length,
 }));
 const presets=fromState.length?fromState:(Array.isArray(proofs?.presets)?proofs.presets:[]);
 const selected=presets[0]?.id??'';
 const choices=presets.map(p=>'<option value="'+h(p.id)+'">'+h(p.name)+'（'+Number(p.equipped??0)+'/4枠）</option>').join('');
 const disabled=presets.length?'':' disabled';
 return section('💾 自由に名前を付ける装備プリセット',
  '<p class="helper">好きな名前で最大20件保存できる。同じ名前で保存すれば現在の4枠に上書きする。昔の6枠もそのまま読み込める。</p>'+
  '<label class="relic-v7-field" for="relic-preset-name">新しく保存する名前・変更後の名前（24文字まで）</label>'+
  '<input class="relic-v8-name-input" type="text" id="relic-preset-name" maxlength="48" autocomplete="off" placeholder="例：コンペ勝利100%狙い" aria-describedby="relic-preset-hint">'+
  '<p id="relic-preset-hint" class="relic-v8-hint">装備の変更とは別に保存される。KPは消費しない。</p>'+
  '<button type="button" class="action-btn primary relic-v8-save" data-action="relic-save-preset">この名前で新規保存／同名を上書き</button>'+
  '<label class="relic-v7-field" for="relic-preset">保存済みプリセット　'+presets.length+'/20</label>'+
  '<select class="select" id="relic-preset"'+disabled+'>'+ (choices||'<option value="">まだ保存なし</option>')+'</select>'+
  '<div class="relic-v7-actions relic-v8-preset-actions">'+
  '<button type="button" class="action-btn primary" data-action="relic-load-preset"'+disabled+'>この編成に切替</button>'+
  '<button type="button" class="action-btn" data-action="relic-overwrite-preset"'+disabled+'>選択中に上書き</button>'+
  '<button type="button" class="action-btn" data-action="relic-rename-preset"'+disabled+'>入力した名前に変更</button>'+
  '<button type="button" class="action-btn danger" data-action="relic-remove-preset"'+disabled+'>この保存を削除</button></div>');
}

export function relicSummonHistorySection(collection){
 const history=Array.isArray(collection?.summonHistory)?collection.summonHistory:[];
 const entries=history.slice(0,30).map((x,i)=>{
  const highlights=(x.highlights??[]).slice(0,3).map(a=>'<span class="relic-v7-summon-hit">'+h(rank[a.rarity]??a.rarity)+'：'+h(a.name)+'</span>').join('　');
  const other=[...(x.mutations??[]).map(n=>'🧬 '+n),...(x.foils??[]).map(n=>'✨ '+n)].join(' ／ ');
  return '<div class="relic-v7-history-item"><div><strong>'+num(x.count)+'連召喚</strong> · '+h(date(x.at))+
   '<small>累計'+num(x.start)+'～'+num(x.end)+'回目 · '+num(x.cost)+'KP消費</small>'+
   '<p>'+ (highlights||'通常の遺物を獲得')+'</p>'+(other?'<small>'+h(other)+'</small>':'')+'</div>'+
   '<button type="button" class="action-btn" data-action="relic-replay" data-history-index="'+i+'">演出再生</button></div>';
 }).join('');
 return section('📜 神引き・召喚履歴',
  '<p class="helper">V7導入以降の直近30回の召喚記録を保存。過去の召喚結果は変更しない。</p>'+
  (entries||'<p class="helper">召喚すると履歴に記録され、ここから演出を再生できる。</p>'));
}
export function relicSpecialSection(collection){
 const special=Object.values(collection?.items??{}).filter(item=>item.mutation||item.foil);
 const cards=special.map(item=>{
  const mutation=item.mutation?'🧬 '+({prism:'虹彩変異',risk:'偶数覚醒',comeback:'逆境覚醒'}[item.mutation.kind]??'変異')+' +'+item.mutation.percent+'%':'';
  const foil=item.foil?'✨ '+({holographic:'ホログラム',starlit:'星紋',abyss:'深淵'}[item.foil.kind]??'特殊個体')+' +'+item.foil.percent+'%':'';
  return '<div class="relic-v7-special-card"><strong>'+h(item.name)+'</strong><p>'+h([mutation,foil].filter(Boolean).join(' ／ '))+'</p></div>';
 }).join('');
 return section('🧬 突然変異・特殊個体',
  '<div class="relic-v7-stats"><div><small>変異個体</small><b>'+num(collection?.mutatedCount??0)+'</b></div>'+
  '<div><small>特殊外観個体</small><b>'+num(collection?.foilCount??0)+'</b></div></div>'+
  '<p class="helper">重複した通常遺物は1/4,096で変異。通常召喚は1/40,000で特殊外観を獲得する。各遺物IDにつきそれぞれ初回だけ適用される。変異に応じて倍率と発動条件が変わる。</p>'+
  (cards||'<p class="helper">まだ変異・特殊個体は所持していない。</p>'));
}
export function relicEffectLogSection(collection,proofs){
 const entries=[...(collection?.nativeEffects??[]),...(proofs?.externalLogs??[])].sort((a,b)=>b.at-a.at).slice(0,30);
 const cards=entries.map(e=>{
  const names=(e.lines??[]).filter(x=>Number(x.base||0)+Number(x.exotic||0)>0).slice(0,4)
   .map(x=>h(x.name)+' ＋'+num(Number(x.base||0)+Number(x.exotic||0))+'KP').join('、');
  const sets=(e.sets??[]).map(x=>h(x.name)+(x.bonus?' ＋'+num(x.bonus)+'KP':'')).join(' ／ ');
  return '<details class="relic-v7-log"><summary><strong>＋'+num(e.bonus)+' KP</strong> · '+
   h(proofs?.modeNames?.[e.mode]??e.mode)+' · '+h(date(e.at))+'</summary>'+
   '<p>元報酬：'+num(e.amount)+'KP ／ 実効：＋'+(e.amount?((e.bonus/e.amount)*100).toFixed(1):'0')+'%</p>'+
   '<p>'+ (names||'条件に応じた効果')+'</p>'+(sets?'<p>'+sets+'</p>':'')+
   '<small>確定済み'+(e.origin==='verified'?'検証報酬':'KESOゲーム精算')+'の記録</small></details>';
 }).join('');
 return section('📒 発動ログ（実際に支給されたKP）',
  '<p class="helper">確定済みの直近30件を表示。遺物別の追加KP、セット、共鳴を確認できる。表示用の試算ではない。</p>'+
  (cards||'<p class="helper">V7以降にKPボーナスが確定するとここに記録する。</p>'));
}
export function relicEconomySection(collection,proofs){
 const e=proofs?.economy??{};
 const earned=Number(e.nativeTotal??0)+Number(e.verifiedTotal??0);
 const native=Number(e.nativeCount??0),verified=Number(e.verifiedCount??0);
 const avg= native+verified?Math.round(earned/(native+verified)):0;
 const stats=[
  ['遺物で獲得したKP',num(earned)],['召喚で使用したKP',num(e.summonSpent??(collection?.totalSummons??0)*200)],
  ['追加KP／発動1回',num(avg)],['追加KP発動回数',num(native+verified)],
  ['通常召喚累計',num(collection?.totalSummons??0)],['Discord内の検証報酬',num(e.guild?.verifiedTotal??0)],
 ];
 return section('📈 遺物経済ダッシュボード',
  '<p class="helper">本人の実績を中心に、KPがどれくらい増えたかを把握する。ギルド全体は集計値だけを表示し、個人の細かな残高は公開しない。</p>'+
  '<div class="relic-v7-economy">'+stats.map(([key,val])=>'<div><small>'+h(key)+'</small><b>'+h(val)+'</b></div>').join('')+'</div>'+
  '<p class="helper">⚠ V7以前の取引系追加KPは累計の対象外だ。検証報酬はKP台帳から集計し、召喚支出は累計召喚数から算出する。</p>');
}
export function relicCombinationsSection(preview){
 const sets=(preview?.sets??[]).map(x=>'<span class="relic-v7-set">'+h(x.name)+(x.bonus?' ＋'+num(x.bonus)+' KP':'')+'</span>').join('');
 const reversed=preview?.curseReversed?'<strong class="relic-v7-reversed">✨ 呪い反転成功！ 虚無＋銀貨＋元報酬7の倍数</strong>':'';
 return '<div class="relic-v7-combos">'+
  '<p class="helper">同じ系統2個：＋10% ／ 異なる系統3個：＋15% ／ 同レア3個：＋25%。呪い反転は「虚無の王との契約＋双面の魔導銀貨」を装備し、報酬が7の倍数のとき発動する。</p>'+
  (sets||'<p class="helper">現在の試算ではセット効果未発動。</p>')+reversed+'</div>';
}
