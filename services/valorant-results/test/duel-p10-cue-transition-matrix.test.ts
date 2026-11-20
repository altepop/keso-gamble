import assert from 'node:assert/strict';
import test from 'node:test';
import {spectatorTextCue} from '../src/duel-spectator-cues.ts';
import type {SpectatorSnapshot,SpectatorStatus} from '../src/duel-spectator-public.ts';
const base:SpectatorSnapshot={id:'match-1',game:'othello',status:'pending',participants:['a','b'],turn:null,winner:null,version:1,updatedAt:100,publicState:{board:'........'}};
test('P10 transition matrix: only confirmed start, turn and finish produce text cues',()=>{
 const statuses:SpectatorStatus[]=['pending','active','finished','cancelled'];
 for(const before of statuses)for(const after of statuses){
  const previous={...base,status:before,turn:'a'};
  const current={...base,status:after,version:2,turn:'a'};
  const result=spectatorTextCue(previous,current);
  const expected=after==='finished'&&before!=='finished'?'finished':after==='active'&&before==='pending'?'started':null;
  assert.equal(result?.kind??null,expected,before+' to '+after);
 }
});
test('P10 transition matrix: duplicate, stale and cross-match events remain silent',()=>{
 const start={...base,status:'active' as const,turn:'a',version:2};
 assert.equal(spectatorTextCue(start,{...start,version:2,turn:'b'}),null);
 assert.equal(spectatorTextCue(start,{...start,version:1,turn:'b'}),null);
 assert.equal(spectatorTextCue(start,{...start,id:'another-match',version:3,turn:'b'}),null);
 assert.equal(spectatorTextCue(start,{...start,version:3,turn:'b'})?.kind,'turn');
 assert.equal(spectatorTextCue(start,{...start,version:3,turn:'a'}),null);
});
