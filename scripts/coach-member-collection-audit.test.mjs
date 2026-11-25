import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditMemberCollection} from './coach-member-collection-audit.mjs';
const now=1_800_000_000_000,env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'private-token'};
function fixture({missingCost=false,fail=false,done=0}={}){
 const requests=[];
 const request=async(url,init)=>{
  requests.push({url,...init});
  if(url.endsWith('/settings'))return Response.json({success:true,result:{bindings:[{type:'d1',name:'DB',id:'b'.repeat(36)}]}});
  if(fail)return new Response('private upstream failure',{status:503});
  const {sql}=JSON.parse(init.body);assert.match(sql,/^SELECT\b/);assert.equal(sql.includes(';'),false);
  const results=sql.includes('FROM monitor_state')?[{key:'coach_all_members:enabled',value:'enabled'},{key:'api_after',value:String(now+5000)}]
   :sql.includes('FROM coach_member_sources')?[{riot_id:'Dolly#SDGs',resolved:1,next_page:2,done,truncated:0,next_at:now+9000,discovered:7,complete:2,pending:4,partial:1,unavailable:0,puuid:'private-player'}]
   :[{feature:'coach_member_discovery',last_ok:now-60000,last_error:null,failures:0}];
  return Response.json({success:true,result:[{success:true,results,meta:missingCost?{}:{rows_read:10}}]});
 };return {request,requests};
}
test('reports real collection progress and bounded cost using settings GET and three SELECTs',async()=>{
 const f=fixture(),r=await auditMemberCollection(env,f.request,now);
 assert.equal(r.enabled,true);assert.equal(r.accounts.length,6);assert.equal(r.accounts[0].resolved,true);assert.equal(r.accounts[0].discovered,7);
 assert.equal(r.accounts[0].retryWaitSeconds,9);assert.equal(r.accounts[1].initialized,false);assert.equal(r.apiWaitSeconds,5);
 assert.equal(r.jobs[0].lastOkAgeSeconds,60);assert.equal(r.jobs[0].lastErrorAgeSeconds,null);
 assert.deepEqual([r.queries,r.rowsRead,r.mutations,r.extraHenrikRequests],[3,30,0,0]);assert.equal(f.requests.length,4);
 assert.doesNotMatch(JSON.stringify(r),/private-|Dolly|SDGs|puuid|riot_id|Authorization/);
});
test('unknown D1 costs stay unknown and upstream failures never enter the report',async()=>{
 assert.equal((await auditMemberCollection(env,fixture({missingCost:true}).request,now)).rowsRead,null);
 await assert.rejects(auditMemberCollection(env,fixture({fail:true}).request,now),/^Error: query$/);
});
test('invalid target configuration fails before any network access',async()=>{
 let calls=0;await assert.rejects(auditMemberCollection({},()=>{calls++;},now));assert.equal(calls,0);
});
test('regular newest-page waiting is labelled separately from error retry backoff',async()=>{
 const r=await auditMemberCollection(env,fixture({done:1}).request,now);
 assert.equal(r.accounts[0].nextCheckWaitSeconds,9);assert.equal(r.accounts[0].retryWaitSeconds,null);assert.equal(r.apiWaitSeconds,5);
});
