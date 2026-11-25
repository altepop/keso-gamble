import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeNewCoachReceipts,auditNewCoachReceipts,SINCE} from './coach-new-feedback-audit.mjs';
test('same match returns independently keyed VDK, Ishihara and Fujimura results',()=>{
 const mid='58feed7c-e6db-4c99-9b18-27ea8297153c';
 const rows=[['Dolly#SDGs','posted'],['h1d3g1g4s#1037','incomplete'],['frin#怖すぎ','suppressed']]
  .map(([riot_id,status])=>({riot_id,match_id:mid,ended_at:SINCE+3600000,outcome:'win',
   sent:1,map:'Sunset',roster_saved:1,rounds_saved:1,kills_saved:1,profile_linked:1,
   receipt:status==='posted'?JSON.stringify({state:'posted',at:SINCE,messageId:'1440000000000000000',httpStatus:200,content:'verified'}):null,
   replay_diagnostic:JSON.stringify({at:SINCE+100,status})}));
 const output=summarizeNewCoachReceipts(rows);
 assert.deepEqual(output.map(x=>x.member),['VDK','石原','藤村']);
 assert.deepEqual(output.map(x=>x.replayStatus),['posted','incomplete','suppressed']);
 assert.deepEqual(output.map(x=>x.receiptState),['posted','none','none']);
 assert.equal(output[0].postedText,'verified');
 assert.equal(output[1].postedText,null);
 assert.ok(!JSON.stringify(output).includes('subject_id'));
});
test('audit uses only one SELECT with a bounded recent window',async()=>{
 const requests=[];
 const fetcher=async(url,init)=>{requests.push({url,init});
  return {ok:true,json:async()=>requests.length===1?{success:true,result:{bindings:[{name:'DB',type:'d1',id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}]}}:
   {success:true,result:[{success:true,results:[],meta:{rows_read:4}}]}};
 };
 const result=await auditNewCoachReceipts({CLOUDFLARE_API_TOKEN:'test',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32)},fetcher);
 assert.equal(requests.length,2);assert.equal(result.mutations,0);
 const payload=JSON.parse(requests[1].init.body);
 assert.match(payload.sql,/^SELECT /);
 assert.match(payload.sql,/coach_feedback_replay_result:v2:/);
 assert.deepEqual(payload.params,[SINCE]);
 assert.doesNotMatch(payload.sql,/\b(INSERT|UPDATE|DELETE|DROP)\b/i);
});
