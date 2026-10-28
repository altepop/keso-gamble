import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mlOpen, mlCard, mlOdds, mlRate, mlLineup, mlPartner, placeMlBet, settleMlBets, hydrateMleague, ML_PRIOR_GAMES } from '../js/mleague.js';
import { hydrateRacing, WEEKLY_LIMIT } from '../js/racing.js';

const data=JSON.parse(readFileSync(new URL('../services/valorant-results/mleague-2026-27.json',import.meta.url),'utf8'));
const jst=text=>Date.parse(text+'+09:00');
const game1=data.fixtures.find(f=>f.date==='2026-10-27'&&f.table===1&&f.game===1),game2=mlPartner(data,game1);
const state=(cash=100000)=>({cash,...hydrateRacing({}),...hydrateMleague({})});
const card=mlCard(data,game1);
// One player from each team: candidates 1, 5, 9 and 13.
const seated=[card[0],card[4],card[8],card[12]],names=seated.map(p=>p.name);

test('the data covers ten teams of four, and every fixture seats four known teams', () => {
 assert.equal(data.teams.length,10);assert.ok(data.teams.every(t=>t.players.length===4));
 assert.equal(data.fixtures.length,300);
 assert.ok(data.fixtures.every(f=>f.teams.length===4&&f.teams.every(id=>data.teams.some(t=>t.id===id))));
 assert.equal(card.length,16);
});

test('game 1 closes at 19:00; game 2 when game 1\'s result is in, or at midnight', () => {
 const none=new Map();
 assert.equal(mlOpen(data,game1,jst('2026-10-26T23:59:00'),none),false,'only on the match day');
 assert.equal(mlOpen(data,game1,jst('2026-10-27T18:59:59'),none),true);
 assert.equal(mlOpen(data,game1,jst('2026-10-27T19:00:00'),none),false);
 assert.equal(mlOpen(data,game2,jst('2026-10-27T20:30:00'),none),true,'bet on game 2 while watching game 1');
 assert.equal(mlOpen(data,game2,jst('2026-10-27T20:30:00'),new Map([[game1.id,{names:[]}]])),false,'game 1 is over');
 assert.equal(mlOpen(data,game2,jst('2026-10-27T22:30:00'),none),true,'no fixed cutoff while game 1 runs long');
 assert.equal(mlOpen(data,game2,jst('2026-10-28T00:00:00'),none),false,'a result that never arrives cannot keep it open overnight');
});

test('a lineup is four registered players, one per team', () => {
 assert.deepEqual(mlLineup(data,game1,names).map(p=>p.no),[1,5,9,13]);
 assert.equal(mlLineup(data,game1,[card[0].name,card[1].name,card[8].name,card[12].name]),null,'two from one team');
 assert.equal(mlLineup(data,game1,names.slice(0,3)),null);
 assert.equal(mlLineup(data,game1,[...names.slice(0,3),'知らない人']),null);
 assert.equal(mlLineup(data,game1,null),null);
});

test('odds are shared among the four seated: probabilities add up to 100%, rookies count as average', () => {
 const rookie={name:'新人',team:'a',games:0,top:0,last:0};
 assert.equal(mlRate(rookie,'top'),.25);
 const even=mlOdds([rookie,{...rookie,name:'b'},{...rookie,name:'c'},{...rookie,name:'d'}]);
 assert.deepEqual(even.新人,{top:40,last:40});
 const strong={name:'強い人',games:100,top:40,last:15};
 const odds=mlOdds([strong,{...rookie,name:'b'},{...rookie,name:'c'},{...rookie,name:'d'}]);
 const rate=(40+ML_PRIOR_GAMES/4)/(100+ML_PRIOR_GAMES);
 assert.equal(odds.強い人.top,Math.floor(10/(rate/(rate+.75))));
 assert.ok(odds.強い人.top<odds.b.top&&odds.強い人.last>odds.b.last);
 const sum=Object.values(mlOdds(seated)).reduce((n,o)=>n+10/o.top,0);
 assert.ok(sum>=1&&sum<1.1,'no house cut; flooring the tenths only rounds odds down');
 assert.ok(mlOdds([strong,rookie],{強い人:{games:10,top:0,last:10}}).強い人.last<odds.強い人.last,'this season counts too');
});

