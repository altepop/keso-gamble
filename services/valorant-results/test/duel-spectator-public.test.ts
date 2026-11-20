import assert from 'node:assert/strict';
import test from 'node:test';
import {spectatorPublicSnapshot,type SpectatorSource} from '../src/duel-spectator-public.ts';
const base:SpectatorSource={
 id:'match',guild:'guild',game:'hitblow',status:'active',
 user_a:'a',user_b:'b',turn_user:'a',winner:null,version:2,updated_at:100,
 board:JSON.stringify({history:[{by:'a',guess:'1234',hit:1,blow:2,secret:'HIDE'}],
  secret:'DO-NOT-REVEAL',privateA:'DO-NOT-REVEAL',privateB:'DO-NOT-REVEAL',
  ownHand:'DO-NOT-REVEAL',seed:'DO-NOT-REVEAL'}),
};
test('P10.1 whitelist never exposes a private field',()=>{
 for(const game of ['hitblow','bluffdice','poker'] as const){
  const projection=spectatorPublicSnapshot({...base,game});
  const json=JSON.stringify(projection);
  assert.doesNotMatch(json,/DO-NOT-REVEAL|HIDE|privateA|privateB|seed|ownHand/);
  assert.equal(projection.version,2);
 }
});
test('P10.1 public position is projected for board-only games',()=>{
 for(const game of ['othello','gomoku','connect4'] as const){
  const projection=spectatorPublicSnapshot({...base,game,board:'........',private_hand:'PRIVATE'} as SpectatorSource);
  assert.deepEqual(projection.publicState,{board:'........'});
  assert.doesNotMatch(JSON.stringify(projection),/PRIVATE/);
 }
});
test('P10.1 missing or malformed state fails closed',()=>{
 assert.throws(()=>spectatorPublicSnapshot({...base,version:-1}),/unavailable/);
 assert.throws(()=>spectatorPublicSnapshot({...base,game:'unknown'} as unknown as SpectatorSource),/unavailable/);
 assert.deepEqual(spectatorPublicSnapshot({...base,board:'not json'}).publicState,null);
});
