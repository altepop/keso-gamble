import test from 'node:test';
import assert from 'node:assert/strict';
import {DUEL_BEGINNER_RULES,getDuelBeginnerRules} from '../duel-quality/duel-beginner.js';
test('every shipped duel game has a rule, starting action and caution',()=>{
 const games=['othello','gomoku','connect4','hitblow','bluffdice','poker'];
 assert.deepEqual(Object.keys(DUEL_BEGINNER_RULES),games);
 for(const id of games){
  const r=getDuelBeginnerRules(id);
  assert.ok(r.name&&r.win&&r.first&&r.caution,id);
  assert.doesNotMatch(r.win+r.first+r.caution,/パスワード|トークン|秘密番号は[^。]*表示する/);
 }
});
test('high-risk misunderstandings are called out without revealing secrets',()=>{
 assert.match(getDuelBeginnerRules('othello').caution,/自動パス/);
 assert.match(getDuelBeginnerRules('gomoku').first,/確定/);
 assert.match(getDuelBeginnerRules('hitblow').caution,/終了時の公開まで/);
 assert.match(getDuelBeginnerRules('bluffdice').caution,/ワイルドではない/);
 assert.match(getDuelBeginnerRules('poker').first,/0〜3枚/);
 assert.equal(getDuelBeginnerRules('__proto__'),null);
 assert.equal(getDuelBeginnerRules('unknown'),null);
});
