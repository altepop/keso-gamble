import test from 'node:test';
import assert from 'node:assert/strict';
import {relicsPanel} from '../js/relics-view.js';

const state={serverWallet:true,cash:4000,ledger:[],relics:{totalSummons:0,items:{},equipped:[]}};
const proof={
 catalog:[],modeNames:{},previews:[],steam:[
  {id:'steam:g:s:a:1',title:'0KPの実績',percent:25,amount:0,earnedToday:5000,app:123},
  {id:'steam:g:s:a:2',title:'有効な実績',percent:10,amount:100,earnedToday:5000,app:123},
 ],unite:[],
};
test('when the 5,000KP/day cap is met both unpaid and credited Steam relic claim buttons are disabled',()=>{
 const html=relicsPanel(state,{view:{section:'records'},proofs:proof});
 assert.match(html,/5,000／5,000KP/);
 assert.match(html,/0KP（対象外）/);
 assert.match(html,/翌9時まで不可/);
 assert.match(html,/当日上限/);
 assert.ok(/data-event="steam:g:s:a:1" disabled/.test(html));
 assert.ok(/data-event="steam:g:s:a:2" disabled/.test(html));
});
test('tomorrow previously credited achievements become claimable, 0KP remain disabled',()=>{
 const html=relicsPanel(state,{view:{section:'records'},proofs:{...proof,steam:proof.steam.map(e=>({...e,earnedToday:0}))}});
 assert.ok(!html.includes('翌9時まで不可'));
 assert.ok(/data-event="steam:g:s:a:1" disabled/.test(html));
 assert.ok(/data-event="steam:g:s:a:2" >獲得</.test(html));
});
