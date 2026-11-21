import assert from 'node:assert/strict';
import test from 'node:test';
import {spectatorPublicSnapshot,type SpectatorSource} from '../src/duel-spectator-public.ts';

const valid:SpectatorSource={
 id:'match-1',guild:'guild-a',game:'othello',status:'active',
 user_a:'a',user_b:'b',turn_user:'a',winner:null,
 version:1,updated_at:100,board:'........',
};

test('P10 privacy: malformed turn and winner values cannot enter a public DTO',()=>{
 const invalid:unknown[]=[
  undefined,true,1,{},[],{private_hand:'DO_NOT_EXPOSE'},'','x'.repeat(257),
 ];
 for(const value of invalid){
  assert.throws(()=>spectatorPublicSnapshot({...valid,turn_user:value as string}),/spectator snapshot unavailable/);
  assert.throws(()=>spectatorPublicSnapshot({...valid,winner:value as string}),/spectator snapshot unavailable/);
 }
});

test('P10 privacy: valid nullable and explicit participant fields retain the existing contract',()=>{
 const pending=spectatorPublicSnapshot({...valid,status:'pending',turn_user:null,winner:null});
 assert.equal(pending.turn,null);
 assert.equal(pending.winner,null);
 const finished=spectatorPublicSnapshot({...valid,status:'finished',turn_user:'b',winner:'a',version:2});
 assert.equal(finished.turn,'b');
 assert.equal(finished.winner,'a');
 assert.equal(Object.hasOwn(finished,'guild'),false);
});
