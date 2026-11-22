import test from 'node:test';
import assert from 'node:assert/strict';
import {duelScreen} from '../js/duel-view.js';
import {duelPvePanel} from '../js/duel-phase11-12-view.js';
test('duel renders all five Play categories passed by parent, independent of pending invitations',()=>{
 const tabs='<nav class="sub-tabs">'+['race','mleague','casino','duels','market'].map(id=>'<button class="sub-tab" data-screen="'+id+'">'+id+'</button>').join('')+'</nav>';
 const html=duelScreen({info:{matches:[],members:[]},user:'633269291831132161',cash:196671,live:true,tabs,mode:'home',nav:'<footer>bottom navigation</footer>'});
 for(const id of ['race','mleague','casino','duels','market'])assert.match(html,new RegExp('data-screen="'+id+'"'));
 assert.ok(html.indexOf('class="sub-tabs"')>html.indexOf('⚔️ 決闘'));
 assert.ok(html.indexOf('class="sub-tabs"')<html.indexOf('duel-entry-home'));
 assert.deepEqual([...html.matchAll(/data-duel-entry="([^"]+)"/g)].map(x=>x[1]),['pve','pvp','practice']);
});
test('in-place full PvE selector and rewards preserve server-only win/reward fields',()=>{
 const rendered=duelPvePanel({live:true,open:true,game:'othello',level:'normal',rewardsOpen:true,rewards:{
  collection:[{mode:'pve',game:'othello'}],skills:[{mode:'pve',game:'othello',wins:3,losses:1,draws:0}]
 }});
 assert.match(rendered,/id="duel-pve-section"/);
 assert.match(rendered,/CPU攻略アリーナ/);
 assert.match(rendered,/data-duel-pve-custom-start/);
 assert.match(rendered,/id="duel-rewards-in-app"/);
 assert.match(rendered,/3勝 1敗 0分/);
 assert.doesNotMatch(rendered,/duel-pve\.html/);
});
test('in-place PvE is not exposed as a separate-page link in quality enhancement',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../duel-quality/duel-quality.js',import.meta.url),'utf8');
 const p=source.slice(source.indexOf('function scanPveEntry(){'),source.indexOf('function scan() {'));
 assert.match(p,/document\.createElement\('button'\)/);
 assert.match(p,/dataset\.duelPveLink/);
 assert.match(p,/dataset\.duelPveRewards/);
 assert.doesNotMatch(p,/href\s*=|duel-pve\.html/);
});
