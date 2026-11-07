import test from 'node:test';import assert from 'node:assert/strict';
import {UNSUPPORTED_REVIEW_FLAGS,supportsReviewRules} from '../src/mahjong-review-rules.ts';
test('normal modes and zero extension flags keep analysis available; active special rules are excluded',()=>{
 for(const mode of [1,2,11,12]){
  assert.equal(supportsReviewRules({config:{mode:{mode}}}),true);
  assert.equal(supportsReviewRules({config:{mode:{mode,detail_rule:Object.fromEntries(UNSUPPORTED_REVIEW_FLAGS.map(k=>[k,0]))}}}),true);
 }
 for(const flag of UNSUPPORTED_REVIEW_FLAGS){
  for(const value of [1,true,'active'])assert.equal(supportsReviewRules({config:{mode:{mode:2,detail_rule:{[flag]:value}}}}),false,flag);
 }
 assert.equal(supportsReviewRules({}),false);assert.equal(supportsReviewRules({config:{mode:{mode:99}}}),false);
});
