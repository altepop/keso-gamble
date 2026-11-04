/**
 * KESO PLAY — casino and racing sound effects.
 *
 * Off until the player turns 効果音 on. While off this module never creates an AudioContext, so the Activity keeps
 * its promise to leave Discord's audio session alone (an iPhone report: voice went quiet while the Activity was
 * open). Every sound is synthesized on the device: no files, no loops, nothing plays without a tap or a game event
 * the player started. Volume follows the relic sound slider.
 */
import {relicSoundVolume} from './relics-audio.js?v=web-72d506a019c62921';

const KEY='keso.sfx.v1';
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
  if(!master){master=ctx.createGain();master.connect(ctx.destination);}
  master.gain.value=.55*Math.max(0,Math.min(100,relicSoundVolume()))/100;
  return ctx;
 }catch{ctx=null;master=null;return null;}
}
/** Turns sound on or off. Turning on happens inside the tap, which is what lets iOS start audio. */
export function toggleSfx(){
 enabled=!enabled;
 try{globalThis.localStorage?.setItem(KEY,enabled?'on':'off');}catch{}
 if(enabled)play('chip');else if(ctx){void ctx.close?.().catch(()=>{});ctx=null;master=null;}
 return enabled;
}
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
export const SFX_SOUNDS=Object.freeze({
 tick:(c,t)=>{osc(c,1900,t,.035,{type:'square',amp:.06,filter:4200});},
 chip:(c,t)=>{osc(c,1250,t,.07,{type:'triangle',amp:.16});osc(c,1680,t+.055,.09,{type:'triangle',amp:.14});hiss(c,t,.03,{amp:.08,freq:5200});},
 ticket:(c,t)=>{hiss(c,t,.06,{amp:.22,type:'lowpass',freq:900});osc(c,180,t,.12,{amp:.22,to:90});osc(c,1320,t+.08,.14,{type:'triangle',amp:.12});},
 spin:(c,t,{duration=1.8}={})=>{
  hiss(c,t,duration*.9,{amp:.07,freq:1800,to:500,q:.7});
  // The ball's clicks slow down with the wheel.
  for(let x=0,gap=.035;x<duration-.05;x+=gap,gap*=1.12)osc(c,2600+Math.random()*500,t+x,.018,{type:'square',amp:.045,filter:5000});
 },
 land:(c,t)=>{hiss(c,t,.05,{amp:.25,freq:3000,q:2});osc(c,240,t,.09,{amp:.16,to:140});},
 dice:(c,t)=>{for(let i=0;i<7;i++){const x=t+i*.065+Math.random()*.03;hiss(c,x,.03,{amp:.16,freq:2200+Math.random()*1400,q:3});osc(c,520+Math.random()*300,x,.03,{type:'square',amp:.03});}},
 diceStop:(c,t)=>{hiss(c,t,.04,{amp:.22,freq:1800,q:2.5});osc(c,320,t,.07,{amp:.12,to:180});},
 card:(c,t)=>{hiss(c,t,.09,{amp:.18,type:'highpass',freq:3000,to:1200,q:.5});},
 reel:(c,t,{duration=1.1}={})=>{for(let x=0;x<duration;x+=.05)osc(c,700+(x*10%3)*90,t+x,.03,{type:'square',amp:.035,filter:2500});},
 reelStop:(c,t)=>{[0,.13,.26].forEach(d=>{osc(c,150,t+d,.09,{amp:.2,to:80});hiss(c,t+d,.03,{amp:.1,type:'lowpass',freq:1200});});},
 gem:(c,t)=>{osc(c,note(88),t,.25,{amp:.12});osc(c,note(95),t+.06,.3,{amp:.1});osc(c,note(100),t+.12,.35,{amp:.07});},
 boom:(c,t)=>{hiss(c,t,.8,{amp:.45,type:'lowpass',freq:1600,to:90,q:.6});osc(c,110,t,.6,{amp:.35,to:35});},
 win:(c,t)=>{[72,76,79,84].forEach((n,i)=>osc(c,note(n),t+i*.085,.28,{type:'triangle',amp:.17}));},
 bigwin:(c,t)=>{
  [72,76,79,84,88].forEach((n,i)=>osc(c,note(n),t+i*.09,.32,{type:'triangle',amp:.17}));
  [72,76,79,84].forEach(n=>osc(c,note(n),t+.5,1.1,{type:'sawtooth',amp:.05,attack:.05,filter:2600}));
  for(let i=0;i<10;i++)osc(c,note(96+Math.floor(Math.random()*8)),t+.5+i*.07,.15,{amp:.05});
 },
 // Short, opt-in slot fanfares: no BGM, no loops, no audio work while effects are off.
 slotTemple:(c,t)=>{
  hiss(c,t,1.2,{amp:.24,type:'lowpass',freq:1100,to:180});
  [48,55,60,64,67,72].forEach((n,i)=>osc(c,note(n),t+i*.16,.54,{type:'triangle',amp:.18,attack:.02}));
  [76,79,84,88].forEach((n,i)=>osc(c,note(n),t+.92+i*.13,.43,{type:'sine',amp:.1}));
 },
 slotAltar:(c,t)=>{
  hiss(c,t,.25,{amp:.23,freq:3200,q:2});
  osc(c,140,t,.35,{type:'triangle',amp:.24,to:70});
  [79,84,88,91].forEach((n,i)=>osc(c,note(n),t+.10+i*.1,.4,{type:'triangle',amp:.14}));
 },
 slotBig:(c,t)=>{
  [64,67,72,76,79,84].forEach((n,i)=>osc(c,note(n),t+i*.1,.5,{type:'triangle',amp:.16}));
  for(let i=0;i<7;i++)osc(c,note(84+i),t+.5+i*.06,.2,{amp:.05});
 },
 slotMega:(c,t)=>{
  hiss(c,t,.52,{amp:.27,type:'lowpass',freq:1000,to:250});
  [60,67,72,76,79,84,88].forEach((n,i)=>osc(c,note(n),t+i*.11,.48,{type:'triangle',amp:.2}));
  [72,76,79,84].forEach(n=>osc(c,note(n),t+1,1,{type:'sawtooth',amp:.045,attack:.05,filter:2400}));
 },
 slotGolden:(c,t)=>{
  hiss(c,t,1.4,{amp:.33,type:'lowpass',freq:1600,to:160});
  osc(c,120,t,.8,{type:'triangle',amp:.28,to:55});
  [60,67,72,76,79,84,88,91,96].forEach((n,i)=>osc(c,note(n),t+i*.15,.62,{type:'triangle',amp:.16}));
  [60,64,67,72].forEach(n=>osc(c,note(n),t+1.6,1.5,{type:'sawtooth',amp:.044,attack:.05,filter:2600}));
  for(let i=0;i<18;i++)osc(c,note(88+(i%10)),t+1.3+i*.07,.3,{amp:.05});
 },
 lose:(c,t)=>{osc(c,note(64),t,.18,{type:'triangle',amp:.12});osc(c,note(59),t+.16,.32,{type:'triangle',amp:.1,to:note(57)});},
 gate:(c,t)=>{[0,.32].forEach(d=>{osc(c,note(84),t+d,.5,{amp:.16});osc(c,note(84)*2.01,t+d,.3,{amp:.05});});hiss(c,t+.6,1.4,{amp:.08,type:'lowpass',freq:500,q:.4});},
 finish:(c,t)=>{[79,84,88,91].forEach((n,i)=>osc(c,note(n),t+i*.11,.35,{type:'triangle',amp:.15}));hiss(c,t+.2,.9,{amp:.07,freq:1500,q:.4});},
});
export function play(name,options){
 const c=context(),sound=SFX_SOUNDS[name];
 if(!c||!sound)return false;
 try{sound(c,c.currentTime+.01,options);return true;}catch{return false;}
}
/** The result sound for a settled game: 大勝ち for jackpots or a profit of 10,000 KP or more. */
export function playResult(net,{jackpot=false}={}){
 if(!Number.isFinite(net))return false;
 return play(jackpot||net>=10000?'bigwin':net>0?'win':net<0?'lose':'tick');
}
