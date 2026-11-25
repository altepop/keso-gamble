import test from 'node:test';
import assert from 'node:assert/strict';
import {artifactName,parseBackupRunId,validateBackupRun,validateRetainedDrillArtifact,inspectBackupRun,DUEL_BACKUP_WORKFLOW}
 from '../../../scripts/duel-recovery-drill-source.mjs';
const id=45064505226;
const now=Date.parse('2026-11-23T02:00:00Z');
const artifact={id:333,name:'keso-duel-d1-restorable-'+id,size_in_bytes:4096,expired:false,
 created_at:'2026-11-20T02:00:00Z',expires_at:'2026-12-20T02:00:00Z',workflow_run:{id}};
const inventory={total_count:1,artifacts:[artifact]};
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
test('retained source requires exact unexpired nonempty ciphertext artifact',()=>{
 const result=validateRetainedDrillArtifact(inventory,id,now);
 assert.equal(result.artifactId,333);
 assert.equal(result.bytes,4096);
 for(const mutation of [
  {expired:true},{size_in_bytes:0},{name:'unrelated'},
  {id:0},{created_at:'bad'},{expires_at:'2026-11-22T02:00:00Z'},
  {workflow_run:{id:id+1}},{created_at:'2026-11-24T02:00:00Z'}
 ])assert.throws(()=>validateRetainedDrillArtifact({total_count:1,artifacts:[{...artifact,...mutation}]},id,now),/retained ciphertext|metadata/i);
 for(const bad of [
  {total_count:0,artifacts:[]},{total_count:2,artifacts:[artifact]},
  {total_count:2,artifacts:[artifact,artifact]},
  {total_count:100,artifacts:Array(100).fill(artifact)}
 ])assert.throws(()=>validateRetainedDrillArtifact(bad,id,now),/retained artifact|retained ciphertext|inventory/i);
});
test('source provenance checks run THEN artifact via read-only bounded GitHub requests',async()=>{
 const urls=[];
 const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture-token',DUEL_BACKUP_RUN_ID:String(id)};
 const query=async(url,options)=>{
  urls.push(url);assert.equal(options.method,undefined);
  return {ok:true,json:async()=>url.endsWith('/artifacts?per_page=100')?inventory:run};
 };
 const data=await inspectBackupRun(env,query,now);
 assert.equal(data.artifact,artifactName(id));
 assert.equal(data.artifactId,333);
 assert.deepEqual(urls,[
  'https://api.github.com/repos/altepop/keso-gamble/actions/runs/'+id,
  'https://api.github.com/repos/altepop/keso-gamble/actions/runs/'+id+'/artifacts?per_page=100'
 ]);
 await assert.rejects(inspectBackupRun({...env,GITHUB_TOKEN:''}),/permission/);
 await assert.rejects(inspectBackupRun(env,async()=>({ok:false,status:404}),now),/HTTP 404/);
 await assert.rejects(inspectBackupRun(env,async(url)=>({ok:true,json:async()=>url.endsWith('/artifacts?per_page=100')?{total_count:0,artifacts:[]}:run}),now),/missing/);
});
