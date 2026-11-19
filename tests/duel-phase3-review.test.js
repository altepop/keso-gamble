import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyVisibleDuelHistoryLabel,summarizeLoadedDuelHistory} from '../duel-quality/duel-quality.js';

test('only public status suffixes classify already-rendered match rows',()=>{
 assert.equal(classifyVisibleDuelHistoryLabel('相手 · 終了'),'finished');
 assert.equal(classifyVisibleDuelHistoryLabel('相手 · 対局中'),'ongoing');
 assert.equal(classifyVisibleDuelHistoryLabel('相手 · 招待中'),'ongoing');
 assert.equal(classifyVisibleDuelHistoryLabel('相手 · キャンセル'),'other');
 assert.equal(classifyVisibleDuelHistoryLabel('名前が終了 · 招待中'),'ongoing');
 assert.equal(classifyVisibleDuelHistoryLabel(''), 'other');
});
test('history counts never infer off-screen or unloaded matches',()=>{
 assert.deepEqual(summarizeLoadedDuelHistory(['A · 終了','B · 対局中','C · キャンセル','D · 招待中']),
  {all:4,ongoing:2,finished:1});
 assert.deepEqual(summarizeLoadedDuelHistory([]),{all:0,ongoing:0,finished:0});
 assert.equal(summarizeLoadedDuelHistory(null),null);
});
