import test from 'node:test';
import assert from 'node:assert/strict';
import {relicBonusDashboard,relicItemCard} from '../js/relics-v4.js';
import {relicsPanel} from '../js/relics-view.js';

test('normal relic cards lead with short percentage, show stack boost and exotic axis',()=>{
 const item={id:'normal.ancient',name:'古代の守護',origin:'normal',rarity:'ancient',power:270,ability:'Long explanation',mode:'competitive',count:4};
 const catalog=new Map([[item.id,{name:item.name,mode:'competitive',percent:9,cap:55,short:'勝利時：KP報酬＋9%',trait:'刻印連鎖：別の遺物が発動するたびに固定KP'}]]);
 const html=relicItemCard(item,catalog,{competitive:'コンペ'},[item.id]);
 assert.match(html,/勝利時：KP報酬＋9%/);
 assert.match(html,/設定 <b>＋11%/);
 assert.match(html,/重複強化：＋2ポイント/);
 assert.match(html,/刻印連鎖/);
 assert.doesNotMatch(html,/relic-card-effect">Long explanation/);
});
test('authoritative preview shows raw configured percentages, realized amount and cap separately',()=>{
 const proofs={modeNames:{competitive:'コンペ',market:'株'},
  previews:[{mode:'competitive',amount:500,gross:70,bonus:70,cap:75,percent:18,effectivePercent:14,resonance:0,
   lines:[{id:'normal.demo',name:'指揮官の剣',effectivePercent:9,base:45,exotic:0,reason:'条件達成',trait:''},
     {id:'steam.demo',name:'刻印',effectivePercent:9,base:20,exotic:5,reason:'条件達成',trait:'出自の加護'}]}],
  lastNativeEffect:{mode:'market',amount:1000,bonus:10,percent:1,names:['刻印'],at:Date.now()}};
 const html=relicBonusDashboard({},proofs,{previewMode:'competitive',previewAmount:500});
 for(const part of ['発動中の倍率合計','＋18%','＋70 KP','実効＋14%','指揮官の剣','出自の加護','直近の実支給','＋10 KP'])assert.ok(html.includes(part),part);
 assert.match(html,/data-relic-preview="mode"/);
 assert.match(html,/data-relic-preview="amount"/);
 assert.ok(html.includes('500 KP → 遺物込み <strong>570 KP'));
});
test('relic panel exposes calculator without requiring older items to be newly claimed',()=>{
 const state={cash:0,serverWallet:true,relics:{totalSummons:1234,items:{},equipped:[]}};
 const html=relicsPanel(state,{proofs:{previews:[],modeNames:{competitive:'コンペ'},catalog:[]}});
 assert.match(html,/📊 遺物の効果を数値で見る/);
 assert.match(html,/全レアリティの排出率|排出率表/);
});
test('untrusted names in the preview are HTML escaped',()=>{
 const html=relicBonusDashboard({}, {modeNames:{competitive:'コンペ'},previews:[{
  mode:'competitive',amount:500,gross:8,bonus:8,cap:75,percent:9,effectivePercent:1.6,
  lines:[{id:'x',name:'<img src=x onerror=alert(1)>',effectivePercent:9,base:8,exotic:0,reason:'条件達成',trait:''}],
 }]} ,{previewMode:'competitive',previewAmount:500});
 assert.ok(html.includes('&lt;img'));
 assert.ok(!html.includes('<img'));
});
