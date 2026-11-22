import test from 'node:test';
import assert from 'node:assert/strict';
import {duelPvePanel,duelOperationsPanel} from '../js/duel-phase11-12-view.js';

test('daily challenge remains KP-authenticated with honest zero-bonus disclosure',()=>{
 const off=duelPvePanel({live:false});
 assert.match(off,/KP口座への接続が必要/);
 assert.doesNotMatch(off,/data-duel-pve-start/);
 const on=duelPvePanel({live:true,preview:{day:'20261123',game:'othello',level:'strong'}});
 assert.match(on,/data-duel-pve-start/);
 assert.match(on,/日替わり特別KPはない/);
 assert.match(on,/オセロ/);
});
test('all 6 server-owned game modes expose actionable controls without rendering secrets',()=>{
 const shared={id:'11111111-2222-4333-8444-555555555555',level:'normal',version:1,humanMoves:1,turn:'human',winner:null};
 const boards={othello:'.'.repeat(64),gomoku:'.'.repeat(225),connect4:'.'.repeat(42),hitblow:JSON.stringify({history:[],turn:'a'}),bluffdice:JSON.stringify({turn:'a',bid:null}),poker:JSON.stringify({turn:'a'})};
 for(const [game,board] of Object.entries(boards)){
  const html=duelPvePanel({live:true,match:{...shared,game,board,ownHand:{kind:game,value:[1,2,3,4,5]}}});
  assert.match(html,/data-duel-pve-(cell|move)/,game);
  assert.doesNotMatch(html,/privateB|secret|password|token/i,game);
 }
});
test('ambiguous actions present explicit retry and escape dynamic messages',()=>{
 const html=duelPvePanel({live:true,pending:{kind:'move'},error:'<img src=x onerror=alert(1)>'});
 assert.match(html,/data-duel-pve-retry/);
 assert.doesNotMatch(html,/<img/);
});
test('operator panel hides completely without server-side owner flag',()=>{
 assert.equal(duelOperationsPanel({available:false,report:{counts:{}}}),'');
 const html=duelOperationsPanel({available:true,report:{counts:{staleFinishedPve:1,staleFinishedPvp:2,activePve:3,activePvp:4},asOf:100000000,retentionReviewDays:90,reviewRecommended:true}});
 assert.match(html,/data-duel-operations-read/);
 assert.match(html,/data-duel-operations-records/);
 assert.match(html,/自動削除：なし/);
});
