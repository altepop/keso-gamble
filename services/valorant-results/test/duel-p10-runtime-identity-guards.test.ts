import assert from 'node:assert/strict';
import test from 'node:test';
import {decideSpectatorAdmission,type SpectatorAdmissionInput} from '../src/duel-spectator-admission.ts';

const valid:SpectatorAdmissionInput={
 viewer:'viewer-a',viewerGuild:'guild-a',matchGuild:'guild-a',
 matchId:'match-a',approvedViewerIds:['viewer-a'],
};
const invalid:unknown[]=[undefined,null,0,1,true,{},[],'','   ','x'.repeat(257)];

test('P10 safety: malformed viewer and viewer-guild identities always deny unauthenticated',()=>{
 for(const value of invalid){
  assert.deepEqual(decideSpectatorAdmission({...valid,viewer:value as string}),{
   allowed:false,reason:'unauthenticated',
  });
  assert.deepEqual(decideSpectatorAdmission({...valid,viewerGuild:value as string}),{
   allowed:false,reason:'unauthenticated',
  });
 }
 assert.deepEqual(decideSpectatorAdmission(null as unknown as SpectatorAdmissionInput),{
  allowed:false,reason:'unauthenticated',
 });
});

test('P10 safety: malformed match-guild and match IDs cannot pass with explicit grants',()=>{
 for(const value of invalid){
  assert.deepEqual(decideSpectatorAdmission({...valid,matchGuild:value as string}),{
   allowed:false,reason:'guild_mismatch',
  });
  assert.deepEqual(decideSpectatorAdmission({...valid,matchId:value as string}),{
   allowed:false,reason:'match_unavailable',
  });
 }
});

test('P10 safety: valid identity strings and explicit viewer grant retain existing contract',()=>{
 assert.deepEqual(decideSpectatorAdmission(valid),{
  allowed:true,viewer:'viewer-a',guild:'guild-a',matchId:'match-a',
 });
 assert.deepEqual(decideSpectatorAdmission({...valid,approvedViewerIds:[]}),{
  allowed:false,reason:'not_authorized',
 });
});
