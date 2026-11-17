import test from 'node:test';import assert from 'node:assert/strict';import {coachRoundContribution} from '../src/coach-round-contribution.ts';
const accounts=[{name:'Self',tag:'X',puuid:'private-self'}];
const fixture=()=>({match_id:'private-game',players_json:JSON.stringify([{puuid:'private-self',team_id:'Blue',k:2,d:0},...Array.from({length:9},(_,i)=>({puuid:'other'+i,team_id:i<4?'Blue':'Red',k:0,d:i===4||i===5?1:0}))]),teams_json:JSON.stringify([{id:'Blue',rounds:1},{id:'Red',rounds:0}]),rounds_json:JSON.stringify([{r:0,winner:'Blue',attack:'Blue',defense:'Red'}]),kills_json:JSON.stringify([{r:0,t:10,killer:'private-self',victim:'other4'},{r:0,t:20,killer:'private-self',victim:'other5'}])});
test('verified round counts produce multikill distribution and attack rates, without a KAST claim',()=>{
 const r=coachRoundContribution([fixture()],accounts);assert.equal(r.rounds,1);assert.equal(r.multiKillRounds,1);assert.equal(r.multiKillWins,1);assert.equal(r.noDeathRounds,1);assert.equal(r.sides.attack.kills,2);assert.equal(r.killHistogram[2].count,1);assert.equal(JSON.stringify(r).includes('private-self'),false);
});
test('truncated events do not turn missing deaths into survival or no-kill rounds',()=>{
 const row=fixture(),ks=JSON.parse(row.kills_json);ks.pop();const r=coachRoundContribution([{...row,kills_json:JSON.stringify(ks)}],accounts);assert.equal(r.rounds,0);assert.equal(r.quality.excluded['kill-totals-do-not-match-roster'],1);
 assert.equal(coachRoundContribution([fixture(),fixture()],accounts).rounds,1);
});

test('legitimate kill times after ten seconds remain valid',()=>{
 const r=fixture(),kills=JSON.parse(r.kills_json);kills[0].t=40000;kills[1].t=125000;
 assert.equal(coachRoundContribution([{...r,kills_json:JSON.stringify(kills)}],accounts).rounds,1);
});
