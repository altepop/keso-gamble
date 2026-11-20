import assert from 'node:assert/strict';
import test from 'node:test';
import {spectatorPublicSnapshot,type SpectatorSource} from '../src/duel-spectator-public.ts';
const base:SpectatorSource={id:'match-1',guild:'guild',game:'bluffdice',status:'active',user_a:'a',user_b:'b',turn_user:'a',winner:null,version:1,updated_at:1,board:'{}'};
const secret='HIDDEN_DICE_SENTINEL';
test('P10 readiness: bluffdice absent bid yields null and never exposes dice',()=>{
 for(const board of ['{}',JSON.stringify({bid:null,dice:[secret]}),JSON.stringify({bid:false,dice:[secret]})]){
  const state=spectatorPublicSnapshot({...base,board}).publicState;
  assert.deepEqual(state,{bid:null});
  assert.doesNotMatch(JSON.stringify(state),/HIDDEN_DICE_SENTINEL/);
 }
});
test('P10 readiness: bid fields are allowlisted; invalid numeric values become null',()=>{
 const cases=[{count:-1,face:-1},{count:1.5,face:2.5},{count:'2',face:'5'},{count:null,face:null},{count:0,face:0}];
 for(const bid of cases){
  const state=spectatorPublicSnapshot({...base,board:JSON.stringify({bid:{...bid,by:'a',privateDice:secret},dice:secret})}).publicState as {bid:unknown};
  assert.doesNotMatch(JSON.stringify(state),/HIDDEN_DICE_SENTINEL/);
  assert.deepEqual(Object.keys(state.bid as object).sort(),['by','count','face']);
 }
});
test('P10 readiness: a valid public bid stays stable without embedding private source fields',()=>{
 const state=spectatorPublicSnapshot({...base,board:JSON.stringify({bid:{by:'a',count:3,face:6},private_hand:secret})}).publicState;
 assert.deepEqual(state,{bid:{by:'a',count:3,face:6}});
});
