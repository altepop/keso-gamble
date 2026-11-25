import assert from 'node:assert/strict';
import test from 'node:test';
import {spectatorPublicSnapshot,type SpectatorSource} from '../src/duel-spectator-public.ts';
const base:SpectatorSource={id:'match-1',guild:'guild-1',game:'bluffdice',status:'active',user_a:'a',user_b:'b',turn_user:'a',winner:null,version:1,updated_at:1,board:'{}'};
const secret='DO_NOT_EXPOSE_PRIVATE';
test('P10 readiness: private-game projection rejects non-object board shapes without echoes',()=>{
 for(const game of ['bluffdice','hitblow','poker'] as const){
  for(const board of ['null','[]','"'+secret+'"','42','false']){
   const result=spectatorPublicSnapshot({...base,game,board});
   assert.equal(result.publicState,null);
   assert.doesNotMatch(JSON.stringify(result),/DO_NOT_EXPOSE_PRIVATE/);
  }
 }
});
test('P10 readiness: bluffdice malformed bids cannot leak private nested objects',()=>{
 for(const bid of [null,false,123,'secret',[],{by:'a',count:-1,face:NaN,private_hand:secret}]){
  const result=spectatorPublicSnapshot({...base,board:JSON.stringify({bid,dice:[secret],token:secret})});
  assert.doesNotMatch(JSON.stringify(result),/DO_NOT_EXPOSE_PRIVATE/);
  assert.deepEqual(Object.keys(result.publicState as object),['bid']);
 }
});
test('P10 readiness: hitblow filters null entries and strips nested secrets',()=>{
 const board=JSON.stringify({history:[null,42,{by:'a',guess:'1234',hit:2,blow:1,answer:secret}],answer:secret});
 const result=spectatorPublicSnapshot({...base,game:'hitblow',board});
 assert.deepEqual(result.publicState,{history:[{by:'a',guess:'1234',hit:2,blow:1}]});
 assert.doesNotMatch(JSON.stringify(result),/DO_NOT_EXPOSE_PRIVATE/);
});
