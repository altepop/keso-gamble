import test from 'node:test';
import assert from 'node:assert/strict';
import {DUEL_POKER_HAND_ORDER,DUEL_BLUFF_BID_RULES,summarizeVisibleOthelloCorners} from '../duel-quality/duel-insights.js';
test('confirmed Othello corners only, never invented or extrapolated from invalid boards',()=>{
 const start=Array(64).fill('.');
 assert.deepEqual(summarizeVisibleOthelloCorners(start),{black:0,white:0,open:4});
 start[0]='B';start[7]='W';start[56]='B';
 assert.deepEqual(summarizeVisibleOthelloCorners(start),{black:2,white:1,open:1});
 assert.equal(summarizeVisibleOthelloCorners(Array(63).fill('.')),null);
 assert.equal(summarizeVisibleOthelloCorners(Array(64).fill('secret')),null);
});
test('hand ranking exactly matches public game scoring order',()=>{
 assert.deepEqual(DUEL_POKER_HAND_ORDER,[
  'ストレートフラッシュ','フォーカード','フルハウス','フラッシュ','ストレート',
  'スリーカード','ツーペア','ワンペア','ハイカード'
 ]);
});
test('bluff teaching never claims to know hidden dice',()=>{
 assert.equal(DUEL_BLUFF_BID_RULES.length,4);
 assert.match(DUEL_BLUFF_BID_RULES.join(''),/1.*ワイルドではなく/);
 assert.match(DUEL_BLUFF_BID_RULES.join(''),/相手の実際の出目を示すものではない/);
});
