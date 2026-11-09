import test from 'node:test';
import assert from 'node:assert/strict';
import {duelLedgerExpectations,checkDuelLedger} from '../js/duel-kp-audit.js';

const match={id:'room-id',guild:'guild',user_a:'a',user_b:'b',stake:10000,status:'finished',winner:'a'};
const rows=m=>duelLedgerExpectations(m).map(x=>({...x,kind:'duel'}));
test('duel winning settlement preserves zero-sum escrow with one payout',()=>{
 const expected=rows(match);
 assert.deepEqual(expected.map(x=>x.delta),[-10000,-10000,20000]);
 assert.equal(expected.reduce((sum,x)=>sum+x.delta,0),0);
 assert.deepEqual(checkDuelLedger(match,expected),{ok:true,problems:[]});
});
test('duel draw restores both stakes exactly once',()=>{
 const draw={...match,winner:'draw'};
 const expected=rows(draw);
 assert.deepEqual(expected.map(x=>x.delta),[-10000,-10000,10000,10000]);
 assert.equal(checkDuelLedger(draw,expected).ok,true);
});
test('audit detects missing, duplicate-side, wrong user, wrong guild and wrong amount payouts',()=>{
 const expected=rows(match);
 assert.equal(checkDuelLedger(match,expected.slice(0,2)).ok,false);
 assert.equal(checkDuelLedger(match,[...expected,{...expected[2],id:'duel:payout:b:room-id'}]).ok,false);
 for(const altered of [{delta:10000},{user:'x'},{guild:'other'},{kind:'other'}]){
  assert.equal(checkDuelLedger(match,[...expected.slice(0,2),{...expected[2],...altered}]).ok,false);
 }
});
test('active duel requires only two debits, never early credit',()=>{
 const active={...match,status:'active',winner:null};
 assert.equal(checkDuelLedger(active,rows(active)).ok,true);
 assert.equal(checkDuelLedger(active,[...rows(active),{...rows(match)[2]}]).ok,false);
});
