import test from 'node:test';
import assert from 'node:assert/strict';
import {duelTrioPanel,duelWeeklyEventPanel,duelOperationsPanel} from '../js/duel-phase11-12-view.js';
test('new three-in-a-row game presents nine accessible cells with no KP controls',()=>{
 const html=duelTrioPanel({board:'.........',level:'strong'});
 assert.equal((html.match(/data-duel-trio-cell=/g)||[]).length,9);
 assert.match(html,/つよい（完全探索）/);
 assert.match(html,/KP・報酬・戦績は変わらない/);
 assert.doesNotMatch(html,/data-duel-act=|data-order|data-duel-stake/);
});
test('finished game disables all nine moves and can restart without payments',()=>{
 const html=duelTrioPanel({board:'XXXOO....',winner:'X'});
 assert.match(html,/あなたの勝ち/);
 assert.equal((html.match(/disabled/g)||[]).length,9);
 assert.match(html,/data-duel-trio-reset/);
});
test('weekly event displays verified server title but advertises no rewards',()=>{
 const html=duelWeeklyEventPanel({kind:'weekly-focus',title:'<unsafe>',game:'othello'});
 assert.doesNotMatch(html,/<unsafe>/);
 assert.match(html,/追加KPはありません/);
 assert.equal(duelWeeklyEventPanel(null),'');
});
test('weekly ranking stays hidden from non-owner and renders only bounded standings',()=>{
 const season={season:{id:'2026-11-23'},event:{title:'週間ピックアップ：ポーカー'},
 partial:true,rankings:[{user:'606131625084059674',wins:3,losses:1,draws:0}]};
 assert.equal(duelOperationsPanel({available:false,season}),'');
 const html=duelOperationsPanel({available:true,season});
 assert.match(html,/週間シーズン順位/);
 assert.match(html,/取得上限500試合/);
 assert.match(html,/3勝 1敗/);
 assert.match(html,/追加KPなし/);
});
