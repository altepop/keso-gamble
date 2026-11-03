import test from 'node:test';
import assert from 'node:assert/strict';
import {relicsPanel} from '../js/relics-view.js';
import {relicPresetsSection} from '../js/relics-v7.js';
import {relicInventory,relicDefaultView} from '../js/relics-v4.js';
import {primeRelicAudio,playRelicSound,relicSoundTier,relicSoundEnabled,toggleRelicSound} from '../js/relics-audio.js';

const item=(id,rarity='rare',percent=9)=>({id,name:'遺物'+id,origin:'normal',rarity,count:1,power:100,percent,mode:'competitive',ability:'報酬増加'});
const state={serverWallet:true,cash:2000,ledger:[],relics:{totalSummons:0,items:{a:item('a'),b:item('b'),c:item('c')},equipped:['a']}};
const proofs={modeNames:{competitive:'コンペ'},catalog:[],presets:[],previews:[]};

test('library is the default active tab, and dense 2-col grid does not render unrelated sections as active',()=>{
 const html=relicsPanel(state,{proofs});
 assert.match(html,/data-tab="collection" aria-current="page"/);
 assert.match(html,/data-pane="collection"/);
 assert.match(html,/class="relic-v8-grid"/);
 assert.match(html,/data-action="relic-equipped-only"/);
 assert.match(html,/data-action="relic-layout" data-layout="list"/);
 const summonTab=relicsPanel(state,{proofs,view:{section:'summon'}});
 assert.match(summonTab,/data-tab="summon" aria-current="page"/);
 assert.match(summonTab,/data-action="relic-sound-toggle"/);
 assert.match(summonTab,/効果音：オン/);
});
test('one-column view is selectable without mutating inventory',()=>{
 const html=relicsPanel(state,{proofs,view:{section:'collection',layout:'list'}});
 assert.match(html,/class="relic-v8-list"/);
 const before=JSON.stringify(state.relics.items);
 const got=relicInventory(Object.values(state.relics.items),new Map(),proofs.modeNames,{...relicDefaultView(),equippedOnly:true},['a']);
 assert.equal(got.matching,1);
 assert.equal(got.matches[0].id,'a');
 assert.equal(JSON.stringify(state.relics.items),before);
});
test('highest effective percentage is sortable independently from rarity and power',()=>{
 const items=[item('low','ancient',6),item('high','rare',100)];
 const sorted=relicInventory(items,new Map(),proofs.modeNames,{sort:'percent'});
 assert.equal(sorted.matches[0].id,'high');
});
test('saved custom presets stay escaped and are in a name-first form',()=>{
 const html=relicPresetsSection({presets:{'競技用❤':['a'],'<script>':['b']}},{...proofs,presets:[]});
 assert.match(html,/relic-preset-name/);
 assert.match(html,/20件/);
 assert.match(html,/競技用❤/);
 assert.match(html,/&lt;script&gt;/);
 assert.ok(!html.includes('<script>'));
 for(const name of ['relic-save-preset','relic-overwrite-preset','relic-load-preset','relic-rename-preset','relic-remove-preset'])assert.ok(html.includes(name),name);
});
test('automatic summon music detects the best rarity and all standard pulls',()=>{
 assert.equal(relicSoundTier({summary:{common:999,transcendent:1}}),'transcendent');
 assert.equal(relicSoundTier({summary:{common:1}}),'common');
 assert.equal(relicSoundTier({summary:{mythic:1,legendary:1}}),'mythic');
 assert.equal(relicSoundTier({summary:{common:100},foils:['new']}),'mythic');
});
test('sound toggles persist and the generator uses a primed audio context',()=>{
 let noteCount=0;
 class Gain {
  gain={value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}};
  connect(){} disconnect(){}
 }
 class Osc {frequency={value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}};connect(){}start(){noteCount++}stop(){}}
 class Audio {state='running';destination={};currentTime=0;createGain(){return new Gain()}createOscillator(){return new Osc()}resume(){return Promise.resolve()}suspend(){this.state='suspended';return Promise.resolve()}}
 const previous=globalThis.AudioContext;
 globalThis.AudioContext=Audio;
 try{
  if(!relicSoundEnabled())toggleRelicSound();
  assert.equal(primeRelicAudio(),true);
  assert.equal(playRelicSound({summary:{transcendent:1}}),true);
  assert.ok(noteCount>=6);
  assert.equal(toggleRelicSound(),false);
  assert.equal(playRelicSound({summary:{transcendent:1}}),false);
  assert.equal(toggleRelicSound(),true);
 }finally{globalThis.AudioContext=previous;}
});
