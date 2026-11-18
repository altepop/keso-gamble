import test from 'node:test';
import assert from 'node:assert/strict';
import {relicsPanel} from '../js/relics-view.js';

const defs=[
 {id:'consumable.mirror',name:'同格再鑑定の鏡',ratePerMillion:16000,description:'同格を再鑑定'},
 {id:'consumable.shard_vial',name:'欠片増幅瓶',ratePerMillion:6000,description:'欠片を2倍'},
 {id:'consumable.foil_seal',name:'虹彩刻印',ratePerMillion:1500,description:'特殊外観'},
];
const relic={id:'normal.universal.rare',name:'所持中のレア遺物',origin:'normal',rarity:'rare',count:2,ability:'特別',power:80};
const proofs={consumableCatalog:defs,catalog:[{...relic,mode:'universal',skill:'spark',percent:1}],modeNames:{universal:'全ゲーム共通'}};
test('new consumable tab contains three usable inventory entries with their separate odds',()=>{
 const state={cash:2500,serverWallet:true,relics:{totalSummons:50,items:{[relic.id]:relic},equipped:[],consumables:{'consumable.mirror':2,'consumable.shard_vial':1,'consumable.foil_seal':1}}};
 const html=relicsPanel(state,{proofs,view:{section:'consumables'}});
 assert.match(html,/data-tab="consumables"[^>]*>🧪 消耗品/);
 for(const def of defs){
  assert.match(html,new RegExp('data-action="relic-consumable-use" data-consumable="'+def.id.replaceAll('.','\\.')+'"'));
  assert.match(html,new RegExp('data-consumable-target="'+def.id.replaceAll('.','\\.')+'"'));
 }
 assert.match(html,/1\.6%／回/);
 assert.match(html,/0\.15%／回/);
 assert.match(html,/data-pane="consumables"/);
});
test('no stock or no eligible target disables use action and protects source text from injection',()=>{
 const state={cash:0,serverWallet:true,relics:{totalSummons:0,items:{[relic.id]:{...relic,count:1,foil:{kind:'starlit',percent:3,at:1}}},equipped:[],consumables:{}}};
 const html=relicsPanel(state,{proofs:{...proofs,consumableCatalog:[{...defs[0],name:'<script>alert(1)</script>'}]},view:{section:'consumables'}});
 assert.match(html,/data-action="relic-consumable-use" data-consumable="consumable.mirror" disabled/);
 assert.doesNotMatch(html,/<script>/);
});
