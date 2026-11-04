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
 assert.match(html,/監視登録以降に新規解除/);
 assert.match(html,/0KPで記録された実績は翌日も対象外/);
});

test('連続召喚中は全てのガチャ購入ボタンを即時無効化し通信中と知らせる',()=>{
 const state={cash:300000,serverWallet:true,relics:{totalSummons:1500,items:{},equipped:[]}};
 const html=relicsPanel(state,{view:{section:'summon'},summonBusy:true});
 assert.match(html,/召喚を処理中/);
 for(const n of [1,10,100,1000]){
  assert.match(html,new RegExp('data-action="relic-summon" data-count="'+n+'" disabled'));
 }
 const settled=relicsPanel(state,{view:{section:'summon'},summonBusy:false});
 assert.doesNotMatch(settled,/召喚を処理中/);
 assert.match(settled,/data-action="relic-summon" data-count="10" >/);
});


test('図鑑を装備の入口とし、ビルド・試算は装備確認と効果試算を案内する',()=>{
 const item={id:'normal.universal.common',name:'どこでも効く銅貨',origin:'normal',rarity:'common',mode:'universal',power:10,count:1,ability:'全体効果'};
 const state={cash:2000,serverWallet:true,relics:{totalSummons:1,items:{[item.id]:item},equipped:[item.id]}};
 const html=relicsPanel(state,{proofs:{modeNames:{universal:'全ゲーム共通'}}});
 assert.match(html,/data-tab="gear"[^>]*>📊 ビルド・試算<\/button>/);
 assert.match(html,/data-tab="collection"[^>]*>🎒 図鑑・装備<\/button>/);
 assert.doesNotMatch(html,/装備・診断/);
 assert.match(html,/① 装備する枠を選ぶ/);
 assert.match(html,/② 遺物カードの「効果の詳細・装備」を開く/);
 assert.match(html,/data-action="relic-equip" data-relic="normal.universal.common"/);
 assert.match(html,/data-action="relic-tab" data-tab="collection">🎒 図鑑・装備へ/);
 assert.match(html,/📊 現在のビルド/);
 assert.match(html,/装備を外す枠/);
});

test('図鑑に未所持品も表示し、欠片交換への導線と新しい超越確率を案内する',()=>{
 const item={id:'normal.owned',name:'所持中の遺物',origin:'normal',rarity:'common',mode:'voice',power:30,count:1,ability:'自分用'};
 const state={cash:5000,serverWallet:true,relics:{totalSummons:8100,items:{[item.id]:item},equipped:[]}};
 const proofs={modeNames:{voice:'通話'},catalog:[
  {id:'normal.owned',name:item.name,rarity:'common',mode:'voice',power:30,ability:'自分用',percent:12},
  {id:'normal.missing',name:'未所持の珍品',rarity:'rare',mode:'voice',power:100,ability:'珍しい効果',percent:50},
 ],exchange:{prices:{common:20,rare:120},yields:{common:1},horseVoucherPrice:100},
 ratesByLevel:Array.from({length:10},(_,i)=>({common:0,uncommon:4,rare:30,legendary:40,mythic:21,ancient:4.99,transcendent:i===9?0.01:0.0008}))};
 const html=relicsPanel(state,{proofs,view:{ownership:'unowned',exchangeOwnership:'unowned'}});
 assert.match(html,/図鑑・装備（2種／所持1種）/);
 assert.match(html,/未所持の珍品/);
 assert.match(html,/◇ 未所持/);
 assert.match(html,/data-action="relic-open-exchange" data-relic="normal.missing"/);
 assert.match(html,/data-action="relic-ownership" data-ownership="unowned"/);
 assert.match(html,/超越0.01%/);
 assert.match(html,/現在Lv10／最大Lv10/);
 assert.doesNotMatch(html,/超越0.003%/);
});
