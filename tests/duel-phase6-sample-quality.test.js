import test from 'node:test';import assert from 'node:assert/strict';
import {summarizeDuelRenderSamples} from '../duel-quality/duel-latency-samples.js';
test('invalid, unconfirmed and hidden/private payloads are excluded',()=>{
 const samples=[{game:'othello',ms:120,confirmed:true},
 {game:'othello',ms:-1,confirmed:true},{game:'connect4',ms:Infinity,confirmed:true},
 {game:'gomoku',ms:20,confirmed:false},{game:'poker',ms:60001,confirmed:true},
 {game:'private',ms:1,confirmed:true},{game:'othello',ms:NaN,confirmed:true}];
 const r=summarizeDuelRenderSamples(samples);
 assert.equal(r.count,1);assert.deepEqual(Object.keys(r.byGame),['othello']);
 assert.deepEqual(r.byGame.othello,{count:1,p50:120,p95:120,max:120});
});
test('bounded statistics use only most recent valid samples',()=>{
 const samples=Array.from({length:120},(_,i)=>({game:'hitblow',ms:i,confirmed:true}));
 const r=summarizeDuelRenderSamples(samples,{maxSamples:10});
 assert.equal(r.count,10);assert.equal(r.byGame.hitblow.p50,114);
 assert.equal(r.byGame.hitblow.p95,119);
 assert.equal(r.byGame.hitblow.max,119);
});
test('invalid limits fail closed and empty lists stay unmeasured',()=>{
 assert.equal(summarizeDuelRenderSamples([], {maxSamples:1001}),null);
 assert.equal(summarizeDuelRenderSamples([], {maxSamples:0}),null);
 assert.deepEqual(summarizeDuelRenderSamples([]),{count:0,byGame:{}});
});
