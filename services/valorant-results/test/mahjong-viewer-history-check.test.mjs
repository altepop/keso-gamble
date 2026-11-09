import test from 'node:test';import assert from 'node:assert/strict';
import {viewerHistoryCheck} from '../scripts/mahjong-review-live-audit.mjs';
const uuid='261108-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',nowMs=1794140000000,endTime=Math.floor(nowMs/1000),beginTime=endTime-30*86400;
const entry={uuid,start_time:1794130000,end_time:1794135000,players:[{account_id:10001},{account_id:10002},{account_id:10003}]};
const context={viewerAccountId:10001,gameConnectionPresent:false};
const cursor={iterator:'private-opaque-cursor',iterator_expire:endTime+300};
function callPage(page,onCall=()=>{}){return async(method,payload)=>{onCall(method,payload);return method==='fetchGameRecordListV2'?cursor:page;};}
test('viewer history uses V2 all-tag and one page, one owned replay, and no DB callback',async()=>{
 const calls=[];let reads=0,closed=0;
 const result=await viewerHistoryCheck({}, {nowMs,query:()=>{throw Error('no DB');},connect:async()=>({...context,call:callPage({entries:[entry,entry]},(method,payload)=>calls.push({method,payload})),close(){closed++;}}),decode:async(_s,id)=>{reads++;assert.equal(id,uuid);return {head:{uuid},actions:[{}]};}});
 assert.deepEqual(calls,[{method:'fetchGameRecordListV2',payload:{tag:0,begin_time:beginTime,end_time:endTime,ranks:[],modes:[],max_hu_type:0,level_mode:[]}},{method:'fetchNextGameRecordList',payload:{iterator:cursor.iterator,count:1}}]);
 assert.equal(result.ok,true);assert.equal(result.historyRequests,2);assert.equal(reads,1);assert.equal(closed,1);assert.deepEqual(result.sessionContext,{gameConnectionPresent:false,viewerParticipated:true});assert.doesNotMatch(JSON.stringify(result),/10001|aaaaaaaa|private-opaque/);
});
test('empty page never asserts no lifetime games or continues even when next is true',async()=>{
 for(const next of [false,true]){let reads=0,calls=0;const r=await viewerHistoryCheck({}, {nowMs,connect:async()=>({...context,call:callPage({next,entries:[]},()=>calls++),close(){}}),decode:async()=>{reads++;}});assert.equal(r.ok,false);assert.equal(r.status,'history-empty-response');assert.equal(r.hasNext,next);assert.equal(calls,2);assert.equal(reads,0);}
});
test('invalid or expired cursor stops before requesting a page and never leaks cursor',async()=>{
 for(const bad of [{},{iterator:'private-cursor',iterator_expire:0},{iterator:'private-cursor',iterator_expire:endTime},{iterator:'x'.repeat(4097),iterator_expire:endTime+300}]){
  let calls=0,closed=0;const r=await viewerHistoryCheck({}, {nowMs,connect:async()=>({...context,call:async()=>{calls++;return bad;},close(){closed++;}}),decode:async()=>{throw Error('must not read');}});assert.equal(r.status,'history-iterator-unverified');assert.equal(calls,1);assert.equal(closed,1);assert.doesNotMatch(JSON.stringify(r),/private-cursor|xxxx/);
 }
});
test('unverified, nonparticipant, unfinished, outside-window and future entries cannot fall back to a second entry',async()=>{
 for(const bad of [{...entry,uuid:'private-id'},{...entry,players:[{account_id:10002},{account_id:10003},{account_id:10004}]},{...entry,end_time:0},{...entry,start_time:beginTime-1},{...entry,end_time:endTime+3600}]){
  let reads=0;const r=await viewerHistoryCheck({}, {nowMs,connect:async()=>({...context,call:callPage({entries:[bad,entry]}),close(){}}),decode:async()=>{reads++;}});assert.equal(r.ok,false);assert.equal(r.status,'history-record-unverified');assert.equal(reads,0);assert.doesNotMatch(JSON.stringify(r),/private-id|10002|private-opaque/);
 }
});
test('unknown identity stops before listing; failures in iterator, page or record never retry',async()=>{
 let calls=0;const unknown=await viewerHistoryCheck({}, {connect:async()=>({call:async()=>{calls++;},close(){}})});assert.equal(unknown.status,'viewer-unknown');assert.equal(calls,0);
 for(const failing of ['fetchGameRecordListV2','fetchNextGameRecordList','fetchGameRecord']){
  let lists=0,reads=0,closed=0;
  const r=await viewerHistoryCheck({}, {nowMs,connect:async()=>({...context,call:callPage({entries:[entry]},method=>{lists++;if(method===failing)throw Error(method+'_540');}),close(){closed++;}}),decode:async()=>{reads++;throw Error('fetchGameRecord_540');}});
  assert.equal(r.ok,false);assert.equal(r.diagnostic.phase,failing==='fetchGameRecord'?'record':'history');assert.equal(lists,failing==='fetchGameRecordListV2'?1:2);assert.equal(reads,failing==='fetchGameRecord'?1:0);assert.equal(closed,1);assert.equal(r.diagnostic.code,'audit_rpc_'+failing+'_540');assert.doesNotMatch(JSON.stringify(r),/private-opaque/);
 }
});
test('mismatched head or absent actions cannot become a successful owned replay read',async()=>{
 for(const decoded of [{head:{uuid:'private-other'},actions:[{}]},{head:{uuid},actions:[]}]){
  const r=await viewerHistoryCheck({}, {nowMs,connect:async()=>({...context,call:callPage({entries:[entry]}),close(){}}),decode:async()=>decoded});assert.equal(r.ok,false);assert.equal(r.status,'record-unverified');assert.doesNotMatch(JSON.stringify(r),/private-other|10001|private-opaque/);
 }
});
