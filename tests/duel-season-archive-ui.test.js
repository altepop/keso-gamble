import test from 'node:test';
import assert from 'node:assert/strict';
import {duelOperationsPanel} from '../js/duel-phase11-12-view.js';

test('stored weekly rankings are available only to authorised owner',()=>{
 const archives={seasons:[{id:'2026-11-16',sampledMatches:2,rankings:[{
  user:'633269291831132161',wins:1,losses:0,draws:1
 }]}]};
 assert.equal(duelOperationsPanel({available:false,archives}),'');
 const html=duelOperationsPanel({available:true,archives});
 assert.match(html,/data-duel-season-archive/);
 assert.match(html,/2026-11-16/);
 assert.match(html,/1勝 0敗 1分/);
 assert.match(html,/復元用バックアップではありません/);
});
test('empty first-run archive does not fabricate historical ranks',()=>{
 const html=duelOperationsPanel({available:true,archives:{seasons:[]}});
 assert.match(html,/保存記録はまだありません/);
});
