import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCoachFeedback,summarizeCoachFeedbackAudit,WINDOW_START,WINDOW_END} from './coach-feedback-receipt-audit.mjs';
test('audit reports matches and receipt without raw PUUID or subject IDs',()=>{
 const out=summarizeCoachFeedbackAudit([{riot_id:'Dolly#SDGs',match_id:'match-a',
 ended_at:WINDOW_START+1000,map:'Sunset',outcome:'win',agent:'Sova',roster_saved:1,
 rounds_saved:1,kills_saved:0,profile_linked:1,
 receipt:JSON.stringify({state:'claimed',at:WINDOW_START})}]);
 assert.equal(out[0].member,'VDK');assert.equal(out[0].receiptState,'claimed');
 assert.equal(out[0].claimedJst,'2026-11-24 00:10:00 JST');
 assert.equal(out[0].killsSaved,false);
 assert.doesNotMatch(JSON.stringify(out),/subject_id|puuid/);
});
test('production audit sends SELECT only to D1 endpoint',async()=>{
 let calls=0;const requests=[];
 const fetcher=async(url,init)=>{calls++;requests.push({url,init});
  return {ok:true,json:async()=>calls===1?{success:true,result:{bindings:[{name:'DB',type:'d1',id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}]}}:
   {success:true,result:[{success:true,results:[],meta:{rows_read:3}}]}};};
 const out=await auditCoachFeedback({CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'test'},fetcher);
 assert.equal(calls,2);assert.equal(out.rows.length,0);assert.equal(out.mutations,0);
 const payload=JSON.parse(requests[1].init.body);
 assert.match(payload.sql,/^SELECT /);assert.deepEqual(payload.params,[WINDOW_START,WINDOW_END]);
 assert.doesNotMatch(payload.sql,/INSERT|UPDATE|DELETE|DROP/i);
});
