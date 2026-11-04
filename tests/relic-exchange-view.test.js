import test from 'node:test';
import assert from 'node:assert/strict';
import {relicExchangeSection} from '../js/relic-exchange-view.js';

const catalog=[
 {id:'normal.have',name:'持っている護符',rarity:'common',mode:'voice',ability:'通話の手当'},
 {id:'normal.missing',name:'未発見の短剣',rarity:'rare',mode:'racing',short:'追加報酬'},
 {id:'normal.unseen',name:'幻の火種',rarity:'legendary',mode:'voice',ability:'大きな効果'},
 {id:'normal.secret',name:'超越の秘密',rarity:'transcendent',mode:'voice',ability:'超越の効果'},
];
const proofs={catalog,modeNames:{voice:'通話',racing:'競馬'},exchange:{prices:{common:20,rare:150,legendary:800},yields:{common:1,rare:5,legendary:20},horseVoucherPrice:100}};
const coll={items:{'normal.have':{id:'normal.have',name:'持っている護符',origin:'normal',rarity:'common',count:2}},equipped:[],shards:100,horseVouchers:0};

test('exchange filters only purchasable items and labels owned and missing candidates',()=>{
 const html=relicExchangeSection(coll,proofs,true);
 assert.match(html,/全3種類（所持 1・未所持 2）/);
 assert.match(html,/未所持のみ/);
 assert.match(html,/必要欠片が少ない順/);
 assert.match(html,/必要欠片が多い順/);
 assert.match(html,/✓ 所持 2/);
 assert.match(html,/◇ 未所持/);
 assert.doesNotMatch(html,/超越の秘密/);
 assert.match(html,/欠片で交換する/);
 assert.match(html,/data-relic-exchange-filter="exchangeSelected"/);
});

test('shop search, ownership and selected item use read-only catalog and show shortfall',()=>{
 const html=relicExchangeSection(coll,proofs,true,{exchangeQuery:'短剣',exchangeOwnership:'unowned',exchangeSort:'price-desc'});
 assert.match(html,/条件に一致：1種類/);
 assert.match(html,/未発見の短剣/);
 assert.doesNotMatch(html,/value="normal.have"[^>]*>✓ 所持/);
 assert.match(html,/あと <b>50欠片<\/b>必要/);
 assert.match(html,/data-action="relic-shop" disabled/);
 const chosen=relicExchangeSection({...coll,shards:1000},proofs,true,{exchangeSelected:'normal.unseen'});
 assert.match(chosen,/value="normal.unseen" selected/);
 assert.match(chosen,/今すぐ交換できる欠片がある/);
 assert.match(chosen,/data-action="relic-shop" >/);
});

test('exchange output escapes injected catalog metadata and supports zero results',()=>{
 const hostile={...proofs,catalog:[{id:'normal.unsafe',name:'<img src=x onerror=alert(1)>',rarity:'rare',ability:'<script>alert(1)</script>'}]};
 const html=relicExchangeSection(coll,hostile,true,{exchangeOwnership:'unowned'});
 assert.ok(!html.includes('<script>')&&!html.includes('<img src='));
 assert.match(html,/&lt;img/);
 const empty=relicExchangeSection(coll,proofs,true,{exchangeQuery:'ありえない'});
 assert.match(empty,/条件に合う交換対象がない/);
 assert.doesNotMatch(empty,/data-action="relic-shop"/);
});
