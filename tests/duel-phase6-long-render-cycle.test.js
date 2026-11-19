import test from 'node:test';import assert from 'node:assert/strict';
import {classifyConnect4Transition,classifyGomokuTransition,classifyOthelloTransition} from '../duel-quality/duel-quality.js';
import {summarizeDuelRenderSamples} from '../duel-quality/duel-latency-samples.js';
// This repeatable client-model exercise is NOT a real browser memory or uptime measurement.
test('long display cycles do not retain stale moves or expand sample summaries',()=>{
 const o=Array(64).fill('.'),changed=[...o];changed[0]='B';
 const c='.'.repeat(42),c1=c.slice(0,35)+'a'+c.slice(36);
 const g='.'.repeat(225),g1='B'+g.slice(1);
 const samples=[];
 for(let i=0;i<3000;i++){
   assert.equal(classifyOthelloTransition(o,o),null);
   assert.equal(classifyConnect4Transition(c,c),null);
   assert.equal(classifyGomokuTransition(g,g),null);
   assert.equal(classifyOthelloTransition(o,changed)?.placed,0);
   assert.equal(classifyConnect4Transition(c,c1)?.index,35);
   assert.equal(classifyGomokuTransition(g,g1)?.index,0);
   samples.push({game:'othello',ms:i%30,confirmed:true});
   if(samples.length>100)samples.splice(0,samples.length-100);
   if(i%300===0)assert.ok(summarizeDuelRenderSamples(samples).count<=100);
 }
 assert.equal(samples.length,100);
 assert.equal(summarizeDuelRenderSamples(samples).count,100);
});
