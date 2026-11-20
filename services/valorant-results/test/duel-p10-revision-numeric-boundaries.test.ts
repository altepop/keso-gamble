import assert from 'node:assert/strict';
import test from 'node:test';
import {compareSpectatorRevision} from '../src/duel-spectator-admission.ts';
import {spectatorPublicSnapshot,type SpectatorSource} from '../src/duel-spectator-public.ts';

const source:SpectatorSource={id:'match-1',guild:'guild-1',game:'poker',status:'active',user_a:'a',user_b:'b',turn_user:'a',winner:null,version:0,updated_at:0,board:'{}'};

test('P10 readiness: revision zero and safe-integer maximum obey equality contract',()=>{
 for(const version of [0,1,Number.MAX_SAFE_INTEGER]){
  const snapshot=spectatorPublicSnapshot({...source,version});
  assert.deepEqual(compareSpectatorRevision(snapshot,version),{kind:'no_change',version});
  assert.deepEqual(compareSpectatorRevision(snapshot,null),{kind:'snapshot',snapshot});
  if(version>0)assert.deepEqual(compareSpectatorRevision(snapshot,version-1),{kind:'snapshot',snapshot});
 }
});

test('P10 readiness: invalid seen revision fails closed even if current snapshot is valid',()=>{
 const snapshot=spectatorPublicSnapshot({...source,version:10});
 for(const seenVersion of [-1,NaN,Infinity,-Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>compareSpectatorRevision(snapshot,seenVersion),/invalid seen version/);
 }
});

test('P10 readiness: invalid snapshot revision cannot trigger no-change response',()=>{
 const snapshot=spectatorPublicSnapshot(source);
 for(const version of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>compareSpectatorRevision({...snapshot,version},null),/invalid snapshot version/);
 }
});
