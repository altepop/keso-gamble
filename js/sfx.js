/**
 * KESO PLAY — casino and racing sound effects.
 *
 * Off until the player turns 効果音 on. While off this module never creates an AudioContext, so the Activity keeps
 * its promise to leave Discord's audio session alone (an iPhone report: voice went quiet while the Activity was
 * open). Nothing plays without a tap or a game event the player started; no loops. Volume follows the relic sound
 * slider. The big sounds (fanfares, coin showers, slot reels, the announcer) are studio-rendered files in /audio
 * (see scripts/audio/README.md), fetched only after 効果音 is turned on; until they arrive, or if they cannot load,
 * the synthesized versions below play instead.
 */
import {relicSoundVolume} from './relics-audio.js?v=web-0f5832e3cc65fc25';

const KEY='keso.sfx.v1';
// Content-hashed names, so a changed sound never comes from a stale cache.
export const SFX_FILES=Object.freeze({
 'coins':'coins.e209c277.mp3',
 'fanfare-big':'fanfare-big.65336afb.mp3',
 'fanfare-mega':'fanfare-mega.0af33ed7.mp3',
 'fanfare-super':'fanfare-super.1596f43f.mp3',
 'lose':'lose.fc5014d9.mp3',
 'reel-stop':'reel-stop.d5201604.mp3',
 'slot-spin':'slot-spin.24677872.mp3',
 'voice-big':'voice-big.d906850f.mp3',
 'voice-golden':'voice-golden.59dfcb36.mp3',
 'voice-jackpot':'voice-jackpot.6739e584.mp3',
 'voice-mega':'voice-mega.df57a50b.mp3',
 'voice-super':'voice-super.36103144.mp3',
 'win':'win.344c2973.mp3'
});
// Which game sound uses which file (a missing or unloaded file falls back to the synthesized sound of that name).
const FILE_FOR=Object.freeze({reel:'slot-spin',reelStop:'reel-stop',win:'win',lose:'lose',coins:'coins',bigwin:'fanfare-mega',
 slotBig:'fanfare-big',slotMega:'fanfare-mega',slotGolden:'fanfare-super',slotTempleComplete:'fanfare-big',finish:'win'});
const buffers=new Map();let loading=null;
let enabled=false,ctx=null,master=null,noiseBuffer=null;
try{enabled=globalThis.localStorage?.getItem(KEY)==='on';}catch{}
export const sfxEnabled=()=>enabled;

function context(){
 if(!enabled)return null;
 const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
 if(!Audio)return null;
 // A blocked or failing audio stack must never break a bet: no sound is the fallback.
 try{
  if(!ctx||ctx.state==='closed'){ctx=new Audio({latencyHint:'interactive'});master=null;noiseBuffer=null;}
  if(ctx.state!=='running')void ctx.resume?.()?.catch?.(()=>{});
  if(!master){master=ctx.createGain();master.connect(ctx.destination);loading=null;buffers.clear();}
  if(!loading)loading=loadFiles(ctx);
  master.gain.value=.55*Math.max(0,Math.min(100,relicSoundVolume()))/100;
  return ctx;
 }catch{ctx=null;master=null;return null;}
}
function loadFiles(c){
 const base=new URL('../audio/',import.meta.url);
 return Promise.all(Object.entries(SFX_FILES).map(async([name,file])=>{
  try{const r=await fetch(new URL(file,base));if(!r.ok)return;const data=await r.arrayBuffer();
   const b=await new Promise((ok,fail)=>{const p=c.decodeAudioData(data,ok,fail);p?.then?.(ok,fail);});if(c===ctx)buffers.set(name,b);}catch{}
 }));
}
/** Plays a rendered file now (or `at` seconds from now); false if it is not loaded (yet). */
export function playFile(name,{gain=1,at=0}={}){
 const c=context(),b=buffers.get(name);if(!c||!b)return false;
 try{const s=c.createBufferSource(),g=c.createGain();s.buffer=b;g.gain.value=gain;s.connect(g);g.connect(master);s.start(c.currentTime+.01+at);return true;}catch{return false;}
}
/** Turns sound on or off. Turning on happens inside the tap, which is what lets iOS start audio. */
export function toggleSfx(){
 enabled=!enabled;
 try{globalThis.localStorage?.setItem(KEY,enabled?'on':'off');}catch{}
 if(enabled)play('chip');else if(ctx){void ctx.close?.().catch(()=>{});ctx=null;master=null;}
 return enabled;
}
/** Starts fetching the rendered sound files (only when 効果音 is on). */
export function preloadSfx(){context();}
/** Call inside a tap before a sound that will play after an await (iOS only resumes audio during a gesture). */
export function unlockSfx(){context();}

