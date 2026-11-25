import test from 'node:test';
import assert from 'node:assert/strict';
import {oldSql,newSql,compareReceiptFilters} from '../scripts/duel-p12-833-filter-evidence.mjs';
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'fixture-secret',
 D1_DATABASE_ID:'11111111-1111-1111-1111-111111111111',
 DUEL_EVIDENCE_GUILD:'123456789012345678',DUEL_EVIDENCE_USER:'234567890123456789'};
test('#833 changes only OR predicates and bind count with fixed PvP/trio owner and limit',async()=>{
 const oldBase=oldSql.replace(" AND (?='all' OR r.mode=?) AND (?='all' OR r.game=?)",'');
 const newBase=newSql.replace(' AND r.mode=? AND r.game=?','');
 assert.equal(oldBase,newBase);
 assert.match(oldSql,/\?='all' OR r.mode=\?/);
 assert.match(newSql,/AND r.mode=\? AND r.game=\?/);
 assert.match(newSql,/r.guild=\? AND r.user=\?/);
 assert.match(newSql,/ORDER BY r.occurred_at DESC,r.match_id DESC LIMIT \?/);
 let calls=0;
 const result=await compareReceiptFilters(env,async(_url,options)=>{
  assert.equal(options.method,'POST');
  const body=JSON.parse(options.body),params=body.params;
  assert.equal(body.sql,calls===0?oldSql:newSql);
  assert.deepEqual(params,calls===0?
   [env.DUEL_EVIDENCE_GUILD,env.DUEL_EVIDENCE_USER,'pvp','pvp','trio','trio',20]:
   [env.DUEL_EVIDENCE_GUILD,env.DUEL_EVIDENCE_USER,'pvp','trio',20]);
  calls++;
  return {ok:true,json:async()=>({success:true,result:[{success:true,
   results:[{match_id:'private-fixture',mode:'pvp',game:'trio',outcome:'win',occurred_at:1,daily_day:null}],
   meta:{rows_read:calls===1?9:3}}]})};
 });
 assert.equal(calls,2);assert.equal(result.sameResults,true);
 assert.equal(result.legacyRowsRead,9);assert.equal(result.indexableRowsRead,3);
 assert.equal(result.productionTrafficRowsSaved,'unmeasured');
 assert.doesNotMatch(JSON.stringify(result),/private-fixture|fixture-secret|234567890123456789/);
});
test('invalid owner or token fails before any request',async()=>{
 let calls=0;
 await assert.rejects(compareReceiptFilters({...env,DUEL_EVIDENCE_GUILD:'wrong'},async()=>{calls++;}),/configuration/);
 await assert.rejects(compareReceiptFilters({...env,CLOUDFLARE_API_TOKEN:''},async()=>{calls++;}),/configuration/);
 assert.equal(calls,0);
});
test('mismatch and missing D1 rows-read metadata fail closed',async()=>{
 let count=0;
 await assert.rejects(compareReceiptFilters(env,async()=>({ok:true,json:async()=>({
  success:true,result:[{success:true,results:[{id:++count}],meta:{rows_read:1}}]
 })})),/Different receipt results/);
 await assert.rejects(compareReceiptFilters(env,async()=>({ok:true,json:async()=>({
  success:true,result:[{success:true,results:[],meta:{}}]
 })})),/Rows read evidence/);
});
