import assert from 'node:assert/strict';
import test from 'node:test';
import {decideSpectatorAdmission,compareSpectatorRevision} from '../src/duel-spectator-admission.ts';
import {spectatorPublicSnapshot,type SpectatorSource} from '../src/duel-spectator-public.ts';
const base={viewer:'viewer',viewerGuild:'guild',matchGuild:'guild',matchId:'match',approvedViewerIds:['viewer']};
test('P10.2 admission denies by default and blocks cross-guild viewing',()=>{
 assert.deepEqual(decideSpectatorAdmission({...base,approvedViewerIds:[]}),{allowed:false,reason:'not_authorized'});
 assert.deepEqual(decideSpectatorAdmission({...base,viewer:null}),{allowed:false,reason:'unauthenticated'});
 assert.deepEqual(decideSpectatorAdmission({...base,viewerGuild:'other'}),{allowed:false,reason:'guild_mismatch'});
 assert.equal(decideSpectatorAdmission(base).allowed,true);
});
test('P10.2 explicit server revision supports no-change and full refresh without mode choice',()=>{
 const source:SpectatorSource={id:'match',guild:'guild',game:'othello',status:'active',user_a:'a',user_b:'b',turn_user:'a',winner:null,version:8,updated_at:123,board:'........'};
 const snapshot=spectatorPublicSnapshot(source);
 assert.deepEqual(compareSpectatorRevision(snapshot,8),{kind:'no_change',version:8});
 assert.deepEqual(compareSpectatorRevision(snapshot,7),{kind:'snapshot',snapshot});
 assert.throws(()=>compareSpectatorRevision(snapshot,-1),/invalid/);
});
