import assert from 'node:assert/strict';
import test from 'node:test';
import {compareSpectatorRevision} from '../src/duel-spectator-admission.ts';
import {spectatorTextCue} from '../src/duel-spectator-cues.ts';
import {prepareSpectatorAudioCue,type CuePermission} from '../src/duel-spectator-audio-gate.ts';
import type {SpectatorSnapshot} from '../src/duel-spectator-public.ts';
const base:SpectatorSnapshot={id:'match-1',game:'othello',status:'pending',participants:['a','b'],turn:null,winner:null,version:2,updatedAt:100,publicState:{board:'........'}};
test('P10 regression: invalid and stale revision inputs must not create spurious voice cues',()=>{
 for(const invalid of [-1,1.5,Number.NaN,Number.POSITIVE_INFINITY,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>compareSpectatorRevision(base,invalid),/invalid seen version/);
 }
 assert.deepEqual(compareSpectatorRevision(base,2),{kind:'no_change',version:2});
 assert.equal(spectatorTextCue(base,{...base,version:2,status:'active'}),null);
 assert.equal(spectatorTextCue(base,{...base,version:1,status:'active'}),null);
 assert.equal(spectatorTextCue(base,{...base,id:'another-match',version:3,status:'active'}),null);
});
test('P10 regression: cue emission only on confirmed state transitions and requires explicit opt-in',()=>{
 const started:SpectatorSnapshot={...base,status:'active',turn:'a',version:3};
 const repeat:SpectatorSnapshot={...started,version:4};
 const turned:SpectatorSnapshot={...repeat,turn:'b',version:5};
 const finished:SpectatorSnapshot={...turned,status:'finished',version:6,winner:'a'};
 assert.equal(spectatorTextCue(base,started)?.kind,'started');
 assert.equal(spectatorTextCue(started,repeat),null);
 assert.equal(spectatorTextCue(repeat,turned)?.kind,'turn');
 const cue=spectatorTextCue(turned,finished);
 assert.equal(cue?.kind,'finished');
 const noApproval:CuePermission={publicationApproved:false,audioPolicyApproved:false,viewerOptedIn:false,channelOptedIn:false,muted:true,reducedMotion:true};
 assert.deepEqual(prepareSpectatorAudioCue(cue,noApproval),{ok:false,reason:'publication_unapproved'});
});