const EPS=.0001;
function env(gain,at,peak,attack,release){
 gain.gain.setValueAtTime(EPS,at);
 gain.gain.exponentialRampToValueAtTime(Math.max(EPS,peak),at+attack);
 gain.gain.exponentialRampToValueAtTime(EPS,at+attack+release);
}
function osc(c,freq,at,len,{type='sine',amp=.3,attack=.005,to=0,filter=0}={}){
 const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(freq,at);
 if(to)o.frequency.exponentialRampToValueAtTime(Math.max(20,to),at+len);
 let out=g;
 if(filter&&c.createBiquadFilter){const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=filter;g.connect(f);out=f;}
 out.connect(master);o.connect(g);env(g,at,amp,attack,Math.max(.02,len-attack));o.start(at);o.stop(at+len+.05);
}
function hiss(c,at,len,{amp=.25,type='bandpass',freq=2500,q=1.2,to=0}={}){
 if(!c.createBuffer||!c.createBufferSource)return;
 if(!noiseBuffer){const rate=c.sampleRate||44100;noiseBuffer=c.createBuffer(1,Math.floor(rate*1.2),rate);const d=noiseBuffer.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
 const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=noiseBuffer;f.type=type;f.frequency.setValueAtTime(freq,at);f.Q.value=q;
 if(to)f.frequency.exponentialRampToValueAtTime(Math.max(40,to),at+len);
 s.connect(f);f.connect(g);g.connect(master);env(g,at,amp,.004,Math.max(.02,len-.004));s.start(at);s.stop(at+len+.05);
}
const note=n=>440*2**((n-69)/12); // MIDI note number to Hz

// Each sound: (context, start time, options). Short and quiet next to a voice chat; wins are the longest.
// Bright, arcade-casino voicing: shiny square/saw leads, metallic coin pings, rising sparkles. Short for taps, long and
// loud only for wins.
const coin=(c,t,amp=.12,pitch=1)=>{osc(c,2637*pitch,t,.12,{amp});osc(c,3951*pitch,t+.004,.16,{amp:amp*.7});osc(c,5274*pitch,t+.008,.09,{amp:amp*.35});};
const lead=(c,n,t,len,amp=.13)=>{osc(c,note(n),t,len,{type:'square',amp,filter:5200});osc(c,note(n)*1.006,t,len,{type:'sawtooth',amp:amp*.45,filter:4200});};
export const SFX_SOUNDS=Object.freeze({
 tick:(c,t)=>{osc(c,2400,t,.04,{type:'square',amp:.08,filter:6500});osc(c,3600,t+.012,.03,{amp:.05});},
 chip:(c,t)=>{coin(c,t,.13);coin(c,t+.07,.11,1.12);},
 ticket:(c,t)=>{osc(c,note(84),t,.09,{type:'square',amp:.1,filter:5000});osc(c,note(91),t+.08,.16,{type:'square',amp:.1,filter:5000});coin(c,t+.12,.08);},
 spin:(c,t,{duration=1.8}={})=>{
  hiss(c,t,duration*.9,{amp:.07,freq:2400,to:700,q:.7});
  for(let x=0,gap=.035;x<duration-.05;x+=gap,gap*=1.12)osc(c,3200+Math.random()*700,t+x,.02,{type:'square',amp:.06,filter:7000});
 },
 land:(c,t)=>{hiss(c,t,.05,{amp:.28,freq:3600,q:2});coin(c,t+.02,.14,1.06);},
 dice:(c,t)=>{for(let i=0;i<8;i++){const x=t+i*.055+Math.random()*.03;hiss(c,x,.03,{amp:.18,freq:2600+Math.random()*1800,q:3});osc(c,900+Math.random()*500,x,.03,{type:'square',amp:.04});}},
 diceStop:(c,t)=>{hiss(c,t,.04,{amp:.24,freq:2400,q:2.5});osc(c,note(88),t+.01,.12,{type:'square',amp:.07,filter:6000});},
 card:(c,t)=>{hiss(c,t,.08,{amp:.2,type:'highpass',freq:3800,to:1600,q:.5});osc(c,note(96),t+.05,.06,{amp:.04});},
 reel:(c,t,{duration=1.1}={})=>{for(let x=0,i=0;x<duration;x+=.06,i++)osc(c,note([72,76,79,84][i%4]),t+x,.05,{type:'square',amp:.06,filter:4500});},
 reelStop:(c,t)=>{[0,.14,.28].forEach((d,i)=>{osc(c,note(60+i*4),t+d,.08,{type:'square',amp:.12,filter:3000});hiss(c,t+d,.03,{amp:.12,freq:3000});});},
 gem:(c,t)=>{[88,95,100,107].forEach((n,i)=>osc(c,note(n),t+i*.05,.3,{amp:.1}));},
 boom:(c,t)=>{hiss(c,t,.9,{amp:.5,type:'lowpass',freq:1800,to:80,q:.6});osc(c,120,t,.7,{amp:.4,to:30});osc(c,note(52),t+.25,.5,{type:'sawtooth',amp:.06,filter:900,to:note(40)});},
 win:(c,t)=>{[72,76,79,84,88].forEach((n,i)=>lead(c,n,t+i*.07,.2,.1));for(let i=0;i<6;i++)coin(c,t+.3+i*.06,.09,1+Math.random()*.2);},
 coins:(c,t,{duration=2}={})=>{for(let x=0;x<duration;x+=.045+Math.random()*.04)coin(c,t+x,.07+Math.random()*.05,.9+Math.random()*.35);},
 rise:(c,t,{duration=1.2}={})=>{osc(c,note(60),t,duration,{type:'sawtooth',amp:.08,attack:.2,to:note(96),filter:5000});hiss(c,t,duration,{amp:.08,freq:800,to:7000,q:.6});},
 fanfare:(c,t,{level=1}={})=>{
  const steps=[[72,76,79],[74,77,81],[76,79,84],[79,83,86]].slice(0,1+Math.min(3,level));
  steps.forEach((ch,i)=>ch.forEach(n=>lead(c,n,t+i*.18,.22,.08)));
  const end=t+steps.length*.18;[72,76,79,84,88].forEach(n=>lead(c,n,end,1.2,.06));
  for(let i=0;i<14+level*6;i++)osc(c,note(96+Math.floor(Math.random()*12)),end+i*.05,.12,{amp:.05});
 },
 bigwin:(c,t)=>{SFX_SOUNDS.fanfare(c,t,{level:2});SFX_SOUNDS.coins(c,t+.4,{duration:1.6});},
 // 黄金神殿 slot fanfares (from #299–#303), re-voiced brighter: metal coins and shiny leads over the old triangles.
 slotTemple:(c,t)=>{
  hiss(c,t,1.2,{amp:.26,type:'lowpass',freq:1400,to:200});osc(c,110,t,.9,{type:'sawtooth',amp:.1,filter:600,to:55});
  [48,55,60,64,67,72].forEach((n,i)=>lead(c,n+12,t+i*.15,.45,.09));
  [84,88,91,96].forEach((n,i)=>coin(c,t+.95+i*.11,.1,note(n)/2637));
 },
 slotAltar:(c,t)=>{hiss(c,t,.25,{amp:.25,freq:3600,q:2});osc(c,160,t,.3,{amp:.22,to:70});[79,84,88,91].forEach((n,i)=>lead(c,n,t+.1+i*.09,.3,.09));coin(c,t+.5,.12);},
 slotRespin:(c,t)=>{hiss(c,t,.28,{amp:.1,freq:2200,to:800});[76,79,83].forEach((n,i)=>osc(c,note(n),t+i*.06,.1,{type:'square',amp:.07,filter:5000}));},
 slotCoin:(c,t)=>{osc(c,170,t,.25,{amp:.2,to:90});[0,.05,.1,.16,.24].forEach((d,i)=>coin(c,t+d,.13,1+i*.06));[79,84,91].forEach((n,i)=>lead(c,n,t+.08+i*.08,.25,.07));},
 slotTempleComplete:(c,t)=>{[60,67,72,79,84,91,96].forEach((n,i)=>lead(c,n,t+i*.12,.45,.08));SFX_SOUNDS.coins(c,t+.6,{duration:1.2});},
 slotBig:(c,t)=>{SFX_SOUNDS.fanfare(c,t,{level:1});SFX_SOUNDS.coins(c,t+.3,{duration:1.4});},
 slotMega:(c,t)=>{SFX_SOUNDS.fanfare(c,t,{level:1});SFX_SOUNDS.fanfare(c,t+.86,{level:2});SFX_SOUNDS.coins(c,t+.3,{duration:2.4});hiss(c,t+.8,.6,{amp:.2,type:'lowpass',freq:1200,to:300});},
 slotGolden:(c,t)=>{
  SFX_SOUNDS.fanfare(c,t,{level:1});SFX_SOUNDS.fanfare(c,t+.86,{level:2});
  hiss(c,t+1.5,1.2,{amp:.32,type:'lowpass',freq:1800,to:160});osc(c,110,t+1.6,.8,{amp:.3,to:50});
  SFX_SOUNDS.fanfare(c,t+1.74,{level:3});SFX_SOUNDS.coins(c,t+.3,{duration:4});
 },
 lose:(c,t)=>{osc(c,note(67),t,.14,{type:'square',amp:.08,filter:2500});osc(c,note(62),t+.13,.3,{type:'square',amp:.07,filter:2000,to:note(60)});},
 gate:(c,t)=>{[0,.32].forEach(d=>{osc(c,note(84),t+d,.5,{amp:.16});osc(c,note(84)*2.01,t+d,.3,{amp:.05});});hiss(c,t+.6,1.4,{amp:.08,type:'lowpass',freq:500,q:.4});},
 finish:(c,t)=>{[79,84,88,91].forEach((n,i)=>lead(c,n,t+i*.11,.3,.09));SFX_SOUNDS.coins(c,t+.3,{duration:.6});},
});
export function play(name,options={}){
 const file=FILE_FOR[name];
 if(file&&buffers.has(file)){
  // A long coin shower repeats its file until the requested time is covered.
  if(name==='coins'){const len=buffers.get(file).duration*.82;for(let at=0;at<(options.duration??2);at+=len)playFile(file,{at,gain:.8});return true;}
  if(name==='slotMega'){playFile('fanfare-big');playFile('fanfare-mega',{at:.86,gain:.9});return true;}
  if(name==='slotGolden'){playFile('fanfare-big');playFile('fanfare-mega',{at:.86,gain:.9});playFile('fanfare-super',{at:1.74});return true;}
  return playFile(file);
 }
 if(name==='fanfare'&&buffers.has('fanfare-big'))return playFile(['fanfare-big','fanfare-mega','fanfare-super'][Math.min(3,Math.max(1,options.level??1))-1]);
 const c=context(),sound=SFX_SOUNDS[name];
 if(!c||!sound)return false;
 try{sound(c,c.currentTime+.01,options);return true;}catch{return false;}
}
/** The result sound for a settled game: 大勝ち for jackpots or a profit of 10,000 KP or more. */
export function playResult(net,{jackpot=false}={}){
 if(!Number.isFinite(net))return false;
 return play(jackpot||net>=10000?'bigwin':net>0?'win':net<0?'lose':'tick');
}

/** The win announcer ("BIG WIN!" etc.): rendered voice files, only while 効果音 is on. One call at a time. */
const VOICE_FOR={'Big win!':'voice-big','Mega win!':'voice-mega','Super mega win!':'voice-super','Golden win!':'voice-golden','Jackpot!':'voice-jackpot'};
let voiceSource=null;
export function announce(text){
 const c=context(),b=buffers.get(VOICE_FOR[text]);if(!c||!b)return false;
 try{voiceSource?.stop();}catch{}
 try{const s=c.createBufferSource(),g=c.createGain();s.buffer=b;g.gain.value=1.25;s.connect(g);g.connect(master);s.start();voiceSource=s;return true;}catch{return false;}
}
export function stopAnnounce(){try{voiceSource?.stop();}catch{}voiceSource=null;}
