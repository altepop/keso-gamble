import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareSpectatorAudioCue,type CuePermission} from '../src/duel-spectator-audio-gate.ts';
const cue={kind:'finished' as const,matchId:'test-123',version:4,text:'SECRET'};
const permission:CuePermission={publicationApproved:true,audioPolicyApproved:true,viewerOptedIn:true,channelOptedIn:true,muted:false,reducedMotion:false};
test('deny all audio until both approval gates and opt-ins',()=>{
 for(const key of ['publicationApproved','audioPolicyApproved','viewerOptedIn','channelOptedIn'] as const){
   assert.equal(prepareSpectatorAudioCue(cue,{...permission,[key]:false}).ok,false);
 }
 assert.equal(prepareSpectatorAudioCue(cue,{...permission,muted:true}).ok,false);
 assert.equal(prepareSpectatorAudioCue(cue,{...permission,reducedMotion:true}).ok,false);
});
test('authorized output is closed vocabulary and never carries untrusted text',()=>{
 const result=prepareSpectatorAudioCue(cue,permission);
 assert.equal(result.ok,true);
 assert.doesNotMatch(JSON.stringify(result),/SECRET/);
 assert.equal(prepareSpectatorAudioCue({...cue,matchId:'../../secret'},permission).ok,false);
});
