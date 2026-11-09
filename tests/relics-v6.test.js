import test from 'node:test';
import assert from 'node:assert/strict';
import {relicRevealPanel,relicBonusDashboard,relicItemCard} from '../js/relics-v4.js';

test('Legendary, mythic, ancient and transcendent summons have dedicated stages and skip controls',()=>{
 const names=['legendary','mythic','ancient','transcendent'];
 for(const rarity of names){
  const html=relicRevealPanel({count:1000,cost:200000,summary:{[rarity]:1,common:999},highlights:[{rarity,name:'剣'+rarity}]});
  assert.match(html,new RegExp('relic-reveal-'+rarity));
  assert.match(html,/relic-reveal-cinematic/);
  assert.match(html,/relic-cinematic-runes/);
  assert.match(html,/relic-cinematic-rays/);
  assert.match(html,/data-action="relic-reveal-skip"/);
  assert.match(html,/data-action="relic-reveal-close"/);
  assert.match(html,/data-action="relic-reveal-sound"/);
  assert.ok(html.includes('剣'+rarity));
 }
 const ordinary=relicRevealPanel({count:1,cost:200,summary:{common:1},highlights:[]});
 assert.doesNotMatch(ordinary,/relic-reveal-cinematic/);
 assert.doesNotMatch(ordinary,/relic-reveal-skip/);
});
test('pacts show both upside and actual downside, not a generic +KP card',()=>{
 const item={id:'normal.pact.frenzy',name:'賽の崩壊核',rarity:'transcendent',origin:'normal',power:480,count:1,mode:'fortune',ability:'旧い説明'};
 const def={id:item.id,name:item.name,percent:900,cap:0,short:'素数KPの報酬：＋900%',trait:'確率暴走',drawback:'素数以外の報酬では他の効果が90%減',mode:'fortune'};
 const html=relicItemCard(item,new Map([[item.id,def]]),{fortune:'特殊条件'},[]);
 assert.match(html,/＋900%/);
 assert.match(html,/合算上限 <b>なし/);
 assert.match(html,/relic-drawback/);
 assert.match(html,/90%減/);
});
test('preview distinguishes nominal +990%, suppressed actual gain, and lacks artificial 80KP caps',()=>{
 const source={id:'normal.pact.frenzy',name:'賽の崩壊核',drawback:'他の効果90%減'};
 const proofs={catalog:[source],modeNames:{competitive:'コンペ'},previews:[{
  mode:'competitive',amount:900,percent:990,effectivePercent:7.3,bonus:66,gross:66,cap:0,resonance:0,
  lines:[{id:source.id,name:source.name,effectivePercent:900,base:0,exotic:0,trait:'確率暴走',reason:'条件未達'},
   {id:'other',name:'ほかの遺物',effectivePercent:90,base:66,exotic:0,trait:'',reason:'代償で90%減'}]
 }]};
 const html=relicBonusDashboard({},proofs,{previewMode:'competitive',previewAmount:900});
 assert.match(html,/＋990%/);
 assert.match(html,/＋66 KP/);
 assert.match(html,/実効＋7.3%/);
 assert.match(html,/上限はない/);
 assert.match(html,/relic-risk-notice/);
 assert.doesNotMatch(html,/共通上限 80 KP/);
});
