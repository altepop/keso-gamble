import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const code=readFileSync(new URL('../duel-preview/bridge.js',import.meta.url),'utf8');
const main=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const demo=readFileSync(new URL('../duel-demo.html',import.meta.url),'utf8');

function mount(){
  const documentHandlers=new Map(),windowHandlers=new Map(),events=[];
  let active=null;
  function element(tag){
    const el={
      tag,children:[],attributes:{},style:{},inert:false,isConnected:true,
      append(...nodes){this.children.push(...nodes);nodes.forEach(n=>n.parent=this);},
      appendChild(node){this.append(node);return node;},
      setAttribute(key,value){this.attributes[key]=value;},
      addEventListener(key,handler){(this.handlers??=new Map()).set(key,handler);},
      remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);},
      focus(){active=this;},
    };
    if(tag==='iframe')el.contentWindow={};
    return el;
  }
  const app=element('div'),body=element('body');
  body.style.overflow='auto';
  const anchor={href:'https://example.org/duel-demo.html?cpu=1',isConnected:true,closest(selector){return selector==='a[href]'?this:null;},focus(){active=this;}};
  app.contains=el=>el===anchor;
  const doc={
    baseURI:'https://example.org/index.html',body,
    getElementById:id=>id==='app'?app:null,
    createElement:element,
    addEventListener:(type,fn)=>documentHandlers.set(type,fn)
  };
  const win={addEventListener:(type,fn)=>windowHandlers.set(type,fn)};
  runInNewContext(code,{document:doc,window:win,location:{origin:'https://example.org'},URL});
  function click(target=anchor){let prevented=false;documentHandlers.get('click')({target,preventDefault(){prevented=true;}});return prevented;}
  return {app,body,anchor,doc,click,docHandlers:documentHandlers,winHandlers:windowHandlers,getActive:()=>active};
}
test('CPU practice is an overlay, not navigation; closes without unmounting the host',()=>{
  assert.match(main,/duel-preview\/bridge\.js/);
  assert.match(main,/duel-preview\/overlay\.css/);
  assert.match(demo,/data-demo-return/);
  assert.match(demo,/keso:close-cpu-practice/);
  const s=mount();
  assert.equal(s.click(),true,'intercept practice navigation');
  const shell=s.body.children[0];
  assert.equal(shell.id,'keso-cpu-practice-overlay');
  assert.equal(s.app.inert,true);
  assert.equal(s.body.style.overflow,'hidden');
  const frame=shell.children[1];
  assert.match(frame.src,/\/duel-demo\.html\?cpu=1&v=cpu-20261114-v1$/);
  s.winHandlers.get('message')({origin:'https://not-our-site.com',source:frame.contentWindow,data:{type:'keso:close-cpu-practice'}});
  assert.equal(s.app.inert,true,'reject untrusted origin');
  s.winHandlers.get('message')({origin:'https://example.org',source:{},data:{type:'keso:close-cpu-practice'}});
  assert.equal(s.app.inert,true,'reject other frames');
  s.winHandlers.get('message')({origin:'https://example.org',source:frame.contentWindow,data:{type:'keso:close-cpu-practice'}});
  assert.equal(s.app.inert,false);
  assert.equal(s.body.style.overflow,'auto');
  assert.equal(shell.isConnected,false);
  assert.equal(s.getActive(),s.anchor,'restore keyboard focus to launch control');
});
test('closing via Escape restores the app; no audio pause or external API required',()=>{
  const s=mount();
  s.click();
  let prevented=false;
  s.docHandlers.get('keydown')({key:'Escape',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(s.app.inert,false);
  assert.equal(s.body.children[0].isConnected,false);
  assert.doesNotMatch(code,/\.pause\s*\(|fetch\s*\(|api\/kp|location\.(?:href|assign|replace)/);
});
