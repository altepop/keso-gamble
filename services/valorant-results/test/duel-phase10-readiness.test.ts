import assert from 'node:assert/strict';
import test from 'node:test';
import {decideSpectatorAdmission,compareSpectatorRevision} from '../src/duel-spectator-admission.ts';
import {spectatorPublicSnapshot,type SpectatorSource} from '../src/duel-spectator-public.ts';
import {spectatorTextCue} from '../src/duel-spectator-cues.ts';
import {prepareSpectatorAudioCue} from '../src/duel-spectator-audio-gate.ts';
import {draftSingleEliminationBracket,mayPublishTournament} from '../src/duel-tournament-draft.ts';
const source:SpectatorSource={id:'duel-42',guild:'guild',game:'othello',status:'active',user_a:'a',user_b:'b',turn_user:'a',winner:null,version:3,updated_at:100,board:'........'};
test('Phase 10 integration: unauthorized cross-guild spectator gets no snapshot',()=>{
 const denied=decideSpectatorAdmission({viewer:'x',viewerGuild:'other',matchGuild:'guild',matchId:'duel-42',approvedViewerIds:['x']});
 assert.deepEqual(denied,{allowed:false,reason:'guild_mismatch'});
 const noGrant=decideSpectatorAdmission({viewer:'x',viewerGuild:'guild',matchGuild:'guild',matchId:'duel-42',approvedViewerIds:[]});
 assert.deepEqual(noGrant,{allowed:false,reason:'not_authorized'});
});
test('Phase 10 integration: revision and voice permission fail closed',()=>{
 const current=spectatorPublicSnapshot(source);
 assert.deepEqual(compareSpectatorRevision(current,3),{kind:'no_change',version:3});
 const end=spectatorPublicSnapshot({...source,status:'finished',version:4,winner:'a'});
 const cue=spectatorTextCue(current,end);
 assert.equal(cue?.kind,'finished');
 const allApproved={publicationApproved:true,audioPolicyApproved:true,viewerOptedIn:true,channelOptedIn:true,muted:false,reducedMotion:false};
 assert.deepEqual(prepareSpectatorAudioCue(cue,{...allApproved,audioPolicyApproved:false}),{ok:false,reason:'audio_unapproved'});
 assert.deepEqual(prepareSpectatorAudioCue(cue,{...allApproved,publicationApproved:false}),{ok:false,reason:'publication_unapproved'});
 assert.equal(JSON.stringify(prepareSpectatorAudioCue(cue,allApproved)).includes('private'),false);
});
test('Phase 10 integration: tournament remains unpublishable without operator approval',()=>{
 const three=draftSingleEliminationBracket(['a','b','c'],8);
 assert.equal(three.byes,1);
 assert.deepEqual(three.pairs,[{round:1,slot:0,playerA:'a',playerB:null},{round:1,slot:1,playerA:'b',playerB:'c'}]);
 const five=draftSingleEliminationBracket(['a','b','c','d','e'],16);
 assert.equal(five.pairs.length,4);
 assert.equal(five.pairs.filter(p=>p.playerB===null).length,3);
 assert.equal(new Set(five.pairs.flatMap(p=>[p.playerA,p.playerB].filter(Boolean))).size,5);
 assert.equal(mayPublishTournament(true,false),false);
 assert.equal(mayPublishTournament(false,true),false);
});
