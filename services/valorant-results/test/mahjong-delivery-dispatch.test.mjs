import test from 'node:test';import assert from 'node:assert/strict';
import {dispatchDeliveryAudit} from '../scripts/dispatch-mahjong-delivery-audit.mjs';
test('delivery verification dispatch is fixed to the existing main workflow and only its read-only mode',async()=>{
 let calls=0;const result=await dispatchDeliveryAudit({PAIPU_DISPATCH_TOKEN:'private-test-key'},async(url,options)=>{calls++;assert.equal(url,'https://api.github.com/repos/altepop/keso-gamble/actions/workflows/mahjong-paipu.yml/dispatches');assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer private-test-key');assert.deepEqual(JSON.parse(options.body),{ref:'main',inputs:{delivery_audit:true}});return {status:204};});
 assert.equal(calls,1);assert.deepEqual(result,{started:true,status:'started'});assert.doesNotMatch(JSON.stringify(result),/private/);
});
test('missing or rejected dispatch credential cannot leak or change to a write/ingestion mode',async()=>{
 let calls=0;assert.equal((await dispatchDeliveryAudit({},()=>{calls++;})).status,'unavailable-token');assert.equal(calls,0);
 assert.equal((await dispatchDeliveryAudit({PAIPU_DISPATCH_TOKEN:'private'},async()=>({status:403}))).status,'http-403');
 assert.equal((await dispatchDeliveryAudit({PAIPU_DISPATCH_TOKEN:'private'},async()=>{throw Error('private');})).status,'request-failed');
});
test('an explicitly marked verification release may request the owner-only single-message probe',async()=>{
 const result=await dispatchDeliveryAudit({PAIPU_DISPATCH_TOKEN:'private-test-key',REVIEW_DELIVERY_PROBE:'true'},async(_url,options)=>{assert.deepEqual(JSON.parse(options.body),{ref:'main',inputs:{delivery_probe:true,review_audit:true,enable_sanma:true}});return {status:204};});assert.equal(result.started,true);
});

test('explicit recovery reuses the already delivered verification release and never selects an arbitrary ref',async()=>{
 const result=await dispatchDeliveryAudit({PAIPU_DISPATCH_TOKEN:'private',REVIEW_DELIVERY_RESUME:'true'},async(_url,options)=>{assert.deepEqual(JSON.parse(options.body),{ref:'main',inputs:{delivery_probe:true,review_audit:true,enable_sanma:true,probe_release:'4192e3a6be43bdff05cb5b0dc22d89f807d62964'}});return {status:204};});assert.equal(result.started,true);
});

test('analysis audit starts a read-only real-record check without a probe, delivery or activation',async()=>{
 const r=await dispatchDeliveryAudit({PAIPU_DISPATCH_TOKEN:'private',REVIEW_ANALYSIS_AUDIT:'true'},async(_url,options)=>{
  assert.deepEqual(JSON.parse(options.body),{ref:'main',inputs:{review_audit:true}});return {status:204};
 });assert.equal(r.started,true);
});
