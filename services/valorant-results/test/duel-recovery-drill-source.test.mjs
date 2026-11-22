import test from 'node:test';
import assert from 'node:assert/strict';
import {artifactName,parseBackupRunId,validateBackupRun,inspectBackupRun,DUEL_BACKUP_WORKFLOW}
 from '../../../scripts/duel-recovery-drill-source.mjs';
const id=45064505226;
const run={id,name:DUEL_BACKUP_WORKFLOW,conclusion:'success',status:'completed',
 repository:{full_name:'altepop/keso-gamble'},head_branch:'main',head_sha:'a'.repeat(40)};
test('run ID is a bounded positive integer; artifact name is fixed',()=>{
 assert.equal(parseBackupRunId(String(id)),id);
 assert.equal(artifactName(id),'keso-duel-d1-restorable-'+id);
 for(const bad of ['', '0', '-1','12.5','5; rm -rf /','00023','9999999999999999',' 123','01'])
  assert.throws(()=>parseBackupRunId(bad),/Invalid/);
});
test('only the successful production backup workflow may be used',()=>{
 assert.deepEqual(validateBackupRun(run,id),{runId:id,artifact:artifactName(id),headSha:'a'.repeat(40)});
 for(const mutation of [
  {name:'Other workflow'},{conclusion:'failure'},{status:'in_progress'},
  {head_branch:'feature'},{head_sha:'bad'},{repository:{full_name:'somebody/other'}},{id:id+1}
 ])assert.throws(()=>validateBackupRun({...run,...mutation},id),/not an approved/);
});
test('source metadata uses bounded GET and fails closed on HTTP errors',async()=>{
 let requestInfo;
 const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture-token',DUEL_BACKUP_RUN_ID:String(id)};
 const data=await inspectBackupRun(env,async(url,options)=>{
  requestInfo={url,options};return {ok:true,json:async()=>run};
 });
 assert.equal(data.artifact,artifactName(id));
 assert.equal(requestInfo.options.method,undefined);
 assert.match(requestInfo.url,/\/actions\/runs\/45064505226$/);
 await assert.rejects(inspectBackupRun({...env,GITHUB_TOKEN:''}),/permission/);
 await assert.rejects(inspectBackupRun(env,async()=>({ok:false,status:404})),/HTTP 404/);
});
