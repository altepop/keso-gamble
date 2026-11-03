/** Presentation only: server validates every item ID, amount and shard balance. */
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const num=x=>Number(x??0).toLocaleString('ja-JP');
const rarityNames={common:'一般',uncommon:'上質',rare:'希少',legendary:'伝説',mythic:'神話',ancient:'古代',transcendent:'超越'};
export function relicExchangeSection(collection,proofs,connected){
 const exchange=proofs?.exchange??{};
 const yields=exchange.yields??{};
 const prices=exchange.prices??{};
 const voucherPrice=Number(exchange.horseVoucherPrice)||0;
 const shards=Math.max(0,Number(collection?.shards??0));
 const shardPick=Boolean(collection?.equipped?.includes('normal.ability.shard_pick')&&collection?.items?.['normal.ability.shard_pick']);
 const tickets=Math.max(0,Number(collection?.horseVouchers??0));
 const owned=Object.values(collection?.items??{}).filter(i=>i.origin==='normal'&&Number(i.count)>1&&Number(yields[i.rarity])>0)
  .sort((a,b)=>(Number(yields[b.rarity])||0)-(Number(yields[a.rarity])||0)||a.name.localeCompare(b.name,'ja'));
 const catalog=(proofs?.catalog??[]).filter(d=>Object.hasOwn(prices,d.rarity)).sort((a,b)=>Number(prices[a.rarity])-Number(prices[b.rarity])||a.name.localeCompare(b.name,'ja'));
 const recycleOptions=owned.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.name)+'（'+esc(rarityNames[i.rarity]??i.rarity)+
  '、余剰'+num(i.count-1)+'個、1個につき'+num(Number(yields[i.rarity])+(shardPick?1:0))+'欠片）</option>').join('');
 const exchangeOptions=catalog.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+'（'+esc(rarityNames[d.rarity])+
  '、'+num(prices[d.rarity])+'欠片）</option>').join('');
 const table=Object.keys(yields).map(r=>'<span class="badge">'+esc(rarityNames[r]??r)+'：'+num(yields[r])+'欠片/個</span>').join(' ');
 return '<section class="panel"><div class="card-body"><h2 class="panel-title">🧩 欠片・交換所</h2>'+
  '<p>保有する欠片 <strong>'+num(shards)+'</strong>個 ／ My馬引換券 <strong>'+num(tickets)+'</strong>枚</p>'+
  '<p class="helper">通常遺物の2個目以降を欠片に変えられる。'+(shardPick?'⛏️ 欠片掘りの鑿が装備中：余剰1個につき獲得欠片が＋1。':'')+'最後の1個は必ず残り、装備中の遺物・変異・特殊外観は失われない。限定遺物は対象外。欠片はKPに換金できない。</p>'+
  '<details class="rules"><summary>欠片の獲得数・交換ルール</summary><p>'+table+'</p>'+
  '<p class="helper">好きな通常遺物との交換は伝説以下。神話・古代・超越は召喚限定。引換券はノーマル（通常3,000KP）のMy馬1頭の購入に使用でき、売却時の払い戻しは0KPだ。通常購入と同じ所持上限・1日の交換制限を受ける。</p></details>'+
  '<div class="relic-exchange-recycle"><h3>🧩 被った遺物を欠片にする</h3>'+
  (owned.length?'<label>交換する遺物<select class="select" id="relic-recycle-id">'+recycleOptions+'</select></label>'+
   '<label>交換する個数（最大1000）<input class="select" type="number" id="relic-recycle-count" min="1" max="1000" step="1" value="1" inputmode="numeric"></label>'+
   '<button type="button" class="action-btn" data-action="relic-recycle" '+(!connected?'disabled':'')+'>欠片に変える</button>':
   '<p class="helper">余剰の通常遺物がまだない。</p>')+'</div>'+
  '<div class="relic-exchange-shop"><h3>🎁 好きな遺物を選んで交換</h3>'+
  (catalog.length?'<label>欲しい遺物<select class="select" id="relic-shop-id">'+exchangeOptions+'</select></label>'+
   '<p class="helper">所持済みでも、同じ遺物を1個追加できる。交換では召喚レベル・特殊個体の抽選は進まない。</p>'+
   '<button type="button" class="action-btn primary" data-action="relic-shop" '+(!connected?'disabled':'')+'>欠片で交換する</button>':
   '<p class="helper">交換対象を読み込んでいる。</p>')+'</div>'+
  '<div class="relic-exchange-voucher"><h3>🐴 My馬引換券</h3>'+
   '<p>引換券1枚：<strong>'+num(voucherPrice)+'欠片</strong>（ノーマルボックス専用）</p>'+
   '<button type="button" class="action-btn" data-action="relic-voucher" '+(!connected||!voucherPrice||shards<voucherPrice?'disabled':'')+'>引換券を入手する</button>'+
   '<p class="helper">引換券を使うと、ノーマルボックスの馬をKP消費なしで1頭獲得する。馬の能力は通常と同じ抽選だ。</p>'+
   '<label>馬の名前（1〜12文字）<input class="select" type="text" maxlength="12" id="relic-voucher-name" placeholder="名前を入力"></label>'+
   '<button type="button" class="action-btn" data-action="relic-voucher-buy" '+(!connected||tickets<1?'disabled':'')+'>引換券でMy馬を迎える</button></div>'+
  '</div></section>';
}
