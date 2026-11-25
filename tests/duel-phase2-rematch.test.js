import test from 'node:test';
import assert from 'node:assert/strict';
import {describeRematchGuide} from '../duel-quality/duel-quality.js';

test('a live match, unconfirmed outcome or absent rematch cannot claim a rematch',()=>{
 for(const state of [{},{finished:false,available:true},{finished:true,available:false}])
  assert.equal(describeRematchGuide(state),null);
});
test('finished match offers preparation without automatically spending KP',()=>{
 const ready=describeRematchGuide({finished:true,available:true});
 assert.equal(ready.step,0);
 assert.match(ready.description,/押しただけでは招待もKPの操作も発生しない/);
 const prepared=describeRematchGuide({finished:true,available:true,prepared:true});
 assert.equal(prepared.step,1);
 assert.match(prepared.description,/新しい招待を送る/);
 assert.match(prepared.description,/自動では開始しない/);
});
