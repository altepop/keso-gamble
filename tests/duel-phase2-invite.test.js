import test from 'node:test';
import assert from 'node:assert/strict';
import {describeInviteReadiness} from '../duel-quality/duel-quality.js';

test('invitation requires a visible opponent before claiming readiness',()=>{
 assert.match(describeInviteReadiness({hasMembers:false}).title,/確認待ち/);
 assert.match(describeInviteReadiness({hasMembers:true,hasOpponent:false}).title,/相手を選択/);
 assert.match(describeInviteReadiness({hasOpponent:true,canAfford:true}).title,/準備ができた/);
});
test('insufficient displayed cash never encourages a submission',()=>{
 const state=describeInviteReadiness({hasOpponent:true,canAfford:false});
 assert.equal(state.type,'low');
 assert.match(state.detail,/賭け金を下げる/);
 assert.doesNotMatch(state.title+state.detail,/申し込み時にはKPは減らず/);
});
test('high-stake and unresolved requests require explicit checks',()=>{
 const high=describeInviteReadiness({hasOpponent:true,canAfford:true,highStake:true});
 assert.match(high.title,/再確認/);
 const busy=describeInviteReadiness({hasOpponent:true,canAfford:true,busy:true});
 assert.match(busy.title,/完了を確認中/);
 const retry=describeInviteReadiness({hasOpponent:true,canAfford:true,retry:true});
 assert.match(retry.detail,/新しい招待を送らない/);
});
test('unknown cash does not infer affordability',()=>{
 const state=describeInviteReadiness({hasOpponent:true,canAfford:null});
 assert.equal(state.type,'waiting');
 assert.doesNotMatch(state.title,/不足|準備ができた/);
});
