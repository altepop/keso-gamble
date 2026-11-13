import test from 'node:test';
import assert from 'node:assert/strict';
import { BOXES, CLASSES, PRIZES, RETIRE_RACES, prizeFor, ownedPrizeFor, OWNED_PRIZE_MULTIPLIERS } from '../js/racing.js';

test('high-grade owner prizes let exceptional horses earn more than their purchase price',()=>{
 assert.deepEqual(OWNED_PRIZE_MULTIPLIERS,[1,1,1,2,3.5]);
 assert.deepEqual([0,1,2,3].map(rank=>ownedPrizeFor({raceClass:3},rank)),[60000,24000,12000,0]);
 assert.deepEqual([0,1,2,3].map(rank=>ownedPrizeFor({raceClass:4},rank)),[350000,140000,70000,0]);
 assert.deepEqual([0,1,2,3].map(rank=>prizeFor({raceClass:4},rank)),[100000,40000,20000,0],
  'free namesake horses keep their existing base awards');
 const apex=BOXES.find(b=>b.id==='apex'),legend=BOXES.find(b=>b.id==='legend');
 assert.ok(20*ownedPrizeFor({raceClass:4},0)>apex.price);
 assert.ok(20*ownedPrizeFor({raceClass:3},0)>legend.price);
});

test('every paid higher-tier box has ~90% neutral 20-run 8-horse prize return, not guaranteed profit',()=>{
 const expectedForGrade=(grade,size)=>RETIRE_RACES*PRIZES.reduce((sum,prize,rank)=>sum+ownedPrizeFor({raceClass:grade},rank),0)/size;
 const ev=(box,size)=>box.odds.reduce((sum,odds,grade)=>sum+odds/100*expectedForGrade(grade,size),0);
 const expectedPrices={normal:3000,silver:15000,gold:60000,platinum:200000,legend:650000,apex:1500000};
 for(const box of BOXES)assert.equal(box.price,expectedPrices[box.id]);
 for(const id of ['gold','platinum','legend','apex']){
  const box=BOXES.find(b=>b.id===id),gross=ev(box,8);
  assert.ok(gross>=box.price*.85&&gross<=box.price*.96,
   `${id}: expected gross ${gross} must remain a moderate loss vs ${box.price}, before sellbacks`);
  assert.ok(ev(box,10)<gross,'10-horse fields make profitable runs harder');
 }
 assert.equal(ev(BOXES.find(b=>b.id==='platinum'),8),180000);
 assert.equal(ev(BOXES.find(b=>b.id==='legend'),8),588000);
 assert.equal(ev(BOXES.find(b=>b.id==='apex'),8),1400000);
 assert.equal(CLASSES[4].mult,100,'do not mint higher free race prizes');
});
