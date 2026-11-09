import test from 'node:test';
import assert from 'node:assert/strict';
import {relicInventory,relicFilterControls,relicItemCard,relicInventoryPages,relicRevealPanel,relicDefaultView} from '../js/relics-v4.js';

const make=(n,props={})=>({id:'normal.item'+n,name:'遺物 '+n,origin:'normal',rarity:n%2?'rare':'common',
 power:n*4,ability:'素数のときに発動。',mode:n%2?'competitive':'racing',count:1,...props});

test('inventory paginates to 12 items, filters mode and rarity and keeps original collection',()=>{
 const items=Array.from({length:31},(_,n)=>make(n+1));
 const before=JSON.stringify(items);
 const all=relicInventory(items,new Map(),{},relicDefaultView());
 assert.equal(all.matching,31);
 assert.equal(all.matches.length,12);
 assert.equal(all.totalPages,3);
 assert.equal(relicInventory(items,new Map(),{},{page:2}).matches.length,7);
 assert.equal(relicInventory(items,new Map(),{},{rarity:'rare',mode:'competitive'}).matching,16);
 assert.equal(relicInventory(items,new Map(),{},{source:'steam'}).matching,0);
 const ordered=relicInventory(items,new Map(),{},{sort:'name'});
 assert.equal(ordered.matches.length,12);
 assert.equal(JSON.stringify(items),before);
 assert.match(relicInventoryPages(all),/次の12件/);
});
test('inventory description and search are safely escaped and color coding survives',()=>{
 const item=make(3,{name:'<script>alert(1)</script>',ability:'数値<svg onload=alert(1)>'});
 const html=relicItemCard(item,new Map(),{competitive:'コンペ'},[item.id]);
 assert.match(html,/relic-rarity-rare/);
 assert.match(html,/装備中/);
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(!html.includes('<script>'));
 const filters=relicFilterControls({query:'<b>unsafe</b>',rarity:'rare'},{competitive:'コンペ'},
 {matching:1,all:1,page:0,totalPages:1});
 assert.match(filters,/&lt;b&gt;unsafe&lt;\/b&gt;/);
 assert.match(filters,/relic-sort/);
 assert.match(filters,/value="rare" selected/);
});
test('reveal has separate transcendent ceremony, retains fixed server result and dismiss control',()=>{
 const html=relicRevealPanel({count:100,cost:20000,summary:{transcendent:1,common:99},
 highlights:[{rarity:'transcendent',name:'万象を越える遺物'}]});
 assert.match(html,/超越、降臨/);
 assert.match(html,/relic-reveal-transcendent/);
 assert.match(html,/万象を越える遺物/);
 assert.match(html,/data-action="relic-reveal-close"/);
 assert.match(html,/抽選はサーバーで確定済み/);
 assert.equal(relicRevealPanel(null),'');
});

test('unowned normal relics remain visible, searchable and sortable without joining wallet inventory',()=>{
 const owned=make(1,{id:'normal.owned',name:'既所持',rarity:'rare',power:70});
 const missing={id:'normal.missing',name:'まだ見ぬ冠',rarity:'transcendent',mode:'voice',power:900,ability:'<svg>未知の効果',percent:0};
 const other={id:'normal.race',name:'競馬の光',rarity:'common',mode:'racing',power:1,ability:'競馬向け'};
 const catalog=new Map([[missing.id,missing],[other.id,other]]);
 const before=JSON.stringify(owned);
 const all=relicInventory([owned],catalog,{voice:'通話',racing:'競馬'},{sort:'rarity'});
 assert.equal(all.total,3);
 assert.equal(all.all,1);
 assert.equal(all.unowned,2);
 assert.equal(all.matching,3);
 assert.equal(all.matches[0].id,missing.id);
 assert.equal(relicInventory([owned],catalog,{}, {ownership:'unowned'}).matching,2);
 assert.equal(relicInventory([owned],catalog,{}, {ownership:'owned'}).matching,1);
 assert.equal(relicInventory([owned],catalog,{voice:'通話'}, {ownership:'unowned',query:'通話'}).matches[0].id,missing.id);
 assert.equal(relicInventory([owned],catalog,{}, {sort:'owned'}).matches[0].id,owned.id);
 assert.equal(relicInventory([owned],catalog,{}, {ownership:'unowned',equippedOnly:true},[owned.id]).matching,0);
 assert.equal(JSON.stringify(owned),before);
 const card=relicItemCard({...missing,count:0,unowned:true,origin:'normal'},catalog,{voice:'通話'},[],{transcendent:0});
 assert.match(card,/◇ 未所持/);
 assert.match(card,/未所持のため装備はできない/);
 assert.doesNotMatch(card,/data-action="relic-equip"/);
 assert.ok(!card.includes('<svg>'));
 const exchangeable=relicItemCard({...other,count:0,unowned:true,origin:'normal'},catalog,{},[],{common:120});
 assert.match(exchangeable,/data-action="relic-open-exchange" data-relic="normal.race"/);
 const filters=relicFilterControls({ownership:'unowned'},{voice:'通話'},all);
 assert.match(filters,/data-relic-filter="ownership"/);
 assert.match(filters,/未所持のみ/);
 assert.match(filters,/未所持 2/);
});
