import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../music/player.js',import.meta.url),'utf8');
const lyricsSource=readFileSync(new URL('../music/lyrics.js',import.meta.url),'utf8');

function setup({savedEntries=[],validTitle=true,autoplayDenied=false,fetcher}={}){
 const handlers=new Map(),elements=new Map(),saved=new Map(savedEntries);
 let audioCreated=0;
 const element=(name)=>{
  if(!elements.has(name))elements.set(name,{
   value:'',textContent:'',hidden:false,files:[],attributes:{},
   classList:{toggle(){},add(){},remove(){}},focus(){},
   addEventListener(type,fn){handlers.set(name+':'+type,fn);},
   appendChild(child){(this.children||(this.children=[])).push(child);},
   querySelector(sel){return element(name+' '+sel);},
   setAttribute(k,v){this.attributes[k]=v;}
  });
  return elements.get(name);
 };
 const root={id:'',innerHTML:'',parentElement:null,querySelector:element,remove(){this.parentElement=null;}};
 const title={appendChild(el){el.parentElement=this;}};
 const events=new Map(),document={
  baseURI:'https://example.org/',hidden:false,
  querySelector(selector){return validTitle&&selector==='#app main.title-screen:has(.title-emblem)'?title:null;},
  getElementById(){return null;},
  body:{appendChild(e){this.child=e;}},
  createElement(tag){return tag==='option'?{value:'',textContent:''}:root;},
  addEventListener(type,fn){events.set(type,fn);}
 };
 const audio={
  paused:true,volume:1,preload:'',loop:false,src:'',listeners:new Map(),played:0,
  getAttribute(k){return k==='src'?this.src:'';},
  removeAttribute(k){if(k==='src')this.src='';},
  load(){},
  pause(){this.paused=true;this.listeners.get('pause')?.();},
  async play(){
   this.played++;
   if(autoplayDenied){autoplayDenied=false;throw Object.assign(new Error('blocked'),{name:'NotAllowedError'});}
   this.paused=false;this.listeners.get('play')?.();
  },
  addEventListener(type,fn){this.listeners.set(type,fn);}
 };
 const ctx={document,window:{addEventListener(){}},localStorage:{
  getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)
 },Audio:class{constructor(){audioCreated++;return audio;}},URL,Map,Promise,Number,Error,globalThis:null,queueMicrotask,fetch:fetcher};
 ctx.globalThis=ctx;
 runInNewContext(lyricsSource,ctx);
 runInNewContext(source,ctx);
 return {ctx,document,audio,element,root,
   fire:(name,type,ev={})=>handlers.get(name+':'+type)?.(ev),events,saved,created:()=>audioCreated};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('music autoplays after the genuine title renders, with safe default volume',async()=>{
 const s=setup();
 assert.equal(s.audio.played,0,'autoplay waits for app mount');
 await tick();
 assert.equal(s.created(),1);
 assert.equal(s.audio.played,1);
 assert.equal(s.audio.volume,.05);
 assert.equal(s.ctx.KesoMusic.getState().playing,true);
 assert.match(s.audio.src,/mou-isshu\.mp3$/);
 const slider=s.element('#music-volume');slider.value='38';
 s.fire('#music-volume','input',{target:slider});
 assert.equal(s.audio.volume,.38);
 assert.equal(s.saved.get('keso.music.volume'),'38');
 s.fire('#music-play','click');
 assert.equal(s.ctx.KesoMusic.getState().playing,false);
 s.element('#music-track').value='rhapsody';
 s.fire('#music-track','change');await tick();
 assert.match(s.audio.src,/genkai-rhapsody\.mp3$/);
 assert.equal(s.saved.get('keso.music.track'),'rhapsody');
 s.fire('#music-play','click');await tick();
 s.document.hidden=true;s.events.get('visibilitychange')?.();
 assert.equal(s.audio.paused,false,'switching to a background tab must not pause BGM');
});

