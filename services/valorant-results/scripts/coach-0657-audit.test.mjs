import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCoach0657} from './coach-0657-audit.mjs';
test('fixed incident reads two aggregate SELECTs without emitting identifiers or credentials',async()=>{
 const calls=[];const request=async(url,init)=>{
  calls.push({url,init});
  if(url.endsWith('/settings'))return Response.json({success:true,result:{bindings:[{type:'d1',name:'DB',id:'b'.repeat(36)}]}});
  const {sql,params}=JSON.parse(init.body);
  assert.equal(init.method,'POST');assert.match(sql,/^SELECT /);assert.equal(sql.includes(';'),false);
  assert.deepEqual(params,[Date.parse('2026-11-22T06:57:00+09:00'),Date.parse('2026-11-22T06:58:00+09:00')]);
  return Response.json({success:true,result:[{success:true,results:[sql.includes('valorant_match_rosters')?{matches:1,map_known:0,queue_linked:1,partial:1}:{queue_start_count:0}]}]});
 };
 const result=await auditCoach0657({CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'hidden-token'},request);
 assert.equal(result.matches,1);assert.equal(result.partial,1);assert.equal(result.mutations,0);assert.equal(calls.length,3);
 assert.doesNotMatch(JSON.stringify(result),/Aquatopia|Abema|puuid|match_id|hidden-token|bbbbbb/);
});
test('missing credentials fail before requesting external resources',async()=>{
 let calls=0;await assert.rejects(()=>auditCoach0657({},()=>{calls++;}));assert.equal(calls,0);
});
