import test from 'node:test';import assert from 'node:assert/strict';
import {viewerHistoryCheck} from '../scripts/mahjong-review-live-audit.mjs';
const uuid='261108-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',nowMs=1794140000000;
const entry={uuid,start_time:1794130000,end_time:1794135000,accounts:[{account_id:10001},{account_id:10002},{account_id:10003}]};
const context={viewerAccountId:10001,gameConnectionPresent:false};
test('viewer history uses one authenticated list request, at most one owned replay, and no DB callback',async()=>{
 let lists=0,reads=0,closed=0;
 const result=await viewerHistoryCheck({}, {nowMs,query:()=>{throw Error('no DB');},connect:async()=>({...context,call:async(method,payload)=>{lists++;assert.equal(method,'fetchGameRecordList');assert.deepEqual(payload,{start:1,count:1,type:0});return {total_count:2,record_list:[entry,entry]};},close(){closed++;}}),decode:async(_s,id)=>{reads++;assert.equal(id,uuid);return {head:{uuid},actions:[{}]};}});
 assert.equal(result.ok,true);assert.equal(lists,1);assert.equal(reads,1);assert.equal(closed,1);assert.deepEqual(result.sessionContext,{gameConnectionPresent:false,viewerParticipated:true});assert.doesNotMatch(JSON.stringify(result),/10001|aaaaaaaa/);
});
test('empty page is reported without asserting the account never played and without another request',async()=>{
 for(const total_count of [0,1]){let reads=0;const r=await viewerHistoryCheck({}, {connect:async()=>({...context,call:async()=>({total_count,record_list:[]}),close(){}}),decode:async()=>{reads++;}});assert.equal(r.ok,false);assert.equal(r.status,'history-empty-response');assert.equal(r.totalReportedPositive,total_count>0);assert.equal(reads,0);}
});
test('unverified, nonparticipant, unfinished and future records are refused without trying another entry',async()=>{
 for(const bad of [{...entry,uuid:'private-id'},{...entry,accounts:[{account_id:10002},{account_id:10003},{account_id:10004}]},{...entry,end_time:0},{...entry,end_time:Math.floor(nowMs/1000)+3600}]){
  let reads=0;const r=await viewerHistoryCheck({}, {nowMs,connect:async()=>({...context,call:async()=>({record_list:[bad,entry]}),close(){}}),decode:async()=>{reads++;}});assert.equal(r.ok,false);assert.equal(r.status,'history-record-unverified');assert.equal(reads,0);assert.doesNotMatch(JSON.stringify(r),/private-id|10002/);
 }
});
test('unknown viewer identity stops before listing; failed list and record calls do not retry',async()=>{
 let calls=0;const unknown=await viewerHistoryCheck({}, {connect:async()=>({call:async()=>{calls++;},close(){}})});assert.equal(unknown.status,'viewer-unknown');assert.equal(calls,0);
 for(const phase of ['history','record']){
  let lists=0,reads=0,closed=0;
  const r=await viewerHistoryCheck({}, {nowMs,connect:async()=>({...context,call:async()=>{lists++;if(phase==='history')throw Error('fetchGameRecordList_540');return {record_list:[entry]};},close(){closed++;}}),decode:async()=>{reads++;throw Error('fetchGameRecord_540');}});
  assert.equal(r.ok,false);assert.equal(r.diagnostic.phase,phase);assert.equal(lists,1);assert.equal(reads,phase==='history'?0:1);assert.equal(closed,1);assert.match(r.diagnostic.code,/^audit_rpc_fetchGameRecord(?:List)?_540$/);
 }
});
test('a mismatched head or absent actions cannot become a successful owned replay read',async()=>{
 for(const decoded of [{head:{uuid:'private-other'},actions:[{}]},{head:{uuid},actions:[]}]){
  const r=await viewerHistoryCheck({}, {nowMs,connect:async()=>({...context,call:async()=>({record_list:[entry]}),close(){}}),decode:async()=>decoded});assert.equal(r.ok,false);assert.equal(r.status,'record-unverified');assert.doesNotMatch(JSON.stringify(r),/private-other|10001/);
 }
});
