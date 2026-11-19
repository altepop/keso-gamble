import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeDuelRenderSamples} from '../duel-quality/duel-latency-samples.js';
test('confirmed visual durations only, reject unknown or private data',()=>{
 const data=[
 {game:'othello',ms:90,confirmed:true},{game:'othello',ms:120,confirmed:true},
 {game:'poker',ms:200,confirmed:true},{game:'poker',ms:0,confirmed:true},
 {game:'poker',ms:1,confirmed:false},{game:'unknown',ms:30,confirmed:true},
 {game:'hitblow',ms:-20,confirmed:true},{game:'gomoku',ms:Infinity,confirmed:true}
 ];
 assert.deepEqual(summarizeDuelRenderSamples(data),{count:4,byGame:{othello:{count:2,p50:90,p95:120,max:120},poker:{count:2,p50:0,p95:200,max:200}}});
});
test('bounded retention and no fabricated samples',()=>{
 assert.deepEqual(summarizeDuelRenderSamples([]),{count:0,byGame:{}});
 assert.equal(summarizeDuelRenderSamples(null),null);
 assert.equal(summarizeDuelRenderSamples([], {maxSamples:0}),null);
 const data=Array.from({length:200},(_,i)=>({game:'bluffdice',ms:i,confirmed:true}));
 assert.equal(summarizeDuelRenderSamples(data,{maxSamples:20}).byGame.bluffdice.count,20);
});
