import assert from 'node:assert/strict';
import test from 'node:test';
import {decideSpectatorAdmission} from '../src/duel-spectator-admission.ts';

const base={viewer:'viewer-a',viewerGuild:'guild-a',matchGuild:'guild-a',matchId:'match-a'} as const;

test('P10 security: a forged includes() on a genuine array cannot grant access',()=>{
 for(const forged of [()=>true,()=>false]){
  const grants=['another-viewer'];
  Object.defineProperty(grants,'includes',{value:forged});
  assert.deepEqual(decideSpectatorAdmission({...base,approvedViewerIds:grants}),{
   allowed:false,reason:'not_authorized',
  });
 }
});

test('P10 security: overridden includes() cannot deny an explicitly granted viewer',()=>{
 const grants=['viewer-a'];
 Object.defineProperty(grants,'includes',{value:()=>false});
 assert.deepEqual(decideSpectatorAdmission({...base,approvedViewerIds:grants}),{
  allowed:true,viewer:'viewer-a',guild:'guild-a',matchId:'match-a',
 });
});

test('P10 security: a throwing includes getter is never invoked during admission',()=>{
 const grants=['another-viewer'];
 Object.defineProperty(grants,'includes',{get(){throw Error('untrusted includes getter executed');}});
 assert.deepEqual(decideSpectatorAdmission({...base,approvedViewerIds:grants}),{
  allowed:false,reason:'not_authorized',
 });
});
