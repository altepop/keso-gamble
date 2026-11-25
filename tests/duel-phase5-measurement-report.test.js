import test from 'node:test';import assert from 'node:assert/strict';
import {formatDuelRenderReport} from '../duel-quality/duel-measurement-report.js';
test('only confirmed local durations and caution included in report',()=>{
 const r=formatDuelRenderReport([{game:'othello',ms:130,confirmed:true},{game:'poker',ms:999,confirmed:false}]);
 assert.match(r,/othello: 1件/);assert.match(r,/相手への反映時間ではなく/);
 assert.doesNotMatch(r,/poker:/);assert.match(r,/p50 130ms/);
});
test('empty report does not invent latency',()=>{const r=formatDuelRenderReport([]);assert.match(r,/現在の有効な測定値なし/);assert.doesNotMatch(r,/p50/);});
