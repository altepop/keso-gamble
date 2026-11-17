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

test('all-death followups include mid-round deaths, not just opening deaths; no opportunity claim',()=>{
 const row=fixture(),players=JSON.parse(row.players_json);players[0].d=1;players[1].k=1;players[7].k=1;players[7].d=1;
 const kills=[{r:0,t:1000,killer:'private-self',victim:'other4'},{r:0,t:2000,killer:'private-self',victim:'other5'},{r:0,t:3000,killer:'other6',victim:'private-self'},{r:0,t:6000,killer:'other0',victim:'other6'}];
 const r=coachRoundContribution([{...row,players_json:JSON.stringify(players),kills_json:JSON.stringify(kills)}],accounts);
 assert.equal(r.combatFollowup.enemyKills,2);assert.equal(r.combatFollowup.totalDeaths,1);assert.equal(r.combatFollowup.enemyKnownKillerDeaths,1);assert.equal(r.combatFollowup.teammateRetaliations5s,1);assert.equal(r.combatFollowup.diedAfterKill5s,2);
});
test('own response kills use exact five-second boundary and exclude simultaneous unknown ordering',()=>{
 const row=fixture(),players=JSON.parse(row.players_json);players[1].d=1;players[5].k=1;
 const run=(at:number)=>coachRoundContribution([{...row,players_json:JSON.stringify(players),kills_json:JSON.stringify([{r:0,t:1000,killer:'other4',victim:'other0'},{r:0,t:at,killer:'private-self',victim:'other4'},{r:0,t:10000,killer:'private-self',victim:'other5'}])}],accounts).combatFollowup;
 assert.equal(run(6000).tradeKills5s,1);assert.equal(run(6001).tradeKills5s,0);assert.equal(run(1000).tradeKills5s,0);
});

test('event acquisition timestamps are independent of roster timestamps and never filled with zero',()=>{
 const r=coachRoundContribution([{...fixture(),events_recorded_at:1700000000000}],accounts);
 assert.deepEqual(r.quality.recordedAt,{oldest:1700000000000,newest:1700000000000});assert.equal(r.quality.missingTimestamps,0);
 assert.equal(coachRoundContribution([fixture()],accounts).quality.recordedAt,null);
});
