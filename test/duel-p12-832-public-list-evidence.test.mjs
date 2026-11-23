import test from 'node:test';
import assert from 'node:assert/strict';
import {legacySql,guardedSql,collectPublicListEvidence} from '../scripts/duel-p12-832-public-list-evidence.mjs';
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'fixture',
 D1_DATABASE_ID:'11111111-1111-1111-1111-111111111111',
 DUEL_EVIDENCE_GUILD:'123456789012345678',DUEL_EVIDENCE_USER:'234567890123456789'};
test('same public list SELECT differs only in #832 ON guard',async()=>{
 assert.equal(guardedSql,legacySql.replace(
  " WHERE d.guild=?"," AND d.game IN ('hitblow','bluffdice','poker') WHERE d.guild=?"));
 assert.match(legacySql,/d.game IN \('othello','gomoku','connect4','trio'\)/);
 let calls=0;
 const value=await collectPublicListEvidence(env,async(_url,opts)=>{
  const {sql,params}=JSON.parse(opts.body);
  assert.equal(sql,calls===0?legacySql:guardedSql);
  assert.deepEqual(params,[env.DUEL_EVIDENCE_USER,env.DUEL_EVIDENCE_GUILD,env.DUEL_EVIDENCE_USER,env.DUEL_EVIDENCE_USER]);
  calls++;
  return {ok:true,json:async()=>({success:true,result:[{success:true,
   results:[{id:'fixture',game:'trio',private_hand:null}],meta:{rows_read:calls===1?8:5}}]})};
 });
 assert.equal(calls,2);assert.equal(value.sameResults,true);
 assert.equal(value.productionTrafficRowsSaved,'unmeasured');
 assert.doesNotMatch(JSON.stringify(value),new RegExp(env.DUEL_EVIDENCE_USER));
});
test('invalid config prevents any request',async()=>{
 let calls=0;await assert.rejects(collectPublicListEvidence({...env,DUEL_EVIDENCE_GUILD:'bad'},async()=>{calls++;}),/configuration/);
 assert.equal(calls,0);
});
test('reject missing read metadata and changed results',async()=>{
 await assert.rejects(collectPublicListEvidence(env,async()=>({ok:true,json:async()=>({success:true,result:[{success:true,results:[],meta:{}}]})})),/rows-read/);
 let calls=0;
 await assert.rejects(collectPublicListEvidence(env,async()=>{calls++;return {ok:true,json:async()=>({success:true,result:[{success:true,results:[{x:calls}],meta:{rows_read:1}}]})};}),/differ/);
});
