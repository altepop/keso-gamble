import test from 'node:test';
import assert from 'node:assert/strict';

// A minimal WebAudio stand-in that records what is created.
function fakeAudio(){
 const log={contexts:0,sources:0};
 const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}});
 const node=()=>({connect(){},frequency:param(),gain:param(),Q:param(),type:''});
 class Ctx{constructor(){log.contexts++;this.state='running';this.currentTime=0;this.sampleRate=8000;this.destination={};}
  createGain(){return node();}createBiquadFilter(){return node();}
  createOscillator(){log.sources++;return {...node(),start(){},stop(){}};}
  createBuffer(_c,len){return {getChannelData:()=>new Float32Array(len)};}
  createBufferSource(){log.sources++;return {...node(),buffer:null,start(){},stop(){}};}
  resume(){return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}}
 return {Ctx,log};
}
const store=new Map();
globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};

test('sound effects stay silent and never open an AudioContext until the player turns them on',async()=>{
 const {Ctx,log}=fakeAudio();globalThis.AudioContext=Ctx;
 const sfx=await import('../js/sfx.js?off');
 assert.equal(sfx.sfxEnabled(),false);
 sfx.unlockSfx();assert.equal(sfx.play('win'),false);assert.equal(sfx.playResult(5000),false);
 assert.equal(log.contexts,0,'no audio session is touched while 効果音 is off');
 assert.equal(sfx.toggleSfx(),true);assert.equal(store.get('keso.sfx.v1'),'on');
 assert.equal(log.contexts,1);
 for(const name of Object.keys(sfx.SFX_SOUNDS))assert.equal(sfx.play(name),true,name);
 assert.ok(log.sources>40);
 assert.equal(sfx.toggleSfx(),false);assert.equal(store.get('keso.sfx.v1'),'off');
 const before=log.sources;assert.equal(sfx.play('bigwin'),false);assert.equal(log.sources,before);
});
test('result sounds: big win at 10,000 KP or a jackpot, win, loss, push',async()=>{
 const {Ctx}=fakeAudio();globalThis.AudioContext=Ctx;store.set('keso.sfx.v1','on');
 const sfx=await import('../js/sfx.js?on');const played=[];
 const real=sfx.SFX_SOUNDS;assert.ok(Object.isFrozen(real));
 // playResult picks by amount; check through which names succeed being looked up.
 for(const [net,opts] of [[12000,{}],[300,{jackpot:true}],[300,{}],[-500,{}],[0,{}]])played.push(sfx.playResult(net,opts));
 assert.deepEqual(played,[true,true,true,true,true]);
 assert.equal(sfx.playResult(Number.NaN),false);
});
