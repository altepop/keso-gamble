import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Standalone read-only diagnostic; never imported by inference.
import {auditCompletedSanmaHands} from '../scripts/mahjong-sanma-hand-audit.mjs';
import {threeOpenValueScenario} from './fixtures/mahjong-review-three.ts';
import {reviewDecisions} from '../src/mahjong-review-state.ts';
import {summarizePaipu} from '../src/mahjong-summary.ts';
function completed(){
 const f=threeOpenValueScenario(),d=reviewDecisions(f.actions,f.summary).find(d=>d.seat===1&&d.turn===2)!;
 const hand=d.hand.filter(t=>t!=='2s');const actions=structuredClone(f.actions);
 for(const seat of [2,0])actions.push({name:'RecordDealTile',data:{seat,tile:'6z'}},{name:'RecordDiscardTile',data:{seat,tile:'6z',moqie:true}});
 actions.push({name:'RecordDealTile',data:{seat:1,tile:'4s'}},{name:'RecordHule',data:{hules:[{seat:1,zimo:true,liqi:false,hand,hu_tile:'4s',fu:30,fans:[{id:7,val:1},{id:34,val:2}],point_zimo_qin:2000,point_zimo_xian:1000}],delta_scores:[-2000,3000,-1000]}});
 const head={...f.head,result:{players:[{seat:1,part_point_1:38000},{seat:2,part_point_1:34000},{seat:0,part_point_1:33000}]}};
 return {actions,summary:summarizePaipu(head,actions)};
}
test('offline hand audit does no work without its optional calculator and exposes no source data',()=>{
 const {actions,summary}=completed();let calls=0;
 const result=auditCompletedSanmaHands(actions,summary,{python:'',runner(){calls++;}});assert.equal(result.status,'not-configured');assert.equal(calls,0);
 assert.doesNotMatch(JSON.stringify(result),/synthetic|hand|test1|4s/);
});
test('completed open win is independently matched on hand-derived han/fu and payments',{skip:!process.env.SANMA_PYTHON},()=>{
 const {actions,summary}=completed(),diag={acceptedRounds:0,blocked:{}};reviewDecisions(actions,summary,256,diag);assert.deepEqual(diag.blocked,{});const result=auditCompletedSanmaHands(actions,summary);
 assert.equal(result.status,'ok');assert.equal(result.prepared,1);assert.equal(result.evaluated,1);assert.equal(result.matchedHanFu,1);assert.equal(result.matchedBasePayment,1);assert.equal(result.calculationRejected,0);
 const wrongFu=structuredClone(actions);wrongFu.at(-1)!.data.hules[0].fu=40;
 const a=auditCompletedSanmaHands(wrongFu,summary);assert.equal(a.mismatchedHanFu,1);assert.equal(a.matchedBasePayment,1);
 const wrongPay=structuredClone(actions);wrongPay.at(-1)!.data.hules[0].point_zimo_qin=9999;
 const b=auditCompletedSanmaHands(wrongPay,summary);assert.equal(b.mismatchedBasePayment,1);assert.equal(b.matchedHanFu,1);
 assert.doesNotMatch(JSON.stringify(b),/synthetic|hu_tile|north|test1|5s/);
});
test('offline hand audit rejects unknown replay and malformed response without logging private errors',()=>{
 const {actions,summary}=completed();let calls=0;
 const bad=[actions[0],{name:'RecordUnsupported',data:{secret:'private'}},...actions.slice(1)];
 const result=auditCompletedSanmaHands(bad,summary,{python:'/fake',runner(){calls++;}});assert.equal(result.status,'replay-unverified');assert.equal(calls,0);
 const failed=auditCompletedSanmaHands(actions,summary,{python:'/fake',runner(_cmd:any,_args:any,options:any){assert.deepEqual(options.env,{});return {status:0,stdout:'private-not-json'};}});
 assert.equal(failed.status,'failed');assert.doesNotMatch(JSON.stringify(failed),/private/);
});
