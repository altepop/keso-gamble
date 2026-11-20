import assert from 'node:assert/strict';
import test from 'node:test';
import {decideSpectatorAdmission} from '../src/duel-spectator-admission.ts';
import type {SpectatorAdmissionInput} from '../src/duel-spectator-admission.ts';

const valid:SpectatorAdmissionInput={
 viewer:'viewer-a',viewerGuild:'guild-a',matchGuild:'guild-a',
 matchId:'match-a',approvedViewerIds:['viewer-a'],
};

test('P10 readiness: non-array and spoofed grant payloads always fail closed',()=>{
 const malformed:unknown[]=[
  undefined,null,'viewer-a',true,12,
  new Set(['viewer-a']),
  {includes:()=>true},
  {0:'viewer-a',length:1},
  {includes:'viewer-a'},
 ];
 for(const grant of malformed){
  const result=decideSpectatorAdmission({
   ...valid,approvedViewerIds:grant as readonly string[],
  });
  assert.deepEqual(result,{allowed:false,reason:'not_authorized'});
 }
});

test('P10 readiness: an actual explicit grant array still permits only its listed viewer',()=>{
 assert.deepEqual(decideSpectatorAdmission(valid),{
  allowed:true,viewer:'viewer-a',guild:'guild-a',matchId:'match-a',
 });
 assert.deepEqual(decideSpectatorAdmission({...valid,approvedViewerIds:Object.freeze(['viewer-b'])}),{
  allowed:false,reason:'not_authorized',
 });
});