test('background playback keeps running across visibility changes, advances tracks, and honors manual pause',async()=>{
 const s=setup();
 await tick();
 s.document.hidden=true;
 s.events.get('visibilitychange')?.();
 assert.equal(s.audio.paused,false);
 s.audio.listeners.get('ended')();
 await tick();
 assert.match(s.audio.src,/genkai-rhapsody\.mp3$/);
 assert.equal(s.ctx.KesoMusic.getState().playing,true,'playlist continues while hidden');
 s.fire('#music-play','click');
 assert.equal(s.audio.paused,true);
 const previousPlayCount=s.audio.played;
 s.document.hidden=false;
 s.events.get('visibilitychange')?.();
 await tick();
 assert.equal(s.audio.played,previousPlayCount,'returning to foreground never resumes a user-paused track');
 assert.equal(s.audio.paused,true);
});

test('saved volume preference is retained, including mute and custom volume',async()=>{
 const customized=setup({savedEntries:[['keso.music.volume','32']]});
 await tick();
 assert.equal(customized.audio.volume,.32);
 assert.equal(customized.ctx.KesoMusic.getState().volume,32);
 const muted=setup({savedEntries:[['keso.music.volume','0']]});
 await tick();
 assert.equal(muted.audio.volume,0);
});

test('autoplay OFF persists and opening an error screen never creates Audio',async()=>{
 const s=setup({savedEntries:[['keso.music.autoplay','off']]});
 await tick();
 assert.equal(s.created(),0);
 assert.equal(s.ctx.KesoMusic.getState().playing,false);
 const auto=s.element('#music-autoplay');auto.checked=true;
 s.fire('#music-autoplay','change',{target:auto});
 assert.equal(s.saved.get('keso.music.autoplay'),'on');
 s.fire('#music-play','click');await tick();
 assert.equal(s.audio.played,1);
 const fallback=setup({validTitle:false});
 await tick();
 assert.equal(fallback.created(),0,'bootstrap error/retry screen remains silent');
 assert.equal(fallback.root.parentElement,null);
});

test('browser autoplay rejection is contained and explicit play remains available',async()=>{
 const s=setup({autoplayDenied:true});
 await tick();
 assert.equal(s.audio.played,1);
 assert.equal(s.ctx.KesoMusic.getState().playing,false);
 assert.match(s.element('.music-status').textContent,/自動再生を制限/);
 s.fire('#music-play','click');await tick();
 assert.equal(s.audio.played,2);
 assert.equal(s.ctx.KesoMusic.getState().playing,true);
});

test('only official tracks are allowed; no user file picker or browser database access',async()=>{
 const s=setup();
 await tick();
 assert.doesNotMatch(s.root.innerHTML,/type="file"|music-file|MP3を追加/, 'no user-controlled file imports');
 assert.equal(s.element('#music-track').value, 'mou', 'selection comes from the app track catalog');
 assert.doesNotMatch(source,/indexedDB|createObjectURL|readAsArrayBuffer|music-file/);
 const slider=s.element('#music-volume');slider.value='0';
 s.fire('#music-volume','input',{target:slider});
 assert.equal(s.audio.volume,0);
 assert.equal(s.saved.get('keso.music.volume'),'0');
});


test('two new official MP3s are selectable and match exact GitHub filenames',async()=>{
 const s=setup();
 await tick();
 assert.match(s.root.innerHTML,/<option value="kyohansha">午前二時の共犯者<\/option>/);
 assert.match(s.root.innerHTML,/<option value="ouenka">応援歌<\/option>/);
 s.element('#music-track').value='kyohansha';
 s.fire('#music-track','change');await tick();
 assert.match(decodeURI(s.audio.src),/music\/assets\/午前二時の共犯者 \(1\)\.mp3$/);
 assert.equal(s.saved.get('keso.music.track'),'kyohansha');
 s.element('#music-track').value='ouenka';
 s.fire('#music-track','change');await tick();
 assert.match(decodeURI(s.audio.src),/music\/assets\/応援歌 \(Remastered\)\.mp3$/);
 assert.equal(s.saved.get('keso.music.track'),'ouenka');
});

test('background playback advances across eight songs then wraps to beginning',async()=>{
 const s=setup();
 await tick();
 s.document.hidden=true;
 const expected=['genkai-rhapsody.mp3','午前二時の共犯者 (1).mp3','応援歌 (Remastered).mp3','誤差の女王B.mp3','フルパならB.mp3','値札のない遺物B.mp3','まさかねC.mp3','mou-isshu.mp3'];
 for(const name of expected){
  s.audio.listeners.get('ended')();await tick();
  assert.ok(decodeURI(s.audio.src).endsWith(name),'next song '+name);
  assert.equal(s.audio.paused,false);
 }
});


