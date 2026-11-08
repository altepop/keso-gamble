import test from 'node:test';import assert from 'node:assert/strict';
import {enableVerifiedSanma} from '../scripts/enable-verified-sanma-review.mjs';
const env={SANMA_PROBE_VERIFIED:'true',PAIPU_DISPATCH_TOKEN:'private-key'};
test('sanma cannot activate without a verified probe or configured credential',async()=>{
 let calls=0;const request=async()=>{calls++;};
 assert.equal((await enableVerifiedSanma({},request)).enabled,false);
 assert.equal((await enableVerifiedSanma({SANMA_PROBE_VERIFIED:'true'},request)).enabled,false);assert.equal(calls,0);
});
test('activation changes only the fixed non-secret sanma boolean, and re-run does not rewrite true',async()=>{
 for(const status of [200,404]){
  const calls=[];const result=await enableVerifiedSanma(env,async(url,options)=>{calls.push({url,options});return calls.length===1?{status,json:async()=>({value:'false'})}:{status:status===404?201:204};});
  assert.equal(result.enabled,true);assert.equal(calls.length,2);assert.equal(calls[1].options.method,status===404?'POST':'PATCH');
  assert.deepEqual(JSON.parse(calls[1].options.body),{name:'MAHJONG_SANMA_REVIEW_ENABLED',value:'true'});assert.ok(calls.every(c=>c.url.startsWith('https://api.github.com/repos/altepop/keso-gamble/actions/variables')));
  assert.doesNotMatch(JSON.stringify(result),/private/);
 }
 let calls=0;assert.equal((await enableVerifiedSanma(env,async()=>{calls++;return {status:200,json:async()=>({value:'true'})};})).status,'already-enabled');assert.equal(calls,1);
});
test('missing variable permissions fail visibly without printing a token or trying another resource',async()=>{
 let calls=0;const r=await enableVerifiedSanma(env,async()=>{calls++;return {status:403};});assert.equal(r.enabled,false);assert.equal(r.status,'read-http-403');assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(r),/private/);
});
