import test from 'node:test';
import assert from 'node:assert/strict';
import {wheelSectors,targetRotation,escalationWheelModel,BIG_ESC_TIERS,SUPER_ESC_TIERS} from '../js/escalation-roulette.js';
test('visible wheel sectors reflect actual tier odds, including the rare half-percent slice',()=>{
 const big=wheelSectors(BIG_ESC_TIERS),lucky=wheelSectors(SUPER_ESC_TIERS);
 assert.equal(big.length,5);assert.equal(lucky.length,5);
 assert.deepEqual(BIG_ESC_TIERS.map(t=>t.weight),[3500,2800,2000,1300,400]);
 assert.deepEqual(big.map(b=>Number((b.end-b.start).toFixed(3))),[126,100.8,72,46.8,14.4]);
 assert.deepEqual(big.map(b=>b.amount),[500,1000,2500,5000,15000]);
 assert.ok(Math.abs(lucky[4].end-lucky[4].start-1.8)<1e-6);
 for(const sectors of [big,lucky]){
  assert.equal(sectors[0].start,0);assert.equal(sectors.at(-1).end,360);
  for(const sector of sectors){
   const angle=targetRotation(sectors,sector.index,10);
   const result=((sector.center+angle)%360+360)%360;
   assert.ok(result<1e-8||result>360-1e-8);
   assert.ok(angle>0);
  }
 }
});
test('jackpot wheel always finishes on server-selected tier with no random redraw',()=>{
 for(let tier=1;tier<=5;tier++){
  const big=escalationWheelModel({kind:'big',tier,award:BIG_ESC_TIERS[tier-1].amount});
  assert.equal(big.stop,tier);
  const lucky=escalationWheelModel({kind:'super-lucky',tier,award:SUPER_ESC_TIERS[tier-1].amount});
  assert.equal(lucky.stop,tier);
 }
 const half=escalationWheelModel({kind:'super-unlucky',tier:0,award:0,beforeBalance:999,afterBalance:499});
 assert.equal(half.stop,3);assert.equal(half.negative,true);
 assert.throws(()=>escalationWheelModel({kind:'super-lucky',tier:0,award:100000}));
 assert.throws(()=>wheelSectors([{weight:1,amount:1,color:'#000'}]));
});
