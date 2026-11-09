/** Relic peer marketplace; all item amounts and prices are verified server side. */
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const number=x=>Number(x??0).toLocaleString('ja-JP');
export function relicMarketSection(collection,proofs,user,connected,confirmation=null){
 const catalog=new Map((proofs?.catalog??[]).map(x=>[x.id,x]));
 const list=Array.isArray(proofs?.relicMarket)?proofs.relicMarket:[];
 const members=new Map((proofs?.members??[]).map(m=>[m.id,m.name]));
 const mine=Object.values(collection?.items??{}).filter(x=>x.origin==='normal'&&Number(x.count)>=2&&!x.mutation&&!x.foil);
 const myList=list.filter(x=>x.seller===user);
 const selected=list.find(x=>x.id===confirmation);
 return '<section class="panel"><div class="card-body"><h2 class="panel-title">🌑 遺物の闇市</h2>'+
  '<p class="helper">通常召喚の遺物を、ほかのプレイヤーにKPで売買できる。出品時に余剰の1個を預かり、購入が確定したら買主へ渡す。売主の受取額は価格の95%。出品を取り下げると現物が戻る。</p>'+
  '<p class="helper">限定・変異・特殊外観のある遺物と最後の1個は出品不可。出品は1人4件まで。売買は本番口座限定。売却済みの商品を重複購入できない。</p>'+
  '<h3>遺物を出品</h3>'+
  (mine.length?'<div class="field"><label for="relic-market-id">出品する遺物</label><select class="select" id="relic-market-id">'+mine.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'（所持'+number(x.count)+'個）</option>').join('')+'</select></div>'+
   '<div class="field"><label for="relic-market-price">希望価格（100〜100,000,000KP・100KP単位）</label><input class="input" type="number" id="relic-market-price" min="100" max="100000000" step="100" value="5000" inputmode="numeric"></div>'+
   '<button class="action-btn primary" data-action="relic-market-list" '+(!connected||myList.length>=4?'disabled':'')+'>1個を闇市に出品する</button>':
   '<p class="helper">出品できる余剰遺物がない。</p>')+
  '<h3>販売中の遺物（'+number(list.length)+'件）</h3>'+
  (list.length?list.map(x=>{
   const d=catalog.get(x.relic);
   const item='<strong>'+esc(d?.name??x.relic)+'</strong> <span class="badge">'+esc(d?.rarity??'')+'</span>';
   const self=x.seller===user;
   const seller=members.get(x.seller)??(self?'あなた':x.seller);
   return '<div class="history-entry">'+item+'<div class="helper">売主 '+esc(seller)+' ／ '+number(x.price)+' KP ／ 売主の受取 '+number(Math.floor(x.price*.95))+' KP</div>'+
    (self?'<button class="action-btn" data-action="relic-market-cancel" data-listing="'+esc(x.id)+'" '+(!connected?'disabled':'')+'>出品を取り下げる</button>':
    confirmation===x.id?'<p class="market-disclaimer">この遺物を'+number(x.price)+'KPで購入しますか？ 操作を確定すると取り消せません。</p><div class="action-row"><button class="action-btn primary" data-action="relic-market-buy-confirm" data-listing="'+esc(x.id)+'">購入を確定</button><button class="action-btn" data-action="relic-market-buy-abort">戻る</button></div>':
    '<button class="action-btn" data-action="relic-market-buy-preview" data-listing="'+esc(x.id)+'" '+(!connected?'disabled':'')+'>この遺物を購入する</button>')+
    '</div>';
  }).join(''):'<p class="helper">現在出品されている遺物はない。</p>')+
  (selected?'<p class="helper">購入確認中：'+esc(catalog.get(selected.relic)?.name??selected.relic)+'</p>':'')+
  '</div></section>';
}
