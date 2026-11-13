import test from 'node:test';import assert from 'node:assert/strict';
import {sampleSanmaDecisions} from '../src/mahjong-sanma-sampling.ts';
import {sanmaDiscardMetrics,sanmaShapeFinding} from '../src/mahjong-sanma-efficiency.ts';
import type {ReviewDecision} from '../src/mahjong-review-state.ts';
const row=(seat:number,round:number,turn:number)=>({seat,round,turn});
test('the six-per-seat budget covers multiple rounds and separated turns instead of the first six',()=>{
 const rows=[0,1,2].flatMap(seat=>[0,1,2].flatMap(round=>Array.from({length:10},(_,i)=>row(seat,round,i+1))));
 const result=sampleSanmaDecisions(rows,6);assert.equal(result.length,18);
 for(const seat of [0,1,2]){const own=result.filter(d=>d.seat===seat);assert.equal(own.length,6);assert.deepEqual([...new Set(own.map(d=>d.round))],[0,1,2]);for(const r of [0,1,2])assert.deepEqual(own.filter(d=>d.round===r).map(d=>d.turn),[1,10]);}
 assert.deepEqual(sampleSanmaDecisions(rows,6),result);assert.equal(new Set(result).size,result.length);
});
test('more rounds than slots still cover early, middle and late rounds; small inputs are preserved',()=>{
 const rows=Array.from({length:12},(_,i)=>row(0,i,3));const result=sampleSanmaDecisions(rows,6);
 assert.equal(result.length,6);assert.equal(result[0].round,0);assert.equal(result.at(-1)!.round,11);
 assert.deepEqual(sampleSanmaDecisions(rows.slice(0,3),6),rows.slice(0,3));assert.deepEqual(sampleSanmaDecisions(rows,0),[]);
});
test('an obvious early choice no longer hides a later computed shape improvement',()=>{
 const hand=['1m','9m','1p','2p','3p','4p','6p','8p','2s','3s','4s','E','P','C'];
 const d:ReviewDecision={seat:0,round:0,turn:1,actionIndex:0,actual:'1m',draw:'C',hand,players:3,dealer:0,wind:0,honba:0,sticks:0,scores:[35000,35000,35000],rivers:[[],[],[]],melds:[[],[],[]],north:[0,0,0],riichi:[false,false,false],doubleRiichi:[false,false,false],doras:['S'],visible:Array(34).fill(0),interrupted:false};
 const metrics=sanmaDiscardMetrics(d),early=Array.from({length:6},(_,i)=>({...d,turn:i+1,actual:metrics[0].tile}));
 const later={...d,round:1,turn:4,actual:metrics.at(-1)!.tile};
 assert.ok(early.every(x=>!sanmaShapeFinding(x,'3-hanchan')));
 const selected=sampleSanmaDecisions([...early,later],6);
 assert.equal(selected.length,6);assert.ok(selected.includes(later));assert.ok(sanmaShapeFinding(later,'3-hanchan'));
});
