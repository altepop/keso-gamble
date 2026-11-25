import test from 'node:test';
import assert from 'node:assert/strict';
import {legacySql,noJoinSql,measureJoinEvidence} from '../scripts/duel-p12-827-join-evidence.mjs';
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'fixture',
 D1_DATABASE_ID:'11111111-1111-1111-1111-111111111111',
 DUEL_EVIDENCE_GUILD:'123456789012345678',DUEL_EVIDENCE_USER:'234567890123456789'};
test('same input isolates only the #827 daily PvE join',async()=>{
 assert.match(legacySql,/LEFT JOIN kp_duel_pve_daily_entries d/);
 assert.doesNotMatch(noJoinSql,/JOIN kp_duel_pve_daily_entries/);
 assert.match(noJoinSql,/NULL AS daily_day/);
 let calls=0;const result=await measureJoinEvidence(env,async(_url,opts)=>{
  const {sql,params}=JSON.parse(opts.body);
  assert.equal(opts.method,'POST');
  assert.deepEqual(params,[env.DUEL_EVIDENCE_GUILD,env.DUEL_EVIDENCE_USER,'pvp','pvp','all','all',20]);
  assert.equal(sql,calls===0?legacySql:noJoinSql);
  calls++;
  return {ok:true,json:async()=>({success:true,result:[{success:true,
   results:[{match_id:'fixture',mode:'pvp',game:'trio',outcome:'win',occurred_at:1,daily_day:null}],
   meta:{rows_read:calls===1?12:4}}]})};
 });
 assert.equal(calls,2);assert.equal(result.sameResults,true);
 assert.equal(result.legacyJoinRowsRead,12);assert.equal(result.omittedJoinRowsRead,4);
 assert.equal(result.productionTrafficRowsSaved,'unmeasured');
 assert.doesNotMatch(JSON.stringify(result),new RegExp(env.DUEL_EVIDENCE_USER));
});
test('reject invalid owner before request',async()=>{
 let calls=0;await assert.rejects(measureJoinEvidence({...env,DUEL_EVIDENCE_USER:'x'},async()=>{calls++;}),/configuration/);
 assert.equal(calls,0);
});
test('fail closed on mismatched records and missing read metrics',async()=>{
 let calls=0;
 await assert.rejects(measureJoinEvidence(env,async()=>{
  calls++;return {ok:true,json:async()=>({success:true,result:[{success:true,
   results:[{daily_day:calls===1?null:'20261124'}],meta:{rows_read:1}}]})};
 }),/mismatch/);
 await assert.rejects(measureJoinEvidence(env,async()=>({ok:true,json:async()=>({success:true,
  result:[{success:true,results:[],meta:{}}]})})),/rows-read/);
});
