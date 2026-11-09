import test from 'node:test';import assert from 'node:assert/strict';
import {UNSUPPORTED_REVIEW_FLAGS,supportsReviewRules,confirmedStandardReviewRules} from '../src/mahjong-review-rules.ts';
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

test('only standard ranked metadata confirms the scoring profile; custom and unknown rules abstain',()=>{
 for(const mode of [1,2,11,12])for(const mode_id of [12,24]){
  const head={config:{mode:{mode},meta:{mode_id,room_id:0,contest_uid:0}}};
  assert.equal(confirmedStandardReviewRules(head),true);
  for(const meta of [undefined,{}, {mode_id:0},{mode_id:-1},{mode_id:NaN},{mode_id:1.5},{mode_id,room_id:12345},{mode_id,contest_uid:98765}])
   assert.equal(confirmedStandardReviewRules({config:{...head.config,meta}}),false);
  assert.equal(confirmedStandardReviewRules({config:{...head.config,mode:{mode,detail_rule:{muyu_mode:1}}}}),false);
 }
});
