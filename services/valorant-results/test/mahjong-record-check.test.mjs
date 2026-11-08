import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';
import {recordCheck,RECORD_CHECK_SQL,OWN_RECORD_CHECK_SQL} from '../scripts/mahjong-review-live-audit.mjs';
const uuid='261108-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
test('single-record check makes one SELECT, one decode and closes the session without exposing the ID',async()=>{
 let reads=0,logins=0,decodes=0,closed=0;
 const result=await recordCheck({}, {query:async(sql,params)=>{reads++;assert.equal(sql,RECORD_CHECK_SQL);assert.deepEqual(params,[]);return Array(10).fill({paipu:uuid});},connect:async()=>{logins++;return {close(){closed++;}};},decode:async(_session,id)=>{decodes++;assert.equal(id,uuid);return {head:{uuid},actions:[{private:'private-hand'}]};}});
 assert.deepEqual(result,{ok:true,status:'record-read',recordRequests:1,headUuidMatches:true,actionCount:1,sessionContext:{gameConnectionPresent:null,viewerParticipated:null}});assert.equal(reads,1);assert.equal(logins,1);assert.equal(decodes,1);assert.equal(closed,1);assert.doesNotMatch(JSON.stringify(result),/aaaaaaaa|private-hand/);
});
test('RPC 540 is reported once with safe diagnostics, never retried or called a successful read',async()=>{
 let decodes=0,closed=0;
 const error=Error('fetchGameRecord_540');error.rpcDiagnostic={requestDecoded:true,gameUuidPreserved:true,clientVersionPreserved:true,jsonParamPresent:false,numberParamCount:0,stringParamCount:0,secret:'private-token'};
 const result=await recordCheck({}, {query:async()=>[{paipu:uuid},{paipu:uuid}],connect:async()=>({close(){closed++;}}),decode:async()=>{decodes++;throw error;}});
 assert.equal(result.ok,false);assert.equal(result.recordRequests,1);assert.equal(result.diagnostic.code,'audit_rpc_fetchGameRecord_540');assert.equal(result.diagnostic.phase,'record');assert.equal(result.diagnostic.rpc.gameUuidPreserved,true);assert.equal(decodes,1);assert.equal(closed,1);assert.doesNotMatch(JSON.stringify(result),/aaaaaaaa|private-token|secret/);
});
test('empty or malformed records stop before logging in; login errors cannot cause a record request',async()=>{
 let logins=0;for(const rows of [[],[{paipu:'private-invalid'}]]){const r=await recordCheck({}, {query:async()=>rows,connect:async()=>{logins++;throw Error('must not connect');}});assert.equal(r.ok,false);assert.equal(r.recordRequests,0);}assert.equal(logins,0);
 const r=await recordCheck({}, {query:async()=>[{paipu:uuid}],connect:async()=>{throw Error('private-token');},decode:async()=>{throw Error('must not decode');}});assert.equal(r.ok,false);assert.equal(r.recordRequests,0);assert.equal(r.diagnostic.phase,'login');assert.doesNotMatch(JSON.stringify(r),/private-token/);
});
test('mismatched returned ID or missing actions cannot be reported as a successful read',async()=>{
 for(const decoded of [{head:{uuid:'private-other'},actions:[{}]},{head:{uuid},actions:[]}]){const r=await recordCheck({}, {query:async()=>[{paipu:uuid}],connect:async()=>({close(){}}),decode:async()=>decoded});assert.equal(r.ok,false);assert.equal(r.status,'record-unverified');assert.doesNotMatch(JSON.stringify(r),/private-other/);}
});
test('single-record SQL searches only the bounded recent rowid window and returns at most one row',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE kp_mahjong_paipu(paipu TEXT,summary TEXT)');
 const put=db.prepare('INSERT INTO kp_mahjong_paipu VALUES(?,?)');put.run(uuid,'{}');for(let i=0;i<64;i++)put.run('pending-'+i,null);
 assert.deepEqual(db.prepare(RECORD_CHECK_SQL).all(),[]);put.run(uuid,'{}');assert.equal(db.prepare(RECORD_CHECK_SQL).all().length,1);assert.match(RECORD_CHECK_SQL,/LIMIT 1$/);db.close();
});
test('one-record CLI fails closed without credentials and rejects conflicting modes before any access',()=>{
 const script=new URL('../scripts/mahjong-review-live-audit.mjs',import.meta.url).pathname;
 for(const [args,expected] of [[['--record-check'],/unavailable_credentials/],[['--own-record-check'],/unavailable_credentials/],[['--record-check','--own-record-check'],/audit_mode_conflict/],[['--record-check','--delivery'],/audit_mode_conflict/]]){
  const r=spawnSync(process.execPath,[script,...args],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:10000});assert.equal(r.status,1,r.stderr);assert.match(r.stdout+r.stderr,expected);assert.doesNotMatch(r.stdout+r.stderr,/private-token|Error:/);
 }
});

