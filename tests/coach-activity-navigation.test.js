import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../coach/home-link.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../coach.html', import.meta.url), 'utf8');

function setup() {
  const elements = [];
  const el = (tag) => {
    const node = {tag, className:'', dataset:{}, style:{}, children:[], removed:false,
      append(...items){this.children.push(...items);},
      setAttribute(k,v){(this.attrs??={})[k]=v;},
      addEventListener(k,fn){(this.listeners??={})[k]=fn;},
      focus(){this.focused=true;},
      remove(){this.removed=true;},
      querySelector(sel){if(sel==='[data-coach-entry]')return this.children.find(n=>n.dataset.coachEntry)||null;return null;}
    };
    elements.push(node);
    return node;
  };
  const home = el('nav');
  const app = {
    inert:false,
    querySelector(sel){return sel==='nav.shortcut-grid'?home:null;}
  };
  const body = el('body');
  const document = {getElementById(id){return id==='app'?app:null;},
    createElement:el, body};
  const MutationObserver = class {observe(node,settings){assert.equal(node,app);assert.equal(settings.subtree,true);}};
  runInNewContext(source, {document, MutationObserver});
  return {home,app,body};
}

test('home coach opens as an overlay without navigating/restarting the Discord Activity',()=>{
  const {home,app,body}=setup();
  const link=home.querySelector('[data-coach-entry]');
  assert.equal(link.href,'./coach.html');
  const e={defaultPrevented:false,currentTarget:link,preventDefault(){this.defaultPrevented=true;}};
  link.listeners.click(e);
  assert.equal(e.defaultPrevented,true,'a normal top-level navigation would restart the Discord SDK');
  assert.equal(body.children.length,1);
  const overlay=body.children[0];
  assert.equal(overlay.dataset.coachOverlay,'true');
  assert.equal(app.inert,true);
  const frame=overlay.children[1];
  assert.equal(frame.tag,'iframe');
  assert.match(frame.src,/^\.\/coach\.html\?embedded=1&v=/);
  assert.equal(frame.src.includes('token'),false);
  const back=overlay.children[0].children[0];
  back.listeners.click();
  assert.equal(overlay.removed,true);
  assert.equal(app.inert,false);
  assert.equal(link.focused,true);
  link.listeners.click(e);
  assert.equal(body.children.length,2,'opening again creates another overlay, not another Activity boot');
});

test('coach adopts the same-origin Discord KP proxy and hides nested page navigation',()=>{
  assert.match(html,/location\.hostname\.endsWith\('\.discordsays\.com'\)\?'\/\.proxy\/kp-api'/);
  assert.match(html,/html\.coach-embedded \[data-coach-back\]/);
  assert.match(html,/window\.parent!==window/);
  assert.match(html,/read\('keso-kp-session-v1',localStorage\)/);
});
