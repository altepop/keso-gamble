import assert from 'node:assert/strict';
import test from 'node:test';
import {compareSpectatorRevision} from '../src/duel-spectator-admission.ts';
import type {SpectatorSnapshot} from '../src/duel-spectator-public.ts';
const base:SpectatorSnapshot={id:'match-1',game:'othello',status:'active',participants:['a','b'],turn:'a',winner:null,version:5,updatedAt:100,publicState:{board:'........'}};
test('P10 readiness: revision comparison has an explicit monotonic snapshot/no-change matrix',()=>{
 for(const seenVersion of [null,0,4,5,6,Number.MAX_SAFE_INTEGER]){
  const result=compareSpectatorRevision(base,seenVersion);
  if(seenVersion!==null&&seenVersion>=5)assert.deepEqual(result,{kind:'no_change',version:seenVersion});
  else assert.deepEqual(result,{kind:'snapshot',snapshot:base});
 }
});
test('P10 readiness: invalid seen and snapshot revisions fail closed',()=>{
 for(const version of [-1,1.5,NaN,-Infinity,Infinity,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>compareSpectatorRevision(base,version),/invalid seen version/);
  assert.throws(()=>compareSpectatorRevision({...base,version},null),/invalid snapshot version/);
 }
});
test('P10 readiness: no-change contains no private or public snapshot payload',()=>{
 const result=compareSpectatorRevision({...base,publicState:{board:'SECRET_TEST_SENTINEL'}},5);
 assert.deepEqual(Object.keys(result),['kind','version']);
 assert.doesNotMatch(JSON.stringify(result),/SECRET_TEST_SENTINEL/);
});
