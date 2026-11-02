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
