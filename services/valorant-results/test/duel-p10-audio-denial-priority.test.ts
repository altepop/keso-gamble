import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareSpectatorAudioCue,type CuePermission} from '../src/duel-spectator-audio-gate.ts';
const cue={kind:'turn' as const,matchId:'match-1',version:2,text:'PRIVATE_SOURCE_TEXT'};
const enabled:CuePermission={publicationApproved:true,audioPolicyApproved:true,viewerOptedIn:true,channelOptedIn:true,muted:false,reducedMotion:false};
test('P10 readiness: audio policy denials follow fail-closed precedence',()=>{
 const cases=[
  [{...enabled,publicationApproved:false},'publication_unapproved'],
  [{...enabled,audioPolicyApproved:false},'audio_unapproved'],
  [{...enabled,viewerOptedIn:false},'not_opted_in'],
  [{...enabled,channelOptedIn:false},'not_opted_in'],
  [{...enabled,muted:true},'muted'],
  [{...enabled,reducedMotion:true},'muted'],
  [{...enabled,publicationApproved:false,audioPolicyApproved:false,muted:true},'publication_unapproved'],
 ] as const;
 for(const [permission,reason] of cases){
  assert.deepEqual(prepareSpectatorAudioCue(cue,permission),{ok:false,reason});
 }
});
test('P10 readiness: valid inactive mock cue produces only fixed caption, never raw source text',()=>{
 const result=prepareSpectatorAudioCue(cue,enabled);
 assert.deepEqual(result,{ok:true,event:{kind:'turn',matchId:'match-1',version:2,caption:'手番が切り替わりました'}});
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_SOURCE_TEXT/);
});
test('P10 readiness: no approval path accepts null cue or malformed version',()=>{
 assert.deepEqual(prepareSpectatorAudioCue(null,enabled),{ok:false,reason:'invalid_cue'});
 for(const version of [-1,NaN,Infinity,1.5]){
  assert.deepEqual(prepareSpectatorAudioCue({...cue,version},enabled),{ok:false,reason:'invalid_cue'});
 }
});
