import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRetainedDuelBackup,assessRetainedBackup,validateRetainedBackupRun,BACKUP_WORKFLOW}
 from '../../../scripts/duel-retained-backup-health.mjs';

const now=Date.parse('2026-11-23T01:00:00Z');
const runId=45090000001;
const run={id:runId,name:BACKUP_WORKFLOW,status:'completed',conclusion:'success',
 repository:{full_name:'altepop/keso-gamble'},head_branch:'main'};
const artifact=(changes={})=>({
 id:101,name:'keso-duel-d1-restorable-'+runId,
 created_at:'2026-11-20T00:00:00Z',expires_at:'2026-12-20T00:00:00Z',
 expired:false,size_in_bytes:12345,workflow_run:{id:runId},...changes
});
test('distinguish available, close to expiry, expired, and missing',()=>{
 const a=selectRetainedDuelBackup([artifact()],now);
 assert.deepEqual(a,{state:'available',ok:true,artifactId:101,sourceRunId:runId,daysRemaining:26});
 assert.equal(selectRetainedDuelBackup([artifact({expires_at:'2026-11-27T00:00:00Z'})],now).state,'expiring');
 assert.equal(selectRetainedDuelBackup([artifact({expired:true})],now).state,'expired');
 assert.equal(selectRetainedDuelBackup([],now).state,'missing');
});
test('incomplete, mismatched or saturated metadata never claims a usable retained backup',()=>{
 const bad=[
 {workflow_run:{id:runId+1}},{size_in_bytes:0},{expires_at:'bad'},
 {name:'keso-duel-d1-restorable-'+runId,id:0},{created_at:'2026-11-24T00:00:00Z'}
 ];
 for(const patch of bad)assert.throws(()=>selectRetainedDuelBackup([artifact(patch)],now),/invalid/);
 assert.throws(()=>selectRetainedDuelBackup(Array.from({length:100},(_,i)=>artifact({id:i+1})),now),/saturated/);
});
test('only successful main backup workflow proves source provenance',()=>{
 assert.equal(validateRetainedBackupRun(run,runId),true);
 for(const patch of [{conclusion:'failure'},{head_branch:'feature'},{name:'other'}, {repository:{full_name:'other/repo'}}])
  assert.throws(()=>validateRetainedBackupRun({...run,...patch},runId),/not verified/);
});
test('read only exact backup workflow runs and then linked artifact list',async()=>{
 const urls=[],opts=[];
 const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'test'};
 const result=await assessRetainedBackup(env,async(url,options)=>{
  urls.push(url);opts.push(options);
  if(url.includes('/workflows/'))return {ok:true,json:async()=>({workflow_runs:[run]})};
  return {ok:true,json:async()=>({total_count:1,artifacts:[artifact()]})};
 },now);
 assert.equal(result.state,'available');
 assert.equal(urls.length,2);
 assert.match(urls[0],/\/workflows\/duel-d1-backup\.yml\/runs\?status=success&per_page=100$/);
 assert.match(urls[1],new RegExp('/runs/'+runId+'/artifacts\\?per_page=100$'));
 assert.ok(opts.every(x=>!x.method));
 assert.ok(urls.every(x=>!x.includes('cloudflare')&&!x.includes('/d1/')));
});
test('no successful backup returns missing without invented historical success',async()=>{
 const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'test'};
 const result=await assessRetainedBackup(env,async()=>({ok:true,json:async()=>({workflow_runs:[]})}),now);
 assert.equal(result.state,'missing');assert.equal(result.ok,false);
 await assert.rejects(assessRetainedBackup({...env,GITHUB_TOKEN:''}),/Authorized/);
});
