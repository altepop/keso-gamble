import test from 'node:test';
import assert from 'node:assert/strict';
import {relicBonusDashboard} from '../js/relics-v4.js';
import {relicEffectLogSection} from '../js/relics-v7.js';

test('Spike simulator shows real 40KP initial payout, per-relic flat bonus and next career game',()=>{
 const state={relics:{},ledger:[]};
 const proof={spikeGamesBefore:0,modeNames:{spikerush:'スパイクラッシュ'},
  previews:[{mode:'spikerush',amount:40,bonus:50,percent:0,effectivePercent:125,cap:0,gross:50,lines:[
   {name:'小さな先陣',mode:'spikerush',base:0,exotic:50,active:true,triggered:false,effectivePercent:7,reason:'⚡先陣の加護：固定＋50KP'}
  ],sets:[],resonance:0,spikeOpening:{game:1,multiplier:3,flatPerRelic:50,eligible:1}}]};
 const html=relicBonusDashboard(state,proof,{previewMode:'spikerush',previewAmount:40});
 for(const phrase of ['通算1試合目','固定','＋50','×3','40 KP','90 KP','対象遺物'])assert.ok(html.includes(phrase),phrase);
 assert.match(html,/20 KP/);
 assert.match(html,/デメリット適用前/);
});
test('Spike receipt history makes the actual minted opening KP auditable',()=>{
 const entry={id:'relic:match-1',mode:'spikerush',amount:40,bonus:50,at:Date.now(),origin:'verified',
  lines:[{name:'小さな先陣',base:0,exotic:50}],sets:[],
  spikeOpening:{game:1,multiplier:3,flatPerRelic:50,eligible:1}};
 const html=relicEffectLogSection({nativeEffects:[]},{modeNames:{spikerush:'スパイクラッシュ'},externalLogs:[entry]});
 for(const phrase of ['＋50 KP','通算1試合目','対象1個','1個＋50KP','倍率分×3'])assert.ok(html.includes(phrase),phrase);
});
test('post-40 Spike simulator explains the normal unboosted relic rule',()=>{
 const html=relicBonusDashboard({ledger:[]},{spikeGamesBefore:40,modeNames:{spikerush:'スパイクラッシュ'},
  previews:[{mode:'spikerush',amount:40,bonus:0,effectivePercent:0,percent:0,cap:0,gross:0,lines:[],sets:[],resonance:0}]},
 {previewMode:'spikerush',previewAmount:40});
 assert.match(html,/41試合目以降/);
 assert.ok(!html.includes('固定＋50KP'));
});
