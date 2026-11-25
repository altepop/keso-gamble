import test from 'node:test';
import assert from 'node:assert/strict';
import {collectEvidence,legacyPvpSessionSql} from '../scripts/duel-p12-824-read-evidence.mjs';

const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'read-only-fixture',
 D1_DATABASE_ID:'11111111-1111-1111-1111-111111111111',
 DUEL_EVIDENCE_GUILD:'123456789012345678',DUEL_EVIDENCE_USER:'234567890123456789'};
test('#824 read-only counterfactual uses exact legacy PvP session SELECT and suppresses private output',async()=>{
 let calls=0;
 const value=await collectEvidence(env,async (_url,options)=>{
  calls++;
  assert.equal(options.method,'POST');
  const {sql,params}=JSON.parse(options.body);
  assert.equal(sql,legacyPvpSessionSql);
  assert.match(sql,/^SELECT s\.id/);
  assert.deepEqual(params,[env.DUEL_EVIDENCE_GUILD,env.DUEL_EVIDENCE_USER,'pvp','pvp','all','all',20]);
  return {ok:true,json:async()=>({success:true,result:[{success:true,results:[],meta:{rows_read:7}}]})};
 });
 assert.equal(calls,1);
 assert.equal(value.legacyCounterfactualRowsRead,7);
 assert.equal(value.productionTrafficRowsSaved,'unmeasured');
 assert.equal(value.currentOmittedQueryExecutions,0);
 assert.doesNotMatch(JSON.stringify(value),new RegExp(env.DUEL_EVIDENCE_USER));
});
test('#824 evidence rejects invalid config before issuing a request',async()=>{
 let calls=0;
 await assert.rejects(collectEvidence({...env,DUEL_EVIDENCE_USER:'invalid'},async()=>{calls++;}),/configuration/);
 assert.equal(calls,0);
});
test('#824 evidence rejects missing D1 rows-read metadata',async()=>{
 await assert.rejects(collectEvidence(env,async()=>({ok:true,json:async()=>({success:true,result:[{success:true,results:[],meta:{}}]})})),/valid rows-read/);
});
