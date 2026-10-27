import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,spinNumbers,hydrateState} from '../js/engine.js';
test('different number stakes are debited together and only the winning stake pays 36x',()=>{
 for(const outcome of [0,7,12]){
  const s=createInitialState(),before=s.cash;
  const r=spinNumbers(s,[{number:0,amount:200},{number:7,amount:300}],outcome);
  assert.equal(r.amount,500);assert.equal(r.payout,outcome===0?7200:outcome===7?10800:0);assert.equal(s.cash,before-500+r.payout);
  assert.deepEqual(hydrateState(s).spins[0],r);
 }
});
test('malformed, duplicate, fractional, oversized or unaffordable baskets never change balance or history',()=>{
 for(const bets of [[],[{number:0,amount:100},{number:0,amount:200}],[{number:37,amount:100}],[{number:1,amount:99}],[{number:1,amount:100.5}],[{number:1,amount:11000},{number:2,amount:10000}],[{number:1,amount:11000}]]){
 const s=createInitialState(),before=structuredClone(s);assert.throws(()=>spinNumbers(s,bets,0));assert.deepEqual(s,before);
 }
});
