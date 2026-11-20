import test from 'node:test';
import assert from 'node:assert/strict';
import {pvePanel} from '../duel-pve/view.js';
const cases={
 othello:{board:'.'.repeat(27)+'WB'+'.'.repeat(6)+'BW'+'.'.repeat(27)},
 gomoku:{board:'.'.repeat(225)},
 connect4:{board:'.'.repeat(42)},
 hitblow:{board:JSON.stringify({history:[],turn:'a'}),ownHand:{kind:'hitblow',value:'0123'}},
 bluffdice:{board:JSON.stringify({round:1,winsA:0,winsB:0,bid:null,history:[]}),ownHand:{kind:'bluffdice',value:[1,2,3,4,5]}},
 poker:{board:JSON.stringify({doneA:false,doneB:false,turn:'a'}),ownHand:{kind:'poker',value:[0,6,12,18,24]}}
};
const state=(game)=>({game,level:'normal',turn:'human',winner:null,version:0,...cases[game]});
test('all six modes have server-only actions and visible confirmed states',()=>{
 for(const game of Object.keys(cases)){
  const html=pvePanel({match:state(game),connected:true});
  assert.match(html,/サーバーCPU攻略/);
  assert.match(html,/サーバーで確定/);
  assert.match(html,/あなたの手番/);
  assert.match(html,/data-pve-submit="start"/);
  if(game==='othello'||game==='gomoku')assert.match(html,/data-pve-cell=/);
  if(game==='connect4')assert.match(html,/data-pve-col=/);
  if(game==='hitblow')assert.match(html,/data-pve-submit="hitblow"/);
  if(game==='bluffdice')assert.match(html,/data-pve-submit="bid"/);
  if(game==='poker')assert.match(html,/data-pve-submit="poker"/);
  assert.doesNotMatch(html,/data-duel-act="move"|data-duel-mini=/,'PvE must not send PvP moves');
 }
});
test('pending or disconnected sessions cannot send new operations',()=>{
 const disabled=pvePanel({match:state('connect4'),connected:true,pending:true});
 assert.match(disabled,/同じ操作IDで確認/);
 assert.match(disabled,/data-pve-submit="start" disabled/);
 assert.match(disabled,/data-pve-col="3"\s+disabled/);
 const offline=pvePanel({connected:false});
 assert.match(offline,/data-pve-submit="start" disabled/);
});
test('no hidden CPU hand or caller-provided outcome is presented',()=>{
 const html=pvePanel({match:state('poker'),connected:true,error:'<script>unexpected</script>'});
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/privateB|SECRET_CPU/);
 assert.match(html,/0〜3枚/);
 const finished=pvePanel({match:{...state('poker'),turn:'finished',winner:'cpu'}});
 assert.match(finished,/確定結果：CPUの勝ち/);
});
