import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDuelOperations,duelAuditQueries} from '../../../scripts/duel-scheduled-operations-audit.mjs';
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'fixture-token'};
const now=Date.parse('2026-11-23T00:00:00.000Z');
const ok=(stale,active)=>({ok:true,json:async()=>({success:true,result:[{success:true,results:[{stale,active}]}]})});
test('scheduled audit is exactly two aggregated, fixed read-only SELECTs',async()=>{
 const queries=duelAuditQueries(now);
 assert.equal(queries.length,2);
 assert.ok(queries.every(q=>/^SELECT\b/.test(q.sql)&&!/(?:INSERT|UPDATE|DELETE|DROP|REPLACE)\s/i.test(q.sql)));
 assert.equal(queries[0].params[0],now-90*86400000);
 assert.equal(queries[1].params[0],now-30*86400000);
 const requests=[];let i=0;
 const result=await auditDuelOperations(env,async(url,options)=>{
  requests.push({url,options});return i++===0?ok(2,5):ok(1,3);
 },now);
 assert.deepEqual(result.counts,{staleFinishedPve:2,staleFinishedPvp:1,activePve:5,activePvp:3});
 assert.equal(result.reviewRecommended,true);assert.equal(result.deletionAuthorized,false);
 assert.equal(requests.length,2);
 for(const r of requests){
  assert.equal(r.options.method,'POST');
  assert.match(r.url,/\/d1\/database\/bf23ab40-814f-4626-9e0b-36739ac41750\/query$/);
  const query=JSON.parse(r.options.body);
  assert.match(query.sql,/^SELECT /);assert.equal(query.params.length,1);
 }
});
test('healthy empty aggregates require no review and never authorize deletion',async()=>{
 const result=await auditDuelOperations(env,async()=>ok(0,0),now);
 assert.equal(result.reviewRecommended,false);assert.equal(result.deletionAuthorized,false);
});
test('failure, malformed and negative aggregate results fail closed',async()=>{
 await assert.rejects(auditDuelOperations({},async()=>{throw Error('must not call')},now),/credentials/);
 await assert.rejects(auditDuelOperations(env,async()=>({ok:false,status:403}),now),/HTTP 403/);
 await assert.rejects(auditDuelOperations(env,async()=>ok(-1,0),now),/count invalid/);
 await assert.rejects(auditDuelOperations(env,async()=>({ok:true,json:async()=>({success:false,result:[]})}),now),/response invalid/);
 assert.throws(()=>duelAuditQueries(NaN),/clock/);
});
