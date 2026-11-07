import reference from './fixtures/sanma-point-reference.json' with {type:'json'};
import test from 'node:test';import assert from 'node:assert/strict';
import {sanmaPoints} from '../src/mahjong-sanma-points.ts';
import {calibrateSanmaPayments} from '../src/mahjong-sanma-calibration.ts';
const base={han:3,fu:30,yakuman:0,dealer:false,tsumo:false,honba:0,sticks:0,ronPerHonba:200,tsumoPerHonba:100};
test('sanma arithmetic handles dealer, child, tsumo loss, honba, deposits and limits',()=>{
 assert.deepEqual(sanmaPoints(base),{main:3900,additional:0,paid:3900,winner:3900});
 assert.equal(sanmaPoints({...base,dealer:true})!.paid,5800);
 assert.deepEqual(sanmaPoints({...base,tsumo:true,honba:1,sticks:2}),{main:2100,additional:1100,paid:3200,winner:5200});
 assert.equal(sanmaPoints({...base,dealer:true,tsumo:true})!.paid,4000);
 for(const [han,child,dealer] of [[5,8000,12000],[6,12000,18000],[8,16000,24000],[11,24000,36000],[13,32000,48000]]){
  assert.equal(sanmaPoints({...base,han})!.paid,child);assert.equal(sanmaPoints({...base,han,dealer:true})!.paid,dealer);
 }
 assert.equal(sanmaPoints({...base,han:0,fu:0,yakuman:2})!.paid,64000);
 assert.equal(sanmaPoints({...base,han:4,fu:30})!.paid,7700);assert.equal(sanmaPoints({...base,han:4,fu:30,kiriage:true})!.paid,8000);
 assert.equal(sanmaPoints({...base,honba:1,ronPerHonba:300})!.paid,4200);
 assert.equal(sanmaPoints({...base,ronPerHonba:undefined as unknown as number}),null);
 assert.equal(sanmaPoints({...base,han:0}),null);
});
test('offline payment calibration narrows honba only when real payment evidence distinguishes it',()=>{
 const head={uuid:'private-id',start_time:0,end_time:1,config:{mode:{mode:12,detail_rule:{have_zimosun:true}}},result:{players:[{seat:0,part_point_1:35000},{seat:1,part_point_1:35000},{seat:2,part_point_1:35000}]}};
 const round={name:'RecordNewRound',data:{ju:0,ben:1}};
 const ron={name:'RecordHule',data:{hules:[{seat:1,zimo:false,fu:30,fans:[{val:1},{val:1},{val:1}],point_rong:3900}],delta_scores:[-4100,4100,0]}};
 const out=calibrateSanmaPayments(head,[round,ron]);assert.equal(out.compared,1);assert.deepEqual(out.consistentRonHonba,[200]);assert.equal(out.unexplainedPayments,0);
 const ambiguous=calibrateSanmaPayments(head,[{...round,data:{ju:0,ben:0}},{...ron,data:{...ron.data,delta_scores:[-3900,3900,0]}}]);assert.deepEqual(ambiguous.consistentRonHonba,[200,300,1000]);assert.equal(ambiguous.honbaSamples,0);
 const mismatch=calibrateSanmaPayments(head,[round,{...ron,data:{...ron.data,delta_scores:[-9999,9999,0]}}]);assert.equal(mismatch.unexplainedPayments,1);assert.deepEqual(mismatch.consistentRonHonba,[]);
 assert.doesNotMatch(JSON.stringify(out),/private-id|delta_scores|nickname|hand/);
});

test('216 explicit payment inputs match an independent three-player scoring implementation',()=>{
 for(const c of reference.cases)assert.deepEqual(sanmaPoints(c.input),c.expected,JSON.stringify(c.input));
});
