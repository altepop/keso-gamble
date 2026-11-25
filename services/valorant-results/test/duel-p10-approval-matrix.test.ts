import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareSpectatorAudioCue,type CuePermission} from '../src/duel-spectator-audio-gate.ts';
import {decideSpectatorAdmission} from '../src/duel-spectator-admission.ts';
import {mayPublishTournament} from '../src/duel-tournament-draft.ts';
const cue={kind:'started' as const,matchId:'match-42',version:4,text:'UNTRUSTED_PRIVATE_TEXT'};
test('P10 verification: audio permission truth table all 64 flag combinations',()=>{
 const keys=['publicationApproved','audioPolicyApproved','viewerOptedIn','channelOptedIn','muted','reducedMotion'] as const;
 for(let mask=0;mask<64;mask++){
  const perm=Object.fromEntries(keys.map((key,index)=>[key,Boolean(mask&(1<<index))])) as CuePermission;
  const result=prepareSpectatorAudioCue(cue,perm);
  const expected=perm.publicationApproved&&perm.audioPolicyApproved&&perm.viewerOptedIn&&perm.channelOptedIn&&!perm.muted&&!perm.reducedMotion;
  assert.equal(result.ok,expected,'mask '+mask);
  assert.doesNotMatch(JSON.stringify(result),/UNTRUSTED_PRIVATE_TEXT/);
 }
});
test('P10 verification: wrong guild and absent grant never authorize a viewer',()=>{
 for(const viewerGuild of [null,'other','guild']){
  for(const approvedViewerIds of [[],['other'],['viewer']]){
   const result=decideSpectatorAdmission({viewer:'viewer',viewerGuild,matchGuild:'guild',matchId:'match-42',approvedViewerIds});
   assert.equal(result.allowed,viewerGuild==='guild'&&approvedViewerIds.includes('viewer'));
  }
 }
});
test('P10 verification: tournament publication needs both explicitly approved gates',()=>{
 for(const format of [false,true])for(const operator of [false,true]){
  assert.equal(mayPublishTournament(format,operator),format&&operator);
 }
});
