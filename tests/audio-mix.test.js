import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAudioMix,setAudioMix,audioMixEnabled} from '../js/audio-mix.js';
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v))};};
const nav=()=>{let reads=0,type='auto';return {get reads(){return reads;},audioSession:{get type(){reads++;return type;},set type(v){type=v;}}};};
test('off by default: the audio session is never touched',()=>{
 const s=store(),n=nav();assert.equal(applyAudioMix(n,s),false);assert.equal(n.reads,0);assert.equal(audioMixEnabled(s),false);
});
test('turned on: the page asks to mix with other audio, and the choice is remembered; off returns to auto',()=>{
 const s=store(),n=nav();assert.equal(setAudioMix(true,n,s),true);assert.equal(n.audioSession.type,'ambient');
 const again=nav();assert.equal(applyAudioMix(again,s),true,'applied again on the next launch');
 assert.equal(setAudioMix(false,again,s),false);assert.equal(again.audioSession.type,'auto');assert.equal(audioMixEnabled(s),false);
});
test('devices without the Audio Session API just do nothing',()=>{
 const s=store();assert.equal(setAudioMix(true,{},s),false);assert.equal(applyAudioMix({},s),false);assert.equal(applyAudioMix(undefined,s),false);
});
test('a blocked localStorage (throws on access) never stops startup',async()=>{
 const desc=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('blocked');}});
 try{assert.equal(applyAudioMix({audioSession:{type:'auto'}}),false);assert.equal(audioMixEnabled(),false);}
 finally{if(desc)Object.defineProperty(globalThis,'localStorage',desc);else delete globalThis.localStorage;}
});
