/**
 * KESO PLAY — Relic V9 cinematic sound engine.
 *
 * All music is synthesized on the device with WebAudio. No network audio,
 * no copyrighted samples, no KP calls, no looping autoplay. The player's
 * summon tap primes WebKit, and the melody starts only on the server's result.
 * Both the number of musical parts and the duration increase by rarity.
 */
const ENABLE_KEY='keso.relic.sound.v8'; // preserve users' existing mute choice
const VOLUME_KEY='keso.relic.volume.v9';
const EPS=.00008;
let ctx=null, playback=null, enabled=true, volume=72;
// Keep track of scheduled sources: a new summon must stop the previous fanfare,
// not merely mute dozens of oscillators still running in the audio graph.
let sourceCollector=null;
try{
 enabled=globalThis.localStorage?.getItem(ENABLE_KEY)!=='off';
 const saved=globalThis.localStorage?.getItem(VOLUME_KEY);
 if(saved!==null&&saved!==undefined&&saved!=='')volume=Math.max(0,Math.min(100,Number(saved)||0));
}catch{}
export const relicSoundEnabled=()=>enabled;
export const relicSoundVolume=()=>volume;
export const RELIC_SOUND_DESIGNS=Object.freeze({
 common:      {name:'一般',       duration:.68,description:'澄んだ単音と短い余韻'},
 uncommon:    {name:'上質',       duration:1.10,description:'3音の階段とガラスの響き'},
 rare:        {name:'希少',       duration:1.72,description:'上昇するアルペジオと輝く和音'},
 legendary:   {name:'伝説',       duration:2.55,description:'金属の衝撃と勝利の金管ファンファーレ'},
 mythic:      {name:'神話',       duration:3.55,description:'聖歌のような和音と星が舞うチャイム'},
 ancient:     {name:'古代',       duration:4.40,description:'巨大な銅鑼、封印解除、深い残響'},
 transcendent:{name:'超越',       duration:6.35,description:'大地を揺らす衝撃、上昇、荘厳なクライマックス'},
});
export const relicSoundTier=reveal=>{
 const rank=['transcendent','ancient','mythic','legendary','rare','uncommon'];
 const summary=reveal?.summary??{};
 if((reveal?.foils??[]).length||(reveal?.mutations??[]).length)
  return rank.find(t=>Number(summary[t])>0)??'mythic';
 return rank.find(t=>Number(summary[t])>0)??'common';
};
export function setRelicSoundVolume(n){
 volume=Math.round(Math.max(0,Math.min(100,Number(n)||0)));
 try{globalThis.localStorage?.setItem(VOLUME_KEY,String(volume))}catch{}
 return volume;
}
export function toggleRelicSound(){
 enabled=!enabled;
 try{globalThis.localStorage?.setItem(ENABLE_KEY,enabled?'on':'off')}catch{}
 if(!enabled)stopRelicSound();
 return enabled;
}
function ensureContext(){
 const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
 if(!Audio)return null;
 if(!ctx||ctx.state==='closed')ctx=new Audio({latencyHint:'interactive'});
 return ctx;
}
export function primeRelicAudio(){
 if(!enabled||volume===0)return false;
 try{
  const c=ensureContext();if(!c)return false;
  // This invocation must run synchronously inside the summon click. WebKit
  // sometimes requires a source.start() *as well as* resume().
  if(c.state!=='running')void c.resume().catch(()=>{});
  const oscillator=c.createOscillator(),mute=c.createGain();
  mute.gain.value=0;oscillator.connect(mute);mute.connect(c.destination);
  oscillator.start(c.currentTime);oscillator.stop(c.currentTime+.013);
  return true;
 }catch{return false;}
}
function param(param,value,at,kind='set'){
 if(kind==='linear'&&typeof param.linearRampToValueAtTime==='function')param.linearRampToValueAtTime(value,at);
 else if(kind==='exp'&&typeof param.exponentialRampToValueAtTime==='function')param.exponentialRampToValueAtTime(Math.max(EPS,value),at);
 else if(typeof param.setValueAtTime==='function')param.setValueAtTime(value,at);
 else param.value=value;
}
function envelope(gain,at,attack,hold,release,peak){
 const p=gain.gain;
 param(p,EPS,at);
 param(p,Math.max(EPS,peak),at+Math.max(.008,attack),'exp');
 if(hold>0)param(p,Math.max(EPS,peak*.88),at+attack+hold,'linear');
 param(p,EPS,at+attack+hold+release,'exp');
}
function oscillator(c,target,freq,at,duration,{type='sine',amp=.25,attack=.01,hold=0,detune=0,filter=0,pan=0,sweep=0}={}){
 if(freq<=0||duration<=0)return;
 const o=c.createOscillator(),g=c.createGain();
 sourceCollector?.push(o);
 o.type=type;o.frequency.value=freq;
 if(detune&&o.detune)o.detune.value=detune;
 if(sweep){
  param(o.frequency,Math.max(25,freq),at);
  param(o.frequency,Math.max(25,freq*sweep),at+duration,'exp');
 }
 let end=g;
 if(filter>0&&typeof c.createBiquadFilter==='function'){
  const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=filter;g.connect(f);end=f;
 }
 if(pan&&typeof c.createStereoPanner==='function'){
  const p=c.createStereoPanner();p.pan.value=pan;end.connect(p);end=p;
 }
 end.connect(target);
 const length=Math.max(.025,duration),a=Math.min(attack,length*.45);
 envelope(g,at,a,hold,Math.max(.012,length-a-hold),amp);
 o.connect(g);o.start(at);o.stop(at+length+.04);
}
function tone(c,bus,freq,at,len,amp=.30,kind='triangle',pan=0){
 oscillator(c,bus,freq,at,len,{type:kind,amp,attack:.012,pan});
}
function bell(c,bus,freq,at,len=.75,amp=.24,pan=0){
 // Inharmonic overtones make a struck metal/glass instrument, not a beep.
 const harmonics=[1,2.015,3.92,5.43];
 const weights=[1,.40,.17,.07];
 harmonics.forEach((ratio,i)=>oscillator(c,bus,freq*ratio,at,len*(i?(.58-i*.075):1),
  {type:'sine',amp:amp*weights[i],attack:.006+i*.002,pan}));
}
function harp(c,bus,freq,at,len=.5,amp=.24,pan=0){
 oscillator(c,bus,freq,at,len,{type:'triangle',amp,attack:.007,pan,filter:5500});
 oscillator(c,bus,freq*2,at,len*.48,{type:'sine',amp:amp*.28,attack:.005,pan});
}
function brass(c,bus,freq,at,len=.72,amp=.21){
 // Slightly detuned saws into a low-pass simulate a horn section.
 oscillator(c,bus,freq,at,len,{type:'sawtooth',amp:amp*.45,attack:.065,hold:len*.19,detune:-7,filter:1650});
 oscillator(c,bus,freq*1.002,at,len,{type:'sawtooth',amp:amp*.38,attack:.065,hold:len*.19,detune:8,filter:2050});
 oscillator(c,bus,freq/2,at,len,{type:'triangle',amp:amp*.38,attack:.08,hold:len*.22,filter:1300});
}
function choir(c,bus,freq,at,len=.9,amp=.18,pan=0){
 oscillator(c,bus,freq,at,len,{type:'triangle',amp,attack:.22,hold:len*.20,filter:1400,pan});
 oscillator(c,bus,freq*1.003,at,len,{type:'sine',amp:amp*.75,attack:.27,hold:len*.18,detune:6,pan:-pan});
}
function chord(c,bus,freqs,at,len,amp=.22,style='brass'){
 for(const freq of freqs){
  if(style==='choir')choir(c,bus,freq,at,len,amp/freqs.length*2.4);
  else if(style==='bell')bell(c,bus,freq,at,len,amp/freqs.length*2.1);
  else brass(c,bus,freq,at,len,amp/freqs.length*2);
 }
}
let cachedNoise=null, cachedNoiseCtx=null;
function noise(c){
 if(typeof c.createBuffer!=='function'||typeof c.createBufferSource!=='function')return null;
 if(cachedNoiseCtx===c&&cachedNoise)return cachedNoise;
 const rate=c.sampleRate||44100,buffer=c.createBuffer(1,Math.floor(rate*.85),rate);
 const data=buffer.getChannelData(0);
 // Pseudorandom from a fixed seed; there is no use of gameplay or KP RNG.
 let seed=14799831;
 for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;data[i]=((seed>>>0)/4294967295*2-1)*.75;}
 cachedNoiseCtx=c;cachedNoise=buffer;return buffer;
}
function burst(c,bus,at,len,amp=.16,{cutoff=1500,type='lowpass',rising=false}={}){
 const buffer=noise(c);if(!buffer)return;
 const src=c.createBufferSource(),g=c.createGain();
 sourceCollector?.push(src);
 src.buffer=buffer;
 let end=g;
 if(typeof c.createBiquadFilter==='function'){
  const filter=c.createBiquadFilter();filter.type=type;filter.frequency.value=cutoff;
  if(rising){
   param(filter.frequency,Math.max(120,cutoff*.17),at);
   param(filter.frequency,cutoff,at+len*.88,'exp');
  }else{
   param(filter.frequency,cutoff,at);
   param(filter.frequency,Math.max(60,cutoff*.27),at+len,'exp');
  }
  g.connect(filter);end=filter;
 }
 end.connect(bus);
 envelope(g,at,rising?len*.50:.007,rising?len*.14:0,rising?len*.36:Math.max(.018,len-.007),amp);
 src.start(at);src.stop(at+Math.min(.82,len)+.012);
}
function impact(c,bus,at,{deep=false,metal=false}={}){
 const base=deep?92:136;
 oscillator(c,bus,base,at,deep?1.3:.73,{type:'sine',amp:deep?.73:.50,attack:.008,sweep:deep?.31:.43});
 oscillator(c,bus,base*.62,at,deep?1.05:.56,{type:'triangle',amp:deep?.34:.17,attack:.012,sweep:.56,filter:720});
 burst(c,bus,at,deep?.52:.28,deep?.46:.26,{cutoff:metal?3200:1400,type:'lowpass'});
 if(metal){bell(c,bus,220,at,1.65,.24);bell(c,bus,329.63,at+.08,1.25,.15);}
}
function shimmer(c,bus,at,count=7,step=.085,base=880){
 for(let n=0;n<count;n++){
  const freq=base*Math.pow(2,n/12);
  bell(c,bus,freq,at+n*step,.5+.1*(n%3),.095+(n%4)*.006,n%2?.55:-.55);
 }
}
function climb(c,bus,notes,at,step=.11,amp=.20){
 notes.forEach((f,i)=>harp(c,bus,f,at+i*step,.48+Math.min(.35,i*.025),amp,i%2?.55:-.55));
}
function makeBus(c,rarity){
 const gate=c.createGain(),master=c.createGain();
 const compressor=typeof c.createDynamicsCompressor==='function'?c.createDynamicsCompressor():null;
 // Real dynamic compression preserves the low impact without phone clipping.
 if(compressor){
  compressor.threshold.value=-18;compressor.knee.value=18;
  compressor.ratio.value=3.1;compressor.attack.value=.005;compressor.release.value=.26;
  gate.connect(compressor);compressor.connect(c.destination);
 }else gate.connect(c.destination);
 const richness={common:.66,uncommon:.69,rare:.73,legendary:.78,mythic:.82,ancient:.88,transcendent:1};
 // A slightly louder mix on rarer tiers, but not a 7x volume escalation.
 master.gain.value=Math.min(.8,(volume/100)*.64*richness[rarity]);
 master.connect(gate);
 const bus=c.createGain();bus.gain.value=1;bus.connect(master);
 // Two short, damped echo taps form a soft room tail without requiring
 // a huge convolution impulse buffer or an external sound file.
 if(typeof c.createDelay==='function'){
  for(const [time,send] of [[.145,.13],[.31,.095]]){
   const delay=c.createDelay(.6),wet=c.createGain();
   delay.delayTime.value=time;wet.gain.value=send;
   bus.connect(delay);delay.connect(wet);wet.connect(master);
  }
 }
 return {gate,master,bus};
}
function schedule(c,bus,tier,at){
 if(tier==='common'){
  harp(c,bus,783.99,at,.35,.37);
  bell(c,bus,1046.5,at+.15,.48,.25);return;
 }
 if(tier==='uncommon'){
  climb(c,bus,[659.25,783.99,1046.5],at,.12,.27);
  bell(c,bus,1318.51,at+.36,.62,.26);
  chord(c,bus,[523.25,659.25,783.99],at+.38,.49,.11,'bell');return;
 }
 if(tier==='rare'){
  climb(c,bus,[587.33,739.99,880,1174.66,1479.98],at,.115,.29);
  chord(c,bus,[587.33,739.99,880],at+.53,.78,.21,'bell');
  shimmer(c,bus,at+.64,6,.085,1180);
  impact(c,bus,at+.52);return;
 }
 if(tier==='legendary'){
  impact(c,bus,at,{metal:true});
  brass(c,bus,261.63,at+.09,.56,.40);
  climb(c,bus,[523.25,659.25,783.99,1046.5],at+.20,.14,.22);
  chord(c,bus,[261.63,329.63,392,523.25],at+.82,1.18,.41);
  bell(c,bus,1046.5,at+.91,1.22,.25);
  shimmer(c,bus,at+1.12,9,.085,880);
  impact(c,bus,at+.83,{metal:false});return;
 }
 if(tier==='mythic'){
  burst(c,bus,at,.72,.20,{cutoff:4800,type:'bandpass',rising:true});
  chord(c,bus,[220,261.63,329.63],at,.95,.27,'choir');
  climb(c,bus,[440,523.25,659.25,783.99,880,1046.5],at+.24,.14,.25);
  chord(c,bus,[261.63,329.63,392,523.25],at+1.02,1.44,.33,'choir');
  impact(c,bus,at+1.10,{metal:true});
  chord(c,bus,[349.23,440,523.25,698.46],at+1.92,1.30,.35,'bell');
  shimmer(c,bus,at+2.13,11,.098,784);return;
 }
 if(tier==='ancient'){
  impact(c,bus,at,{deep:true,metal:true});
  chord(c,bus,[146.83,220,293.66],at+.13,1.42,.31,'choir');
  // Dark, ritualistic slow rhythm changes into a huge liberated cadence.
  [0,.48,.94].forEach((shift,i)=>impact(c,bus,at+.78+shift,{deep:i===2}));
  climb(c,bus,[293.66,349.23,440,587.33,698.46,880],at+1.08,.16,.21);
  burst(c,bus,at+1.44,1.15,.34,{cutoff:7800,type:'bandpass',rising:true});
  chord(c,bus,[146.83,293.66,349.23,440],at+2.16,1.64,.45);
  chord(c,bus,[293.66,349.23,440,587.33],at+2.32,1.43,.29,'choir');
  bell(c,bus,1174.66,at+2.31,1.80,.27);
  shimmer(c,bus,at+2.84,10,.096,800);return;
 }
 // TRANSCENDENT — musical multi-stage "ascension", 6+ seconds:
 // 0.0 abyss impact -> 1.0 rising harp -> 2.3 angelic brass/chord ->
 // 3.9 final triumph -> 5.0 cascading celestial sparks.
 impact(c,bus,at,{deep:true,metal:true});
 chord(c,bus,[130.81,196,261.63],at+.05,1.64,.33,'choir');
 burst(c,bus,at+.22,1.25,.34,{cutoff:6900,type:'bandpass',rising:true});
 [0,.36,.72].forEach((shift,i)=>impact(c,bus,at+.86+shift,{deep:i===2}));
 climb(c,bus,[392,440,523.25,587.33,659.25,783.99,880,1046.5],at+1.03,.145,.27);
 chord(c,bus,[261.63,329.63,392,523.25],at+2.25,1.53,.44,'choir');
 chord(c,bus,[196,261.63,329.63,392],at+2.37,1.28,.46);
 shimmer(c,bus,at+2.67,12,.097,1046.5);
 burst(c,bus,at+3.13,.76,.30,{cutoff:8300,type:'bandpass',rising:true});
 impact(c,bus,at+3.91,{deep:true,metal:true});
 chord(c,bus,[130.81,261.63,329.63,392,523.25],at+3.93,2.18,.64);
 chord(c,bus,[261.63,329.63,392,523.25,659.25],at+3.99,1.99,.41,'choir');
 chord(c,bus,[523.25,659.25,783.99,1046.5],at+4.19,1.46,.38,'bell');
 climb(c,bus,[1046.5,1174.66,1318.51,1567.98,1760,2093],at+4.66,.17,.20);
 shimmer(c,bus,at+5.18,11,.092,1046.5);
}
export function stopRelicSound(){
 if(!playback)return;
 const old=playback;playback=null;
 const t=old.context.currentTime;
 try{
  old.gate.gain.cancelScheduledValues?.(t);
  old.gate.gain.setValueAtTime(old.gate.gain.value||.4,t);
  old.gate.gain.exponentialRampToValueAtTime(EPS,t+.09);
 }catch{old.gate.gain.value=0;}
 // A source may already have a later scheduled stop; the new stop supersedes it.
 // This prevents repeated rare results from accumulating minutes of active nodes.
 for(const source of old.sources??[]){try{source.stop(t+.10);}catch{}}
 // Sources have their own stop times. Disconnect the master after the fade.
 setTimeout(()=>{try{old.bus.disconnect();old.gate.disconnect();for(const source of old.sources??[])source.disconnect?.();}catch{}},150);
}
export function playRelicSound(reveal){
 if(!enabled||volume===0)return false;
 const tier=relicSoundTier(reveal),design=RELIC_SOUND_DESIGNS[tier];
 const c=ctx;
 if(!c||c.state!=='running'||!design)return false;
 try{
  stopRelicSound();
  const parts=makeBus(c,tier),start=c.currentTime+.026;
  const sources=[];
  playback={...parts,context:c,sources};
  sourceCollector=sources;
  try{schedule(c,parts.bus,tier,start);}finally{sourceCollector=null;}
  const session=playback;
  setTimeout(()=>{
   if(playback===session)playback=null;
   try{session.bus.disconnect();session.master.disconnect();session.gate.disconnect()}catch{}
  },Math.ceil((design.duration+1.2)*1000));
  return true;
 }catch{
  stopRelicSound();
  return false;
 }
}
export function previewRelicSound(tier){
 if(!Object.hasOwn(RELIC_SOUND_DESIGNS,tier))return false;
 return playRelicSound({summary:{[tier]:1}});
}
