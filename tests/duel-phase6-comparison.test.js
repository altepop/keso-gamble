import test from 'node:test';import assert from 'node:assert/strict';
import {compareDuelLocalRenderSamples} from '../duel-quality/duel-comparison.js';
test('exclude different methods and under-sampled games',()=>{
 const x=[...Array(5)].map((_,i)=>({game:'othello',ms:100+i,method:'local-gesture-to-confirmed-render',confirmed:true}));
 x.push({game:'poker',ms:1,method:'manual',confirmed:true},{game:'connect4',ms:20,method:'local-gesture-to-confirmed-render',confirmed:true});
 const r=compareDuelLocalRenderSamples(x);
 assert.deepEqual(r.eligible.map(v=>v.game),['othello']);
 assert.deepEqual(r.insufficient,[{game:'connect4',count:1}]);
 assert.match(r.note,/相手への反映保証ではない/);
});
test('empty sample set remains empty, not zero milliseconds',()=>{
 const r=compareDuelLocalRenderSamples([]);assert.equal(r.samplesObserved,0);assert.deepEqual(r.eligible,[]);
});
