import test from 'node:test';
import assert from 'node:assert/strict';
import {RELIC_SOUND_DESIGNS,relicSoundTier,primeRelicAudio,playRelicSound,previewRelicSound,
 setRelicSoundVolume,relicSoundVolume,relicSoundEnabled,toggleRelicSound,stopRelicSound} from '../js/relics-audio.js';
import {relicsPanel} from '../js/relics-view.js';

const tiers=['common','uncommon','rare','legendary','mythic','ancient','transcendent'];
const capture={oscillators:0,noiseSources:0,compressors:0,delays:0,starts:[]};
const audioParam=(value=1)=>({value,setValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){}});
class Node{connect(){return this;}disconnect(){}}
class Gain extends Node{gain=audioParam();}
class Filter extends Node{type='lowpass';frequency=audioParam(400);}
class Delay extends Node{delayTime=audioParam();}
class Compressor extends Node{threshold=audioParam();knee=audioParam();ratio=audioParam();attack=audioParam();release=audioParam();}
class Osc extends Node{
 type='sine';frequency=audioParam(440);detune=audioParam();
 constructor(){super();capture.oscillators++;}
 start(when){capture.starts.push(when);}stop(){}
}
class BufferSource extends Node{buffer=null;constructor(){super();capture.noiseSources++;}start(){}stop(){}}
class OfflineMock{
 state='running';currentTime=1.8;destination={};sampleRate=22050;
 createOscillator(){return new Osc();}
 createGain(){return new Gain();}
 createBiquadFilter(){return new Filter();}
 createDelay(){capture.delays++;return new Delay();}
 createDynamicsCompressor(){capture.compressors++;return new Compressor();}
 createStereoPanner(){return Object.assign(new Node(),{pan:audioParam(0)});}
 createBuffer(n,length){return{getChannelData:()=>new Float32Array(length)};}
 createBufferSource(){return new BufferSource();}
 resume(){this.state='running';return Promise.resolve();}
 suspend(){this.state='suspended';return Promise.resolve();}
}
test('seven distinct increasing durations from light chime to 6+ seconds of celestial fanfare',()=>{
 assert.deepEqual(Object.keys(RELIC_SOUND_DESIGNS),tiers);
 let previous=0;
 for(const tier of tiers){
  const def=RELIC_SOUND_DESIGNS[tier];
  assert.ok(def.duration>previous,tier+' should outlast previous tier');
  assert.ok(def.description.length>=7);
  previous=def.duration;
 }
 assert.ok(RELIC_SOUND_DESIGNS.transcendent.duration>=6);
});
test('sounds actually get denser for every rarity, with percussion/noise and real room echoes',()=>{
 const old=globalThis.AudioContext;globalThis.AudioContext=OfflineMock;
 try{
  if(!relicSoundEnabled())toggleRelicSound();
  setRelicSoundVolume(72);
  assert.equal(primeRelicAudio(),true);
  let previousOsc=0;
  const results=[];
  for(const tier of tiers){
   const beforeOsc=capture.oscillators,beforeNoise=capture.noiseSources;
   assert.equal(previewRelicSound(tier),true,tier+' should preview without any wallet');
   const voices=capture.oscillators-beforeOsc;
   const noise=capture.noiseSources-beforeNoise;
   assert.ok(voices>previousOsc,tier+': '+voices+' synth voices > previous '+previousOsc);
   if(['legendary','mythic','ancient','transcendent'].includes(tier))assert.ok(noise>=1,tier+' has cinematic noise impact');
   previousOsc=voices;results.push([tier,voices]);
  }
  assert.ok(capture.compressors>=7);
  assert.ok(capture.delays>=14);
  assert.ok(capture.oscillators>400);
  assert.ok(results.at(-1)[1]>results[0][1]*15);
 }finally{stopRelicSound();globalThis.AudioContext=old;}
});
test('the rarest result from a multi-pull controls the soundtrack',()=>{
 assert.equal(relicSoundTier({summary:{common:999,transcendent:1}}),'transcendent');
 assert.equal(relicSoundTier({summary:{common:999,mythic:1}}),'mythic');
 assert.equal(relicSoundTier({summary:{common:10},mutations:['mutated']}),'mythic');
 assert.equal(relicSoundTier({summary:{common:1}}),'common');
 assert.equal(relicSoundTier({summary:{}}),'common');
});
test('volume adjusts without KP calls, persists, and respects mute',()=>{
 assert.equal(setRelicSoundVolume(81),81);
 assert.equal(relicSoundVolume(),81);
 assert.equal(setRelicSoundVolume(-99),0);
 assert.equal(relicSoundVolume(),0);
 assert.equal(setRelicSoundVolume(500),100);
 assert.equal(relicSoundVolume(),100);
 assert.equal(setRelicSoundVolume(70),70);
 const original=relicSoundEnabled();
 if(original)toggleRelicSound();
 assert.equal(playRelicSound({summary:{legendary:1}}),false);
 if(original)toggleRelicSound();
});
test('no AudioContext means no crash and no unapproved autoplay',()=>{
 stopRelicSound();
 const old=globalThis.AudioContext,webkit=globalThis.webkitAudioContext;
 try{
  delete globalThis.AudioContext;delete globalThis.webkitAudioContext;
  assert.equal(primeRelicAudio(),false);
  assert.equal(previewRelicSound('random-untrusted'),false);
 }finally{globalThis.AudioContext=old;globalThis.webkitAudioContext=webkit;}
});
test('game presents an accessible listen-before-you-summon UI, including volume and all 7 tiers',()=>{
 const state={cash:2000,serverWallet:true,relics:{totalSummons:0,items:{},equipped:[]}};
 const html=relicsPanel(state,{proofs:{previews:[],modeNames:{},catalog:[]},view:{section:'summon'}});
 assert.match(html,/効果音の音量/);
 assert.match(html,/data-relic-sound-volume/);
 assert.match(html,/KPを使わず試聴できる/);
 for(const tier of tiers)assert.match(html,new RegExp('data-action="relic-sound-preview" data-tier="'+tier+'"'));
 assert.match(html,/超越/);
});
