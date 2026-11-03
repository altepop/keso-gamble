import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState} from '../js/engine.js';
import {BET_TYPES,MAX_RACE_BET,WEEKLY_LIMIT,openRaceStart,raceCard,raceOdds,raceResult,trifectaOdds,placeRaceBet,settleRaceBets,betWins,payoutFor} from '../js/racing.js';

const now=Date.parse('2026-11-04T21:05:30+09:00'),raceId=openRaceStart(now);
test('3連単: all three places are ordered, odds derive from race scenarios not product of singles',()=>{
 const card=raceCard(raceId);
 const picks=[1,2,3];
 const odd=trifectaOdds(card,picks);
 assert.ok(Number.isInteger(odd)&&odd>=10&&odd<=100000);
 assert.notEqual(odd,raceOdds(card).win[1]*raceOdds(card).win[2]*raceOdds(card).win[3]);
 assert.equal(trifectaOdds(card,[1,1,3]),null);
 assert.equal(trifectaOdds(card,[1,2,card.size+1]),null);
 assert.equal(BET_TYPES.trifecta.formal,'3連単');
});
test('3連単: stake is committed once and pays only on exact first-three order',()=>{
 const card=raceCard(raceId),actual=raceResult(card),picks=actual.order.slice(0,3);
 const state={...createInitialState(now),cash:500000};
 const ticket=placeRaceBet(state,{raceId,type:'trifecta',horse:picks,amount:MAX_RACE_BET},now);
 assert.equal(state.cash,400000);assert.deepEqual(ticket.horse,picks);
 assert.equal(betWins('trifecta',picks,actual,card.size),true);
 assert.equal(betWins('trifecta',[picks[1],picks[0],picks[2]],actual,card.size),false);
 assert.deepEqual(settleRaceBets(state,raceId+50000-1),[]);
 const settled=settleRaceBets(state,raceId+50000);
 assert.equal(settled.length,1);
 assert.equal(state.cash,400000+payoutFor(MAX_RACE_BET,ticket.odds));
 assert.deepEqual(settleRaceBets(state,raceId+50000+1),[]);
});
test('3連単: invalid, identical and oversized selections never spend KP',()=>{
 for(const horse of [[1,1,2],[1,2],[1,2,11],[0,1,3],['1',2,3]]) {
  const s={...createInitialState(now),cash:200000};
  assert.throws(()=>placeRaceBet(s,{raceId,type:'trifecta',horse,amount:100},now));
  assert.equal(s.cash,200000);
 }
 const s={...createInitialState(now),cash:500000};
 assert.throws(()=>placeRaceBet(s,{raceId,type:'trifecta',horse:[1,2,3],amount:100100},now),/100,000/);
 assert.equal(s.cash,500000);
 assert.equal(WEEKLY_LIMIT,400000);
});
