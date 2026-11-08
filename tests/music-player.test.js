import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../music/player.js',import.meta.url),'utf8');

function setup(){
 const handlers=new Map(),elements=new Map(),saved=new Map();let audioCreated=0;
 const element=(name)=>{
  if(!elements.has(name))elements.set(name,{
   value:'',textContent:'',hidden:false,files:[],attributes:{},
   classList:{toggle(){}},focus(){},
   addEventListener(type,fn){handlers.set(name+':'+type,fn);},
   setAttribute(k,v){this.attributes[k]=v;}
  });
  return elements.get(name);
 };
 const root={id:'',innerHTML:'',querySelector:element};
 const events=new Map(),document={
  baseURI:'https://example.org/',hidden:false,
  querySelector(){return null;},getElementById(){return null;},
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
  async play(){this.paused=false;this.played++;this.listeners.get('play')?.();},
  addEventListener(type,fn){this.listeners.set(type,fn);}
 };
 const ctx={document,window:{addEventListener(){}},localStorage:{
  getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)
 },Audio:class{constructor(){audioCreated++;return audio;}},URL,Map,Promise,Number,Error,globalThis:null};
 ctx.globalThis=ctx;
 runInNewContext(source,ctx);
 return {ctx,document,audio,element,fire:(name,type,ev={})=>handlers.get(name+':'+type)?.(ev),events,saved,created:()=>audioCreated};
}

test('music player is off by default, independent of KP and D1, volume persists',async()=>{
 const s=setup();
 assert.equal(s.audio.played,0);
 assert.equal(s.created(),0,'the Activity must not create Audio before a tap');
 assert.equal(s.ctx.KesoMusic.getState().volume,15);
 const slider=s.element('#music-volume');slider.value='38';
 s.fire('#music-volume','input',{target:slider});
 assert.equal(s.created(),0,'volume changes do not activate the audio session');
 assert.equal(s.saved.get('keso.music.volume'),'38');
 s.fire('#music-play','click');await new Promise(setImmediate);
 assert.equal(s.audio.volume,.38,'saved volume applies after the trusted tap');
 assert.equal(s.audio.played,1);assert.equal(s.created(),1);assert.match(s.audio.src,/mou-isshu\.mp3$/);assert.equal(s.ctx.KesoMusic.getState().playing,true);
 s.fire('#music-play','click');assert.equal(s.ctx.KesoMusic.getState().playing,false);
 s.element('#music-track').value='rhapsody';
 s.fire('#music-track','change');await new Promise(setImmediate);
 assert.match(s.audio.src,/genkai-rhapsody\.mp3$/);
 assert.equal(s.saved.get('keso.music.track'),'rhapsody');
 s.fire('#music-play','click');await new Promise(setImmediate);
 s.document.hidden=true;s.events.get('visibilitychange')();
 assert.equal(s.audio.paused,true);
});
