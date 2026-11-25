import assert from 'node:assert/strict';
import test from 'node:test';
import {decideSpectatorAdmission} from '../src/duel-spectator-admission.ts';

const valid={viewer:'viewer-a',viewerGuild:'guild-a',matchGuild:'guild-a',matchId:'match-a',approvedViewerIds:['viewer-a']} as const;
test('P10 readiness: simultaneous admission failures are rejected in fail-closed order',()=>{
 const cases=[
  [{viewer:null,viewerGuild:'other',matchGuild:'guild-a',matchId:''},'unauthenticated'],
  [{viewerGuild:'other',matchId:'',approvedViewerIds:[]},'guild_mismatch'],
  [{matchId:'',approvedViewerIds:[]},'match_unavailable'],
  [{approvedViewerIds:['viewer-b']},'not_authorized'],
 ] as const;
 for(const [change,reason] of cases){
  assert.deepEqual(decideSpectatorAdmission({...valid,...change}),{allowed:false,reason});
 }
});
test('P10 readiness: caller input authorization grants are not mutated',()=>{
 const grants=Object.freeze(['viewer-a','viewer-b']);
 const input={...valid,approvedViewerIds:grants};
 assert.deepEqual(decideSpectatorAdmission(input),{allowed:true,viewer:'viewer-a',guild:'guild-a',matchId:'match-a'});
 assert.deepEqual(grants,['viewer-a','viewer-b']);
});
