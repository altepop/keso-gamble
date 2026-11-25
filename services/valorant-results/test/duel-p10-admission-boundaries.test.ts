import assert from 'node:assert/strict';
import test from 'node:test';
import {decideSpectatorAdmission,compareSpectatorRevision} from '../src/duel-spectator-admission.ts';
import type {SpectatorSnapshot} from '../src/duel-spectator-public.ts';

const input={viewer:'viewer-1',viewerGuild:'guild-1',matchGuild:'guild-1',matchId:'match-1',approvedViewerIds:['viewer-1']} as const;
const snapshot:SpectatorSnapshot={id:'match-1',game:'othello',status:'active',participants:['a','b'],turn:'a',winner:null,version:2,updatedAt:100,publicState:{board:'........'}};
test('P10 readiness: identity, guild and explicit grant boundaries fail closed',()=>{
 for(const viewer of [null,'']){
  assert.deepEqual(decideSpectatorAdmission({...input,viewer}),{allowed:false,reason:'unauthenticated'});
 }
 for(const viewerGuild of [null,'']){
  const result=decideSpectatorAdmission({...input,viewerGuild});
  assert.equal(result.allowed,false);
 }
 for(const matchGuild of ['guild-2','']){
  assert.deepEqual(decideSpectatorAdmission({...input,matchGuild}),{allowed:false,reason:'guild_mismatch'});
 }
 for(const approvedViewerIds of [[],['viewer-2'],['viewer-1-suffix']]){
  assert.deepEqual(decideSpectatorAdmission({...input,approvedViewerIds}),{allowed:false,reason:'not_authorized'});
 }
 assert.deepEqual(decideSpectatorAdmission(input),{allowed:true,viewer:'viewer-1',guild:'guild-1',matchId:'match-1'});
});
test('P10 readiness: malformed match IDs cannot be authorized by otherwise valid grants',()=>{
 for(const matchId of ['', 'x'.repeat(257)]){
  assert.deepEqual(decideSpectatorAdmission({...input,matchId}),{allowed:false,reason:'match_unavailable'});
 }
});
test('P10 readiness: invalid snapshot revisions are rejected before building a response',()=>{
 for(const version of [-1,0.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>compareSpectatorRevision({...snapshot,version},null),/invalid snapshot version/);
 }
 assert.deepEqual(compareSpectatorRevision(snapshot,2),{kind:'no_change',version:2});
 assert.deepEqual(compareSpectatorRevision(snapshot,1),{kind:'snapshot',snapshot});
});