test('single record check returns only game-connection presence and viewer membership on failure',async()=>{
 const {attachLoginContext}=await import('../scripts/mahjong-rpc-diagnostics.mjs');
 let calls=0;
 const result=await recordCheck({}, {query:async()=>[{paipu:uuid,summary:JSON.stringify({seats:[{accountId:10001},{accountId:10002},{accountId:10003}]})}],connect:async()=>attachLoginContext({close(){}},{account:{account_id:10001},game_info:{game_uuid:'private-active-game',connect_token:'private-token'}}),decode:async()=>{calls++;throw Error('fetchGameRecord_540');}});
 assert.equal(calls,1);assert.deepEqual(result.sessionContext,{gameConnectionPresent:true,viewerParticipated:true});assert.doesNotMatch(JSON.stringify(result),/10001|10002|10003|private-active|private-token/);
});

test('own-record mode binds only the authenticated viewer ID and verifies membership before fetching',async()=>{
 const order=[],viewer=10001,seats=[{accountId:viewer},{accountId:10002},{accountId:10003}];
 const result=await recordCheck({}, {ownRecord:true,connect:async()=>{order.push('login');return {viewerAccountId:viewer,gameConnectionPresent:false,close(){order.push('close');}};},query:async(sql,params)=>{order.push('query');assert.equal(sql,OWN_RECORD_CHECK_SQL);assert.deepEqual(params,[viewer]);assert.doesNotMatch(sql,/10001/);return [{paipu:uuid,summary:JSON.stringify({seats})}];},decode:async()=>{order.push('record');return {head:{uuid},actions:[{}]};}});
 assert.deepEqual(order,['login','query','record','close']);assert.equal(result.ok,true);assert.deepEqual(result.sessionContext,{gameConnectionPresent:false,viewerParticipated:true});assert.doesNotMatch(JSON.stringify(result),/10001|aaaaaaaa/);
});
test('own-record mode never substitutes another player record when history or identity is unavailable',async()=>{
 for(const viewer of [undefined,0,'private-id',10001]){
  let reads=0,decodes=0,closed=0;
  const result=await recordCheck({}, {ownRecord:true,connect:async()=>({viewerAccountId:viewer,close(){closed++;}}),query:async()=>{reads++;return [];},decode:async()=>{decodes++;throw Error('must not fetch');}});
  assert.equal(result.ok,false);assert.equal(result.recordRequests,0);assert.equal(decodes,0);assert.equal(closed,1);assert.equal(reads,viewer===10001?1:0);assert.equal(result.status,viewer===10001?'no-own-record':'viewer-unknown');
 }
});
test('own-record mode refuses malformed or nonmatching membership even if a query returns it',async()=>{
 for(const summary of ['invalid-json',JSON.stringify({seats:[{accountId:10002},{accountId:10003},{accountId:10004}]})]){
  let decodes=0;const result=await recordCheck({}, {ownRecord:true,connect:async()=>({viewerAccountId:10001,close(){}}),query:async()=>[{paipu:uuid,summary}],decode:async()=>{decodes++;}});assert.equal(result.ok,false);assert.equal(result.status,'own-record-unverified');assert.equal(decodes,0);
 }
});
test('own-record SQL stays within 64 rows, tolerates malformed JSON and selects only bound membership',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE kp_mahjong_paipu(paipu TEXT,summary TEXT)');const put=db.prepare('INSERT INTO kp_mahjong_paipu VALUES(?,?)');
 const summary=JSON.stringify({seats:[{accountId:10001},{accountId:10002},{accountId:10003}]});put.run(uuid,summary);for(let i=0;i<64;i++)put.run('pending-'+i,null);
 assert.deepEqual(db.prepare(OWN_RECORD_CHECK_SQL).all(10001),[]);put.run('bad','invalid-json');put.run(uuid,summary);
 assert.equal(db.prepare(OWN_RECORD_CHECK_SQL).all(10001).length,1);assert.deepEqual(db.prepare(OWN_RECORD_CHECK_SQL).all(10004),[]);db.close();
});
