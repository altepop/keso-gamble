import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../music/player.js',import.meta.url),'utf8');

function setup({savedEntries=[],validTitle=true,autoplayDenied=false}={}){
 const handlers=new Map(),elements=new Map(),saved=new Map(savedEntries);
 let audioCreated=0;
 const element=(name)=>{
  if(!elements.has(name))elements.set(name,{
   value:'',textContent:'',hidden:false,files:[],attributes:{},
   classList:{toggle(){},add(){},remove(){}},focus(){},
   addEventListener(type,fn){handlers.set(name+':'+type,fn);},
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
  createElement(){return root;},
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
 },Audio:class{constructor(){audioCreated++;return audio;}},URL,Map,Promise,Number,Error,globalThis:null,queueMicrotask};
 ctx.globalThis=ctx;
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

test('background playback advances across five songs then wraps to beginning',async()=>{
 const s=setup();
 await tick();
 s.document.hidden=true;
 const expected=['genkai-rhapsody.mp3','午前二時の共犯者 (1).mp3','応援歌 (Remastered).mp3','誤差の女王B.mp3','mou-isshu.mp3'];
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