test('a bet needs the registered four, is fixed at its odds, shares the weekly limit with racing and is settled', () => {
 const s=state(),now=jst('2026-10-27T18:40:00');
 assert.throws(()=>placeMlBet(s,{match:game1.id,player:1,type:'top',amount:1000},now,data,new Map()),/出場選手がまだ登録/);
 const top=placeMlBet(s,{match:game1.id,player:1,type:'top',amount:1000},now,data,new Map(),{},names);
 const last=placeMlBet(s,{match:game1.id,player:card[4].name,type:'last',amount:500},now,data,new Map(),{},names);
 assert.equal(top.odds,mlOdds(seated)[card[0].name].top);
 assert.equal(s.cash,100000-1500);assert.equal(s.raceWeek.spent,1500);
 assert.throws(()=>placeMlBet(s,{match:game1.id,player:2,type:'top',amount:100},now,data,new Map(),{},names),/出場する4人の中から/);
 assert.throws(()=>placeMlBet(s,{match:game1.id,player:1,type:'top',amount:150},now,data,new Map(),{},names),/100 KP単位/);
 s.raceWeek.spent=WEEKLY_LIMIT-100;
 assert.throws(()=>placeMlBet(s,{match:game1.id,player:1,type:'top',amount:200},now,data,new Map(),{},names),/競馬と合算/);
 const order=[card[0].name,card[8].name,card[12].name,card[4].name];
 const settled=settleMlBets(s,new Map([[game1.id,{names:order}]]));
 assert.equal(settled.length,2);
 assert.deepEqual([top.status,last.status],['won','won']);
 assert.equal(s.cash,100000-1500+top.payout+last.payout);
 assert.equal(settleMlBets(s,new Map([[game1.id,{names:order}]])).length,0,'settled once');
 const wrong=placeMlBet(state(),{match:game1.id,player:9,type:'top',amount:300},now,data,new Map(),{},names);
 const s2=state();s2.mlBets=[wrong];
 settleMlBets(s2,new Map([[game1.id,{names:[card[1].name,...order.slice(1)]}]]));
 assert.equal(wrong.status,'lost');
});

test('saved bets survive a reload and junk is dropped', () => {
 const s=state();placeMlBet(s,{match:game1.id,player:5,type:'last',amount:100},jst('2026-10-27T12:00:00'),data,new Map(),{},names);
 const again=hydrateMleague(JSON.parse(JSON.stringify({mlBets:[...s.mlBets,{id:'x',match:'y',player:'z',type:'win',amount:1,odds:0,status:'?',payout:0,time:0}]})));
 assert.deepEqual(again.mlBets,s.mlBets);
});

test('a bet bought at or after the reported start, or on someone who did not sit, is refunded', () => {
 const s=state(),order=[card[0].name,card[4].name,card[8].name,card[12].name];
 const early=placeMlBet(s,{match:game2.id,player:1,type:'top',amount:1000},jst('2026-10-27T21:30:00'),data,new Map(),{},names);
 const late=placeMlBet(s,{match:game2.id,player:1,type:'top',amount:500},jst('2026-10-27T21:45:00'),data,new Map(),{},names);
 const wrongLineup=placeMlBet(s,{match:game2.id,player:13,type:'last',amount:200},jst('2026-10-27T21:30:00'),data,new Map(),{},names);
 settleMlBets(s,new Map([[game2.id,{names:[...order.slice(0,3),card[13].name],closedAt:jst('2026-10-27T21:42:00')}]]));
 assert.deepEqual([early.status,late.status,wrongLineup.status],['won','refunded','refunded']);assert.equal(late.payout,500);
});
