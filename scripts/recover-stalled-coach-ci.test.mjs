import {test} from 'node:test';import assert from 'node:assert/strict';
import {targetRun,canRecover,recoverStalledCoachCi} from './recover-stalled-coach-ci.mjs';
const now=Date.parse('2026-11-18T03:20:00Z');
const run={id:targetRun,head_sha:'9f0238d7a49d1ed9b9fa970c9b21321f93058cbe',head_branch:'main',event:'push',status:'in_progress',path:'.github/workflows/valorant-results.yml'};
const jobs=[{name:'check',status:'in_progress',steps:[{name:'Prepare race video verification',status:'in_progress',started_at:'2026-11-18T03:08:50Z'}]}];
test('only the exact long-stalled pre-deploy check is eligible',()=>{
 assert.equal(canRecover(run,jobs,now),true);
 for(const patch of [{id:123},{head_sha:'other'},{head_branch:'other'},{event:'pull_request'},{status:'completed'},{path:'other'}])assert.equal(canRecover({...run,...patch},jobs,now),false);
 for(const state of ['queued','in_progress','completed'])assert.equal(canRecover(run,[...jobs,{name:'deploy',status:state,conclusion:state==='completed'?'success':null}],now),false);
 assert.equal(canRecover(run,jobs,Date.parse('2026-11-18T03:10:00Z')),false);
 assert.equal(canRecover(run,[{...jobs[0],steps:[]}],now),false);
});
test('uses two reads and one scoped cancel, and never cancels a finished or changed run',async()=>{
 const requests=[];
 const request=async(url,init)=>{requests.push({url,method:init.method??'GET'});if(url.endsWith('/cancel'))return new Response(null,{status:202});return Response.json(url.includes('/jobs?')?{total_count:1,jobs}:run);};
 assert.equal((await recoverStalledCoachCi('secret',request,now)).status,'cancel-requested');
 assert.deepEqual(requests.map(r=>r.method),['GET','GET','POST']);assert.ok(requests[2].url.endsWith('/'+targetRun+'/cancel'));
 assert.equal((await recoverStalledCoachCi('secret',async()=>Response.json({...run,status:'completed'}),now)).status,'already-finished');
 assert.equal((await recoverStalledCoachCi('secret',async url=>Response.json(url.includes('/jobs?')?{total_count:2,jobs}:run),now)).status,'refused-state');
});
