import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyOthelloTransition,classifyConnect4Transition,classifyGomokuTransition,
 classifyHitBlowFeedback,classifyBluffReveal,classifyPokerReveal,
 describeDuelJourney,describeDuelConnection} from '../duel-quality/duel-quality.js';
import {summarizeDuelRenderSamples} from '../duel-quality/duel-latency-samples.js';
import {compareDuelLocalRenderSamples} from '../duel-quality/duel-comparison.js';

test('six game transition observers fail closed on unchanged snapshots',()=>{
 const o=Array(64).fill('.');
 assert.equal(classifyOthelloTransition(o,o),null);
 const c='.'.repeat(42);assert.equal(classifyConnect4Transition(c,c),null);
 const g='.'.repeat(225);assert.equal(classifyGomokuTransition(g,g),null);
 assert.equal(classifyHitBlowFeedback({id:'x',version:3,count:1},{id:'x',version:3,count:1}),null);
 assert.equal(classifyBluffReveal({id:'x',version:3,history:1,bid:'a:2'}, {id:'x',version:3,history:1,last:'a:2'}),null);
 assert.equal(classifyPokerReveal({id:'x',version:3,revealed:false,done:'0:1'},{id:'x',version:3,revealed:false,done:'0:1'}),null);
});
test('reconnect skips several queued updates rather than inventing a single move',()=>{
 const g='.'.repeat(225),two='BW'+'.'.repeat(223);
 assert.equal(classifyGomokuTransition(g,two),null);
 const c='.'.repeat(42),twoChips='.'.repeat(35)+'ab'+'.'.repeat(5);
 assert.equal(classifyConnect4Transition(c,twoChips),null);
});
test('unconfirmed or unspecified client timings never create speed claims',()=>{
 const out=summarizeDuelRenderSamples([{game:'othello',ms:0,confirmed:false},{game:'poker',ms:NaN,confirmed:true}]);
 assert.deepEqual(out,{count:0,byGame:{}});
 const compare=compareDuelLocalRenderSamples([{game:'poker',ms:100,confirmed:true,method:'unknown'}]);
 assert.equal(compare.samplesObserved,0);
 assert.deepEqual(compare.eligible,[]);
 assert.match(compare.note,/相手への反映保証ではない/);
});
test('connection and awaiting sync state remain explicit, even if games are compacted',()=>{
 const active=describeDuelJourney({stage:'active',myTurn:true,retry:true});
 assert.ok(active.title);
 const pending=describeDuelJourney({stage:'pending',outgoing:true});
 assert.equal(pending.step,0);
 const warn=describeDuelConnection({online:false,retry:true,refreshing:false,recovered:false});
 assert.ok(warn && warn.type);
});
