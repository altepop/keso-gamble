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

test('Steam common 25%+ and challenge 10–25% are visible without historical imports',()=>{
 const html=relicsPanel({cash:2000,serverWallet:true,relics:{totalSummons:0,items:{},equipped:[]}},{
  proofs:{steam:[{id:'steam:recent30',title:'新しいZup!実績',percent:30,app:1},
                  {id:'steam:recent15',title:'別の実績',percent:15,app:2},
                  {id:'steam:recent5',title:'希少実績',percent:5,app:3}],
   unite:[{id:'unite.career_25',name:'二十五戦の灯台',power:510,condition:'累計25勝'}],
   catalog:[{id:'normal.universal.rare',name:'全局面の方位磁針',rarity:'rare',mode:'universal',ability:'全体効果'}],
   modeNames:{universal:'全ゲーム共通'} }});
 assert.match(html,/旅路の遺物 · 世界解除率 30%/);
 assert.match(html,/挑戦の遺物 · 世界解除率 15%/);
 assert.match(html,/偉業の遺物 · 世界解除率 5%/);
 assert.match(html,/二十五戦の灯台/);
 assert.match(html,/全局面の方位磁針/);
 assert.match(html,/監視登録以降に新規解除/);
 assert.match(html,/過去の実績には干渉しない/);
});
