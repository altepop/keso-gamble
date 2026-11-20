import assert from 'node:assert/strict';
import test from 'node:test';
import {spectatorTextCue} from '../src/duel-spectator-cues.ts';
import type {SpectatorSnapshot} from '../src/duel-spectator-public.ts';

const prior:SpectatorSnapshot={
 id:'match-1',game:'othello',status:'pending',participants:['a','b'],
 turn:'a',winner:null,version:1,updatedAt:20,publicState:null,
};
const started:SpectatorSnapshot={...prior,status:'active',version:2};
const active:SpectatorSnapshot={...prior,status:'active',version:1};
const nextTurn:SpectatorSnapshot={...active,version:2,turn:'b'};
const finished:SpectatorSnapshot={...active,status:'finished',version:2,winner:'a'};

test('P10 readiness: malformed previous version cannot trigger any transition cue',()=>{
 const invalid=[-1,NaN,Infinity,-Infinity,1.5,Number.MAX_SAFE_INTEGER+1];
 for(const version of invalid){
  assert.equal(spectatorTextCue({...prior,version},started),null);
  assert.equal(spectatorTextCue({...active,version},nextTurn),null);
  assert.equal(spectatorTextCue({...active,version},finished),null);
 }
});

test('P10 readiness: valid previous versions still produce legitimate transition cues',()=>{
 assert.equal(spectatorTextCue(prior,started)?.kind,'started');
 assert.equal(spectatorTextCue(active,nextTurn)?.kind,'turn');
 assert.equal(spectatorTextCue(active,finished)?.kind,'finished');
 assert.equal(spectatorTextCue(prior,{...started,version:1}),null);
});
