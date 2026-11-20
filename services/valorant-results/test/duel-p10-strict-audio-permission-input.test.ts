import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareSpectatorAudioCue,type CuePermission} from '../src/duel-spectator-audio-gate.ts';

const cue={kind:'started' as const,matchId:'match-1',version:1,text:'PRIVATE_NEVER_REUSE'};
const approved:CuePermission={
 publicationApproved:true,audioPolicyApproved:true,
 viewerOptedIn:true,channelOptedIn:true,muted:false,reducedMotion:false,
};

test('P10 safety: malformed approval and opt-in values never grant a future audio cue',()=>{
 const gates=[
  ['publicationApproved','publication_unapproved'],
  ['audioPolicyApproved','audio_unapproved'],
  ['viewerOptedIn','not_opted_in'],
  ['channelOptedIn','not_opted_in'],
 ] as const;
 for(const [key,reason] of gates){
  for(const value of [undefined,null,'true','false',0,1,{},[]]){
   const permission={...approved,[key]:value} as CuePermission;
   const result=prepareSpectatorAudioCue(cue,permission);
   assert.deepEqual(result,{ok:false,reason},`${key}: ${String(value)}`);
   assert.doesNotMatch(JSON.stringify(result),/PRIVATE_NEVER_REUSE/);
  }
 }
 assert.deepEqual(
  prepareSpectatorAudioCue(cue,null as unknown as CuePermission),
  {ok:false,reason:'publication_unapproved'},
 );
});

test('P10 safety: missing or string-valued mute settings fail closed',()=>{
 for(const key of ['muted','reducedMotion'] as const){
  for(const value of [undefined,null,'true','false',0,1,{},[]]){
   const result=prepareSpectatorAudioCue(cue,{...approved,[key]:value} as CuePermission);
   assert.deepEqual(result,{ok:false,reason:'muted'},`${key}: ${String(value)}`);
  }
 }
});

test('P10 safety: fully explicit booleans retain existing denial and caption contracts',()=>{
 assert.deepEqual(prepareSpectatorAudioCue(cue,approved),{
  ok:true,event:{kind:'started',matchId:'match-1',version:1,caption:'対戦が始まりました'},
 });
 assert.deepEqual(prepareSpectatorAudioCue(cue,{...approved,publicationApproved:false}),{ok:false,reason:'publication_unapproved'});
 assert.deepEqual(prepareSpectatorAudioCue(cue,{...approved,muted:true}),{ok:false,reason:'muted'});
});
