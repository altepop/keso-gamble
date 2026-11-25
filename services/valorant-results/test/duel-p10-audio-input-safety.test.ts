import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareSpectatorAudioCue,type CuePermission} from '../src/duel-spectator-audio-gate.ts';
import type {SpectatorCue} from '../src/duel-spectator-cues.ts';

const approved:CuePermission={publicationApproved:true,audioPolicyApproved:true,viewerOptedIn:true,channelOptedIn:true,muted:false,reducedMotion:false};
const base:SpectatorCue={kind:'started',matchId:'match-1',version:1,text:'UNTRUSTED_SECRET'};
test('P10 readiness: malformed audio cue identifiers and versions fail closed without leaking text',()=>{
 const ids=['',' ','a/b','x'.repeat(129),'日本語','abc\nxyz'];
 for(const matchId of ids){
  const result=prepareSpectatorAudioCue({...base,matchId},approved);
  assert.deepEqual(result,{ok:false,reason:'invalid_cue'});
  assert.doesNotMatch(JSON.stringify(result),/UNTRUSTED_SECRET/);
 }
 for(const version of [-1,0.5,Number.NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
  const result=prepareSpectatorAudioCue({...base,version},approved);
  assert.deepEqual(result,{ok:false,reason:'invalid_cue'});
 }
 assert.deepEqual(prepareSpectatorAudioCue(null,approved),{ok:false,reason:'invalid_cue'});
});
test('P10 readiness: accepted captions are fixed Japanese constants and never reuse untrusted cue text',()=>{
 for(const [kind,caption] of [['started','対戦が始まりました'],['turn','手番が切り替わりました'],['finished','対戦が終了しました']] as const){
  const result=prepareSpectatorAudioCue({...base,kind},approved);
  assert.deepEqual(result,{ok:true,event:{kind,matchId:'match-1',version:1,caption}});
  assert.doesNotMatch(JSON.stringify(result),/UNTRUSTED_SECRET/);
 }
});
test('P10 readiness: opt-out always blocks every valid cue, without activating real audio',()=>{
 const mutedPerms=[{...approved,viewerOptedIn:false},{...approved,channelOptedIn:false},{...approved,muted:true},{...approved,reducedMotion:true}];
 for(const permission of mutedPerms){
  assert.equal(prepareSpectatorAudioCue(base,permission).ok,false);
 }
});
