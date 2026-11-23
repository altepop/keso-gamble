import test from 'node:test';
import assert from 'node:assert/strict';
import {legacySql,indexedSql,comparePvpAuditCounts}
 from '../scripts/duel-p12-837-audit-evidence.mjs';
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),
 CLOUDFLARE_API_TOKEN:'fixture-secret',
 D1_DATABASE_ID:'11111111-1111-1111-1111-111111111111',
 DUEL_EVIDENCE_GUILD:'123456789012345678',
 DUEL_EVIDENCE_NOW_MS:String(100*86_400_000)};
const threshold=70*86_400_000;
test('#837 compares same guild, 30-day cutoff and exact status membership',async()=>{
 assert.match(legacySql,/SUM\(CASE/);
 assert.match(indexedSql,/SELECT COUNT\(\*\) FROM kp_board_duels/);
 assert.doesNotMatch(indexedSql,/SUM\(CASE/);
 for(const sql of [legacySql,indexedSql]){
  assert.match(sql,/status IN \('finished','cancelled'\)/);
  assert.match(sql,/status IN \('active','pending'\)/);
  assert.match(sql,/updated_at<\?/);
  assert.doesNotMatch(sql,/\b(?:DELETE|UPDATE|INSERT|DROP|ALTER)\b/i);
 }
 let n=0;
 const result=await comparePvpAuditCounts(env,async(url,options)=>{
  assert.match(url,/api.cloudflare.com\/client\/v4\/accounts/);
  assert.equal(options.method,'POST');
  const payload=JSON.parse(options.body);
  assert.equal(payload.sql,n===0?legacySql:indexedSql);
  assert.deepEqual(payload.params,n===0?[threshold,env.DUEL_EVIDENCE_GUILD]:
   [env.DUEL_EVIDENCE_GUILD,threshold,env.DUEL_EVIDENCE_GUILD]);
  n++;
  return {ok:true,json:async()=>({success:true,result:[{success:true,
   results:[{stale:2,active:3}],meta:{rows_read:n===1?14:5}}]})};
 });
 assert.equal(n,2);
 assert.deepEqual({same:result.matchingCounters,legacy:result.legacyRowsRead,new:result.indexedRowsRead},
  {same:true,legacy:14,new:5});
 assert.equal(result.productionTrafficRowsSaved,'unmeasured');
 assert.doesNotMatch(JSON.stringify(result),/fixture-secret|123456789012345678/);
});
test('invalid guild, no token and invalid clock reject before touching D1',async()=>{
 let n=0;const request=async()=>{n++};
 await assert.rejects(comparePvpAuditCounts({...env,DUEL_EVIDENCE_GUILD:'bad'},request),/configuration/);
 await assert.rejects(comparePvpAuditCounts({...env,CLOUDFLARE_API_TOKEN:''},request),/configuration/);
 await assert.rejects(comparePvpAuditCounts({...env,DUEL_EVIDENCE_NOW_MS:'NaN'},request),/configuration/);
 assert.equal(n,0);
});
test('different rows and missing read metadata fail closed',async()=>{
 let n=0;
 await assert.rejects(comparePvpAuditCounts(env,async()=>{
  n++;return {ok:true,json:async()=>({success:true,result:[{success:true,
   results:[{stale:n,active:2}],meta:{rows_read:4}}]})};
 }),/mismatch/);
 await assert.rejects(comparePvpAuditCounts(env,async()=>({ok:true,json:async()=>({
  success:true,result:[{success:true,results:[{stale:1,active:2}],meta:{}}]
 })})),/Incomplete/);
});
