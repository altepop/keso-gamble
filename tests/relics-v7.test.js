import test from 'node:test';
import assert from 'node:assert/strict';
import {relicBuildSection,relicPresetsSection,relicSummonHistorySection,relicSpecialSection,relicEffectLogSection,relicEconomySection,relicCombinationsSection} from '../js/relics-v7.js';
import {relicItemCard} from '../js/relics-v4.js';
import {relicsPanel} from '../js/relics-view.js';

const proofs={modeNames:{competitive:'コンペ'},diagnosis:{style:'一撃必殺型',average:35,volatility:210,best:[{mode:'competitive',average:43,max:90}],sample:'100/500/900/5000'},presets:[{id:'balanced',name:'バランス'}],economy:{nativeTotal:420,nativeCount:2,verifiedTotal:180,verifiedCount:2,summonSpent:5000,guild:{players:3,verifiedTotal:10000}}};

test('build diagnosis is clear, server-sourced and HTML escaped',()=>{
 const panel=relicBuildSection({...proofs,diagnosis:{...proofs.diagnosis,style:'<script>attack</script>'}});
 assert.match(panel,/🧠 ビルド診断/);
 assert.match(panel,/＋35%/);
 assert.match(panel,/＋43%/);
 assert.ok(panel.includes('&lt;script&gt;'));assert.ok(!panel.includes('<script>'));
});
test('save/load/delete controls use unique server-authoritative actions',()=>{
 const panel=relicPresetsSection({presets:{balanced:['first']}},proofs);
 assert.match(panel,/保存済み/);
 for(const action of ['relic-save-preset','relic-load-preset','relic-remove-preset'])assert.match(panel,new RegExp(action));
});
test('summon history and replay contain only bounded saved entries',()=>{
 const panel=relicSummonHistorySection({summonHistory:[{count:100,cost:20000,start:1,end:100,at:Date.now(),highlights:[{rarity:'transcendent',name:'光の遺物'}],mutations:['変異'],foils:['星空']}]});
 assert.match(panel,/演出再生/);assert.match(panel,/data-history-index="0"/);
 assert.match(panel,/超越/);assert.match(panel,/🧬/);assert.match(panel,/✨/);
});
test('special variant gallery exposes mutation and appearance separately',()=>{
 const panel=relicSpecialSection({mutatedCount:1,foilCount:1,items:{
  x:{name:'星',mutation:{kind:'risk',percent:24},foil:{kind:'starlit',percent:3}}}});
 assert.match(panel,/偶数覚醒/);assert.match(panel,/星紋/);
 assert.match(panel,/24%/);assert.match(panel,/3%/);
});
test('real payout audit and economics carry receipt values only',()=>{
 const event={id:'native:1',mode:'competitive',amount:500,bonus:400,at:Date.now(),origin:'native',
 lines:[{name:'盾',base:320,exotic:0}],sets:[{name:'同格の誓い',bonus:80}]};
 const log=relicEffectLogSection({nativeEffects:[event]},{...proofs,externalLogs:[]});
 assert.match(log,/＋400 KP/);
 assert.match(log,/＋320KP/);
 assert.match(log,/同格の誓い/);
 const economy=relicEconomySection({},proofs);
 assert.match(economy,/600/);assert.match(economy,/5,000/);assert.match(economy,/10,000/);
});
test('curse reversal is visible in actual calculated set entries',()=>{
 const output=relicCombinationsSection({curseReversed:true,sets:[{name:'呪い反転',bonus:0},{name:'同系統の絆',bonus:300}]});
 assert.match(output,/呪い反転成功/);assert.match(output,/＋300 KP/);
});
test('mutated or foil owned card has distinct styling, the existing title remains escaped',()=>{
 const item={id:'normal.foo',name:'<danger>',rarity:'rare',origin:'normal',power:100,mode:'competitive',count:2,
 mutation:{kind:'prism',percent:12},foil:{kind:'abyss',percent:3},ability:'効果'};
 const html=relicItemCard(item,new Map(),{competitive:'コンペ'},[]);
 assert.match(html,/虹彩変異/);assert.match(html,/深淵/);assert.match(html,/＋16%/);
 assert.ok(html.includes('&lt;danger&gt;'));
 assert.ok(!html.includes('<danger>'));
});
test('relic screen mounts the full set of eleven surfaces',()=>{
 const state={serverWallet:true,cash:200,ledger:[],relics:{totalSummons:0,items:{},equipped:[]}};
 const out=relicsPanel(state,{proofs:{...proofs,previews:[],catalog:[],externalLogs:[]}});
 for(const name of ['ビルド診断','装備プリセット','召喚履歴','特殊個体','発動ログ','経済ダッシュボード','遺物召喚'])assert.ok(out.includes(name),name);
});
