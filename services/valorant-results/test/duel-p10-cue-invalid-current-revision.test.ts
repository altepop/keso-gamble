import assert from 'node:assert/strict';
import test from 'node:test';
import {spectatorTextCue} from '../src/duel-spectator-cues.ts';
import type {SpectatorSnapshot} from '../src/duel-spectator-public.ts';
const base:SpectatorSnapshot={id:'match-1',game:'othello',status:'pending',participants:['a','b'],turn:null,winner:null,version:0,updatedAt:0,publicState:null};
test('P10 readiness: invalid current revision cannot emit any cue even during state change',()=>{
 for(const version of [-1,0.2,NaN,Infinity,-Infinity,Number.MAX_SAFE_INTEGER+1]){
  const current:SpectatorSnapshot={...base,status:'active',turn:'a',version};
  assert.equal(spectatorTextCue(base,current),null);
 }
});
test('P10 readiness: confirmed transitions use current match ID and version with fixed text',()=>{
 const started:SpectatorSnapshot={...base,status:'active',turn:'a',version:1};
 const changed:SpectatorSnapshot={...started,turn:'b',version:2};
 const finished:SpectatorSnapshot={...changed,status:'finished',winner:'a',version:3};
 assert.deepEqual(spectatorTextCue(base,started),{kind:'started',matchId:'match-1',version:1,text:'対戦が始まりました'});
 assert.deepEqual(spectatorTextCue(started,changed),{kind:'turn',matchId:'match-1',version:2,text:'手番が切り替わりました'});
 assert.deepEqual(spectatorTextCue(changed,finished),{kind:'finished',matchId:'match-1',version:3,text:'対戦が終了しました'});
});
test('P10 readiness: unrelated or unconfirmed statuses never generate unsolicited events',()=>{
 const cancelled:SpectatorSnapshot={...base,status:'cancelled',version:1};
 const pendingAgain:SpectatorSnapshot={...base,version:2};
 assert.equal(spectatorTextCue(base,cancelled),null);
 assert.equal(spectatorTextCue(base,pendingAgain),null);
 assert.equal(spectatorTextCue(null,cancelled),null);
});
