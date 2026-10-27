import test from 'node:test';
import assert from 'node:assert/strict';
import {wheelOrder,outcomeAngle,wheelView,covered} from '../js/roulette-view.js';
test('wheel has each European pocket once and stops its winning pocket beneath the top pointer',()=>{
 assert.equal(new Set(wheelOrder).size,37);
 for(let n=0;n<37;n++){
  assert.ok(wheelView('number',n).includes(`data-pocket="${n}"`));
  assert.ok(Math.abs((wheelOrder.indexOf(n)*360/37+outcomeAngle(n))%360)<1e-9);
 }
 assert.equal(wheelOrder[0],0);
});
test('every selected area highlights exactly the numbers that receive a payout',()=>{
 for(const [type,count] of [['red',18],['black',18],['even',18],['odd',18],['number',1],['low',18],['high',18],['dozen2',12],['column3',12]]){
  assert.equal(wheelOrder.filter(n=>covered(type,0,n)).length,count);
  assert.equal((wheelView(type,0).match(/class="wheel-pocket selected"/g)||[]).length,count);
 }
});
