import assert from 'node:assert/strict';
import test from 'node:test';
import {spectatorTextCue} from '../src/duel-spectator-cues.ts';
import type {SpectatorSnapshot} from '../src/duel-spectator-public.ts';
const base:SpectatorSnapshot={id:'match',game:'othello',status:'pending',participants:['a','b'],turn:null,winner:null,version:1,updatedAt:1,publicState:null};
test('P10.3 text-only cues do not duplicate versions or reveal secrets',()=>{
 const started:SpectatorSnapshot={...base,status:'active',turn:'a',version:2};
 const turn:SpectatorSnapshot={...started,turn:'b',version:3};
 const finished:SpectatorSnapshot={...turn,status:'finished',winner:'a',version:4};
 assert.equal(spectatorTextCue(base,started)?.kind,'started');
 assert.equal(spectatorTextCue(started,turn)?.kind,'turn');
 assert.equal(spectatorTextCue(turn,finished)?.kind,'finished');
 assert.equal(spectatorTextCue(started,started),null);
 assert.equal(spectatorTextCue(finished,started),null);
 assert.doesNotMatch(JSON.stringify(spectatorTextCue(turn,finished)),/private|audio|token/i);
});
