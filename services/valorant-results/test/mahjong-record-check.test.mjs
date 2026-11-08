import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';
import {recordCheck,RECORD_CHECK_SQL} from '../scripts/mahjong-review-live-audit.mjs';
const uuid='261108-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
test('single-record check makes one SELECT, one decode and closes the session without exposing the ID',async()=>{
 let reads=0,logins=0,decodes=0,closed=0;
 const result=await recordCheck({}, {query:async(sql,params)=>{reads++;assert.equal(sql,RECORD_CHECK_SQL);assert.deepEqual(params,[]);return Array(10).fill({paipu:uuid});},connect:async()=>{logins++;return {close(){closed++;}};},decode:async(_session,id)=>{decodes++;assert.equal(id,uuid);return {head:{uuid},actions:[{private:'private-hand'}]};}});
 assert.deepEqual(result,{ok:true,status:'record-read',recordRequests:1,headUuidMatches:true,actionCount:1});assert.equal(reads,1);assert.equal(logins,1);assert.equal(decodes,1);assert.equal(closed,1);assert.doesNotMatch(JSON.stringify(result),/aaaaaaaa|private-hand/);
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
 for(const [args,expected] of [[['--record-check'],/unavailable_credentials/],[['--record-check','--delivery'],/audit_mode_conflict/]]){
  const r=spawnSync(process.execPath,[script,...args],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:10000});assert.equal(r.status,1,r.stderr);assert.match(r.stdout+r.stderr,expected);assert.doesNotMatch(r.stdout+r.stderr,/private-token|Error:/);
 }
});
