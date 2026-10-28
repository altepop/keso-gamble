import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mlOpen, mlCard, mlOdds, mlPartner, placeMlBet, settleMlBets, hydrateMleague, ML_PRIOR_GAMES } from '../js/mleague.js';
import { hydrateRacing, WEEKLY_LIMIT } from '../js/racing.js';

const data=JSON.parse(readFileSync(new URL('../services/valorant-results/mleague-2026-27.json',import.meta.url),'utf8'));
const jst=text=>Date.parse(text+'+09:00');
const game1=data.fixtures.find(f=>f.date==='2026-10-27'&&f.table===1&&f.game===1),game2=mlPartner(data,game1);
const state=(cash=100000)=>({cash,...hydrateRacing({}),...hydrateMleague({})});

test('the data covers ten teams of four, and every fixture seats four known teams', () => {
 assert.equal(data.teams.length,10);assert.ok(data.teams.every(t=>t.players.length===4));
 assert.equal(data.fixtures.length,300);
 assert.ok(data.fixtures.every(f=>f.teams.length===4&&f.teams.every(id=>data.teams.some(t=>t.id===id))));
 assert.equal(mlCard(data,game1).length,16);
});

test('game 1 closes at 19:00; game 2 at the first result or 21:00, whichever is first', () => {
 const none=new Map();
 assert.equal(mlOpen(data,game1,jst('2026-10-26T18:59:00'),none),false,'opens 24 hours before');
 assert.equal(mlOpen(data,game1,jst('2026-10-27T18:59:59'),none),true);
 assert.equal(mlOpen(data,game1,jst('2026-10-27T19:00:00'),none),false);
 assert.equal(mlOpen(data,game2,jst('2026-10-27T20:30:00'),none),true,'bet on game 2 while watching game 1');
 assert.equal(mlOpen(data,game2,jst('2026-10-27T20:30:00'),new Map([[game1.id,{names:[]}]])),false,'game 1 is over');
 assert.equal(mlOpen(data,game2,jst('2026-10-27T21:00:00'),none),false,'a late official update cannot keep it open');
});

test('odds come from past tops and lasts, shrunk toward one in four; a rookie is 4.0x', () => {
 assert.deepEqual(mlOdds({name:'新人',games:0,top:0,last:0}),{top:40,last:40});
 const strong={name:'強い人',games:100,top:40,last:15};
 const o=mlOdds(strong);
 assert.equal(o.top,Math.floor(10/((40+ML_PRIOR_GAMES/4)/(100+ML_PRIOR_GAMES))));
 assert.ok(o.top<30&&o.last>50);
 assert.ok(mlOdds(strong,{強い人:{games:10,top:0,last:10}}).last<o.last,'this season counts too');
});

test('a bet is fixed at its odds, shares the weekly limit with racing, and is settled from the official order', () => {
 const s=state(),now=jst('2026-10-27T18:00:00'),card=mlCard(data,game1);
 const top=placeMlBet(s,{match:game1.id,player:1,type:'top',amount:1000},now,data,new Map());
 const last=placeMlBet(s,{match:game1.id,player:card[5].name,type:'last',amount:500},now,data,new Map());
 const benched=placeMlBet(s,{match:game1.id,player:9,type:'top',amount:300},now,data,new Map());
 assert.equal(s.cash,100000-1800);assert.equal(s.raceWeek.spent,1800);
 assert.throws(()=>placeMlBet(s,{match:game1.id,player:17,type:'top',amount:100},now,data,new Map()),/選手を選んで/);
 assert.throws(()=>placeMlBet(s,{match:game1.id,player:1,type:'top',amount:150},now,data,new Map()),/100 KP単位/);
 s.raceWeek.spent=WEEKLY_LIMIT-100;
 assert.throws(()=>placeMlBet(s,{match:game1.id,player:1,type:'top',amount:200},now,data,new Map()),/競馬と合算/);
 const order=[card[0].name,card[4].name,card[12].name,card[5].name];
 const settled=settleMlBets(s,new Map([[game1.id,{names:order}]]));
 assert.equal(settled.length,3);
 assert.deepEqual([top.status,last.status,benched.status],['won','won','refunded']);
 assert.equal(top.payout,Math.floor(1000*top.odds/10));assert.equal(benched.payout,300);
 assert.equal(s.cash,100000-1800+top.payout+last.payout+300);
 assert.equal(settleMlBets(s,new Map([[game1.id,{names:order}]])).length,0,'settled once');
});

test('saved bets survive a reload and junk is dropped', () => {
 const s=state();placeMlBet(s,{match:game1.id,player:2,type:'last',amount:100},jst('2026-10-27T12:00:00'),data,new Map());
 const again=hydrateMleague(JSON.parse(JSON.stringify({mlBets:[...s.mlBets,{id:'x',match:'y',player:'z',type:'win',amount:1,odds:0,status:'?',payout:0,time:0}]})));
 assert.deepEqual(again.mlBets,s.mlBets);
});
