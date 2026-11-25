import assert from 'node:assert/strict';
import test from 'node:test';
import {summarizeDeployGate,verifyDeploys} from '../scripts/duel-phase9-release-gate.mjs';
const sha='a'.repeat(40);
const run=(name,status,conclusion,id,event='dynamic')=>({
 name,status,conclusion,id,event,head_sha:sha,head_branch:'main',run_number:id,
});
const page=run('pages build and deployment','completed','success',20);
const worker=run('VALORANT Bot check and deploy','completed','success',30,'push');
test('P9 release gate requires both successful production workflows at identical SHA',()=>{
 assert.deepEqual(summarizeDeployGate([page,worker],sha),{state:'verified',pages:20,worker:30});
 assert.equal(summarizeDeployGate([page],sha).state,'pending');
 assert.equal(summarizeDeployGate([page,{...worker,head_sha:'b'.repeat(40)}],sha).state,'pending');
 assert.equal(summarizeDeployGate([page,{...worker,event:'pull_request'}],sha).state,'pending');
 assert.equal(summarizeDeployGate([page,{...worker,conclusion:'failure'}],sha).state,'failed');
});
test('P9 release gate only polls read-only GitHub Actions API',async()=>{
 let count=0;
 const request=async(url,config)=>{
  assert.match(url,/api.github.com\/repos\/altepop\/keso-gamble\/actions\/runs/);
  assert.equal(config.method,undefined);
  count++;
  return {ok:true,json:async()=>({workflow_runs:count===1?[page]:[page,worker]})};
 };
 const confirmed=await verifyDeploys({repo:'altepop/keso-gamble',sha,token:'fake-token',request,delay:async()=>{},iterations:3});
 assert.deepEqual(confirmed,{state:'verified',pages:20,worker:30});
 assert.equal(count,2);
});
test('P9 release gate denies incomplete SHA or other repositories',async()=>{
 await assert.rejects(verifyDeploys({repo:'other/repo',sha,token:'token'}),/invalid_release_deploy_gate/);
 await assert.rejects(verifyDeploys({repo:'altepop/keso-gamble',sha:'broken',token:'token'}),/invalid_release_deploy_gate/);
});
