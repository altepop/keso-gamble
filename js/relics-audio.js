// Procedural, asset-free WebAudio sound designed for an unlocked user gesture.
// The summon button unlocks iOS Safari / Discord's webview BEFORE the network
// request; the actual rarity melody starts only after the server confirms a pull.
let audioContext=null, lastPlayback=0;
const key='keso.relic.sound.v8';
let enabled=true;
try{enabled=globalThis.localStorage?.getItem(key)!=='off'}catch{}
export const relicSoundEnabled=()=>enabled;
export function toggleRelicSound(){
 enabled=!enabled;
 try{globalThis.localStorage?.setItem(key,enabled?'on':'off')}catch{}
 if(!enabled&&audioContext?.state==='running')audioContext.suspend().catch(()=>{});
 return enabled;
}
export function primeRelicAudio(){
 if(!enabled)return false;
 const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
 if(!Audio)return false;
 try{
  if(!audioContext||audioContext.state==='closed')audioContext=new Audio();
  // This method is deliberately synchronous with the trusted click handler;
  // awaiting the KP request first would violate autoplay rules on iOS.
  void audioContext.resume().catch(()=>{});
  return true;
 }catch{return false;}
}
export const relicSoundTier=reveal=>{
 const rare=['transcendent','ancient','mythic','legendary','rare','uncommon'];
 const summary=reveal?.summary??{};
 if((reveal?.foils??[]).length||(reveal?.mutations??[]).length)
  return rare.find(t=>summary[t]>0)??'mythic';
 return rare.find(t=>summary[t]>0)??'common';
};
export function playRelicSound(reveal){
 if(!enabled||!audioContext||audioContext.state!=='running')return false;
 const ctx=audioContext,rarity=relicSoundTier(reveal);
 const max=.055; // overall mobile-friendly sound pressure, no abrupt clipping
 const gain=ctx.createGain();gain.gain.value=max;gain.connect(ctx.destination);
 const tiers={
  common:[392,523.25],uncommon:[392,523.25,659.25],
  rare:[392,587.33,783.99],legendary:[329.63,493.88,659.25,987.77],
  mythic:[293.66,440,698.46,880,1174.66],
  ancient:[261.63,392,523.25,783.99,1046.50],
  transcendent:[349.23,523.25,698.46,1046.50,1396.91,1760],
 };
 const now=ctx.currentTime+.03;const notes=tiers[rarity]??tiers.common;
 const keyTime=Date.now();lastPlayback=keyTime;
 const fade=(osc,at,duration,vol)=>{
  const g=ctx.createGain();g.gain.setValueAtTime(.0001,at);
  g.gain.exponentialRampToValueAtTime(vol,at+.026);
  g.gain.exponentialRampToValueAtTime(.0001,at+duration);
  osc.connect(g);g.connect(gain);
  osc.start(at);osc.stop(at+duration+.016);
 };
 notes.forEach((frequency,i)=>{
  const start=now+i*(rarity==='transcendent'?.17:.13);
  const osc=ctx.createOscillator();osc.type=i%2?'sine':'triangle';
  osc.frequency.setValueAtTime(frequency,start);
  osc.frequency.exponentialRampToValueAtTime(frequency*1.008,start+.1);
  fade(osc,start,.36,rarity==='transcendent'?.42:.31);
 });
 if(['legendary','mythic','ancient','transcendent'].includes(rarity)){
  const end=now+notes.length*.15;
  const bass=ctx.createOscillator();bass.type='sine';bass.frequency.value=notes[0]/2;
  fade(bass,end,.65,.27);
  const sparkle=ctx.createOscillator();sparkle.type='sine';sparkle.frequency.value=notes.at(-1)*1.5;
  fade(sparkle,end+.06,.32,.16);
 }
 // Silence no output on unsupported platforms; the visual reveal remains usable.
 setTimeout(()=>{if(lastPlayback===keyTime){try{gain.disconnect()}catch{}}},2600);
 return true;
}
