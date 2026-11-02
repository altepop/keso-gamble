import test from 'node:test';
import assert from 'node:assert/strict';
import {relicsPanel} from '../js/relics-view.js';
test('200KP召喚と強力なユナイト限定遺物を明示するがセットを要求しない',()=>{
 const html=relicsPanel({cash:351000,serverWallet:true,relics:{totalSummons:500,items:{},equipped:[]}},{
  proofs:{steam:[{id:'steam:test',title:'Danger <script>alert(1)</script>',percent:0.06,app:12}]}});
 assert.match(html,/200 KP／1回/);
 assert.match(html,/1000連 · 200,000 KP/);
 for(const name of ['テイアの守護核','伝説を奪う手','レックウザの逆鱗'])assert.ok(html.includes(name));
 assert.match(html,/620/);
 assert.match(html,/Steam限定遺物/);
 assert.doesNotMatch(html,/<script>/);
 for(const no of ['ユナイト遺物と組み合わせると','ユナイト必須','相性のいい遺物','ユナイトと合わせる','KESO LOOP限定遺物を入手'])assert.ok(!html.includes(no),no);
});
test('Steam receipts and Unite claims correctly switch to received for owned exclusives',()=>{
 const html=relicsPanel({
  cash:900,serverWallet:true,
  relics:{totalSummons:0,equipped:['unite.five_wins'],items:{
   'unite.five_wins':{id:'unite.five_wins',name:'レックウザの逆鱗',origin:'unite',rarity:'exclusive',power:620,ability:'単独',count:1},
   'steam.steam:test':{id:'steam.steam:test',name:'実績遺物',origin:'steam',rarity:'exclusive',power:220,ability:'単独',count:1},
  }}
 },{proofs:{steam:[{id:'steam:test',title:'実績',percent:0.06,app:12}]}});
 assert.match(html,/受取済み/);
 assert.match(html,/戦力合計：<strong>620/);
 assert.match(html,/data-action="relic-summon" data-count="10" disabled/);
 assert.match(html,/data-action="relic-summon" data-count="1"/);
});