test('official 誤差の女王B is selectable, encoded safely, and persists as chosen song',async()=>{
 const s=setup();
 await tick();
 assert.match(s.root.innerHTML,/<option value="gosa">誤差の女王<\/option>/);
 s.element('#music-track').value='gosa';
 s.fire('#music-track','change');await tick();
 assert.equal(s.saved.get('keso.music.track'),'gosa');
 assert.match(decodeURI(s.audio.src),/music\/assets\/誤差の女王B\.mp3$/);
 const restored=setup({savedEntries:[['keso.music.track','gosa']]});
 await tick();
 assert.equal(restored.element('#music-track').value,'gosa');
 assert.match(decodeURI(restored.audio.src),/music\/assets\/誤差の女王B\.mp3$/);
 assert.equal(restored.audio.volume,.05);
});


test('seek bar reflects media metadata and clicks or drags jump to exact timeline position',async()=>{
 const s=setup();await tick();
 const slider=s.element('#music-seek');
 assert.equal(slider.disabled,true,'cannot seek until duration known');
 s.audio.duration=125.6;s.audio.currentTime=31.4;
 s.audio.listeners.get('loadedmetadata')();
 assert.equal(slider.disabled,false);
 assert.equal(s.element('#music-current').textContent,'0:31');
 assert.equal(s.element('#music-duration').textContent,'2:05');
 assert.equal(slider.value,'250');
 slider.value='600';s.fire('#music-seek','input',{target:slider});
 assert.ok(Math.abs(s.audio.currentTime-75.36)<.02);
 assert.equal(s.element('#music-current').textContent,'1:15');
 slider.value='1000';s.fire('#music-seek','change',{target:slider});
 assert.equal(s.audio.currentTime,125.6);
});

test('repeat-one restarts same song, repeat-off stops at end of queue, settings persist',async()=>{
 const s=setup();await tick();
 s.fire('#music-repeat','click'); // all => one
 assert.equal(s.saved.get('keso.music.repeat'),'one');
 assert.equal(s.ctx.KesoMusic.getState().repeat,'one');
 s.audio.currentTime=100;
 const played=s.audio.played;
 s.audio.listeners.get('ended')();await tick();
 assert.equal(s.audio.currentTime,0);
 assert.ok(s.audio.played>played);
 assert.equal(s.ctx.KesoMusic.getState().track,'mou');
 s.fire('#music-repeat','click'); // one => off
 assert.equal(s.saved.get('keso.music.repeat'),'off');
 s.element('#music-track').value='masakane';
 s.fire('#music-track','change');await tick();
 const before=s.audio.src;
 s.audio.paused=true;s.audio.listeners.get('ended')();await tick();
 assert.equal(s.audio.src,before,'repeat-off should not wrap from final track');
 assert.match(s.element('.music-status').textContent,/終了/);
 const restored=setup({savedEntries:[['keso.music.repeat','one'],['keso.music.shuffle','on']]});
 await tick();
 assert.equal(restored.ctx.KesoMusic.getState().repeat,'one');
 assert.equal(restored.ctx.KesoMusic.getState().shuffle,true);
});

