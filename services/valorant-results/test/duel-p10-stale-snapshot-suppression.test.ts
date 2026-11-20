import assert from 'node:assert/strict';
import test from 'node:test';
import {compareSpectatorRevision} from '../src/duel-spectator-admission.ts';
import type {SpectatorSnapshot} from '../src/duel-spectator-public.ts';

const base:SpectatorSnapshot={
 id:'match-1',game:'poker',status:'active',participants:['a','b'],turn:'a',
 winner:null,version:3,updatedAt:100,publicState:{private:'STALE_SECRET_SENTINEL'},
};
test('P10 readiness: stale snapshots never roll back a newer viewer revision or carry source state',()=>{
 for(const seenVersion of [4,7,Number.MAX_SAFE_INTEGER]){
  const result=compareSpectatorRevision(base,seenVersion);
  assert.deepEqual(result,{kind:'no_change',version:seenVersion});
  assert.doesNotMatch(JSON.stringify(result),/STALE_SECRET_SENTINEL/);
 }
});
test('P10 readiness: fresh snapshot still propagates without mutating the source',()=>{
 const fresh={...base,version:4,publicState:{board:'safe-state'}};
 const frozen=Object.freeze(fresh);
 assert.deepEqual(compareSpectatorRevision(frozen,3),{kind:'snapshot',snapshot:frozen});
 assert.deepEqual(compareSpectatorRevision(frozen,null),{kind:'snapshot',snapshot:frozen});
 assert.equal(frozen.version,4);
});