test('shuffle, previous, lyrics tabs and newly adopted tracks work together',async()=>{
 const s=setup();await tick();
 s.fire('#music-shuffle','click');
 assert.equal(s.ctx.KesoMusic.getState().shuffle,true);
 assert.equal(s.saved.get('keso.music.shuffle'),'on');
 const current=s.audio.src;
 s.fire('#music-next','click');await tick();
 assert.notEqual(s.audio.src,current);
 s.audio.currentTime=5;
 const source=s.audio.src;
 s.fire('#music-prev','click');
 assert.equal(s.audio.currentTime,0,'previous restarts playing song after 3 seconds');
 assert.equal(s.audio.src,source);
 s.fire('#music-tab-lyrics','click');
 assert.equal(s.element('#music-lyrics-panel').hidden,false);
 assert.equal(s.element('#music-library').hidden,true);
 assert.ok(s.element('#music-lyrics-content').textContent.trim().length>0,'lyrics panel contains text for randomly selected song');
 const before=s.audio.src;
 // Shuffle may already have selected fullpa, so always choose a DIFFERENT official song.
 const target=s.ctx.KesoMusic.getState().track==='fullpa'?'relic':'fullpa';
 s.fire('#music-song-'+target,'click');await tick();
 assert.notEqual(s.audio.src,before,'selecting another uploaded song replaces current playback');
 assert.match(decodeURI(s.audio.src),target==='relic'?/値札のない遺物B\.mp3$/:/フルパならB\.mp3$/);
 assert.equal(s.saved.get('keso.music.track'),target);
 assert.equal(s.ctx.KesoMusic.getState().playing,true);
 assert.match(s.element('#music-lyrics-content').textContent,target==='relic'?/値札のない遺物/:/フルパなら/);
 assert.doesNotMatch(s.element('#music-lyrics-content').textContent,/\[(?:Verse|Chorus|Intro|Bridge)\]/);
 s.fire('#music-tab-library','click');
 assert.equal(s.element('#music-library').hidden,false);
});

test('lyrics are curated static official copy, not uploaded or HTML executed',async()=>{
 const s=setup({savedEntries:[['keso.music.track','gosa']]});await tick();
 s.fire('#music-tab-lyrics','click');
 assert.match(s.element('#music-lyrics-content').textContent,/私は誤差の女王/);
 assert.equal(s.element('#music-lyrics-title').textContent,'誤差の女王');
 assert.doesNotMatch(s.element('#music-lyrics-content').textContent,/\[Instrumental|\[Final Chorus/);
 assert.doesNotMatch(source,/indexedDB|readAsArrayBuffer|createObjectURL|type="file"/);
 assert.doesNotMatch(source,/fetch\(/, "all eight official paths are registered statically");
 assert.ok(s.root.innerHTML.includes('music-song-relic'),'newly approved tracks listed clearly');
});


test('three adopted MP3s are immediately selectable with correct filenames and reusable lyrics',async()=>{
 const s=setup();await tick();
 for (const [id, filename, excerpt] of [
  ['fullpa','フルパならB.mp3','フルパなら'],
  ['relic','値札のない遺物B.mp3','七KP'],
  ['masakane','まさかねC.mp3','まさかね']
 ]){
  assert.match(s.root.innerHTML,new RegExp('<option value="'+id+'">'));
  s.element('#music-track').value=id;
  s.fire('#music-track','change');await tick();
  assert.ok(decodeURI(s.audio.src).endsWith(filename),'wrong official MP3 for '+id);
  assert.equal(s.saved.get('keso.music.track'),id);
  s.fire('#music-tab-lyrics','click');
  assert.ok(s.element('#music-lyrics-content').textContent.includes(excerpt),'wrong lyrics for '+id);
  s.fire('#music-tab-library','click');
 }
 assert.match(s.root.innerHTML,/8曲配信中/);
 const restored=setup({savedEntries:[['keso.music.track','masakane']]});await tick();
 assert.equal(restored.element('#music-track').value,'masakane');
 assert.match(decodeURI(restored.audio.src),/まさかねC\.mp3$/);
});

test('shuffle plays all eight official songs once; repeat off ends without cycling',async()=>{
 const s=setup();await tick();
 s.fire('#music-repeat','click'); // all -> one
 s.fire('#music-repeat','click'); // one -> off
 s.fire('#music-shuffle','click'); // on
 const seen=[s.ctx.KesoMusic.getState().track];
 for(let i=0;i<7;i++){
  s.audio.listeners.get('ended')();await tick();
  seen.push(s.ctx.KesoMusic.getState().track);
 }
 assert.equal(new Set(seen).size,8,'eight official songs should appear once per shuffle cycle');
 const played=s.audio.played;
 s.audio.paused=true;
 s.audio.listeners.get('ended')();await tick();
 assert.equal(s.audio.played,played,'repeat off must not start another shuffle cycle automatically');
 assert.match(s.element('.music-status').textContent,/終了/);
});
