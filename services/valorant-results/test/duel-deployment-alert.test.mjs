import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDeploymentAlert,buildMonitorUnavailableAlert,isCoherentDeploymentReport,notifyDeploymentAnomaly,ALERT_TITLE,MONITOR_UNAVAILABLE_TITLE} from '../../../scripts/duel-deployment-alert.mjs';
const healthy={name:'Pages',state:'healthy',runId:1,sha:'0c817d444f31e19ae1fd12c6267c99aa8f199b90'};
const failed={name:'Worker',state:'failed',runId:2,sha:'0c817d444f31e19ae1fd12c6267c99aa8f199b90'};
test('actionable failed Worker creates one minimal, sanitized issue draft',()=>{
 const result=buildDeploymentAlert({ok:false,results:[healthy,failed]});
 assert.equal(result.title,ALERT_TITLE);assert.match(result.body,/Worker: failed/);
 assert.match(result.body,/run 2/);assert.doesNotMatch(result.body,/discord|Cloudflare API token/i);
});
test('healthy, pending, malformed and untrusted reports never alert',()=>{
 assert.equal(buildDeploymentAlert({ok:true,results:[healthy,{...failed,state:'healthy'}]}),null);
 assert.equal(buildDeploymentAlert({ok:true,results:[healthy,{...failed,state:'pending'}]}),null);
 assert.equal(buildDeploymentAlert({ok:false,results:[]}),null);
 assert.equal(buildDeploymentAlert({ok:false,results:[healthy,{...failed,name:'Pages'}]}),null);
 assert.equal(buildDeploymentAlert(null),null);
});
test('run IDs and SHAs are sanitized, no user-supplied text reaches issue body',()=>{
 const a=buildDeploymentAlert({ok:false,results:[healthy,{...failed,runId:'<token>',sha:'private-secret'}]});
 assert.ok(a);assert.doesNotMatch(a.body,/token|private-secret/);
 assert.match(a.body,/run -, SHA -/);
});
test('stalled and missing production deployment are actionable, but not transient pending',()=>{
 for(const state of ['stalled','missing','invalid-timestamp'])assert.ok(buildDeploymentAlert({ok:false,results:[healthy,{...failed,state}]}));
 assert.equal(buildDeploymentAlert({ok:false,results:[healthy,{...failed,state:'pending'}]}),null);
});

test('monitor report absence has its own sanitized alert, not a claimed deployment failure',()=>{
 const result=buildMonitorUnavailableAlert();
 assert.equal(result.title,MONITOR_UNAVAILABLE_TITLE);
 assert.match(result.body,/監視自体の異常/);
 assert.match(result.body,/配備失敗を意味しない/);
 assert.doesNotMatch(result.body,/token|webhook|秘密/i);
 assert.notEqual(result.title,ALERT_TITLE);
});

test('well-formed deployment reports must match names, states and reported success',()=>{
 const good={ok:true,results:[healthy,{...failed,state:'pending'}]};
 assert.equal(isCoherentDeploymentReport(good),true);
 assert.equal(isCoherentDeploymentReport({ok:false,results:[healthy,failed]}),true);
 for(const invalid of [
  {ok:false,results:[healthy,{...failed,state:'healthy'}]},
  {ok:true,results:[healthy,failed]},
  {ok:true,results:[healthy,{...failed,state:'unrecognized'}]},
  {ok:true,results:[healthy,{...failed,name:'Pages'}]},
  {ok:true,results:[healthy]},
  {ok:'true',results:[healthy,{...failed,state:'healthy'}]},
  {ok:false,results:[healthy,{...failed,state:'pending'}]}
 ])assert.equal(isCoherentDeploymentReport(invalid),false);
});

test('syntactically valid inconsistent report opens monitor-unavailable issue, not a false deployment failure',async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
 const {join}=await import('node:path');
 const {tmpdir}=await import('node:os');
 const dir=mkdtempSync(join(tmpdir(),'duel-deployment-report-'));
 try{
  const path=join(dir,'report.json');
  writeFileSync(path,JSON.stringify({ok:true,results:[healthy,failed]}));
  const calls=[];
  const request=async(url,opts)=>{
   calls.push({url,opts});
   return {ok:true,json:async()=>opts.method==='POST'?{number:83}:[]};
  };
  await notifyDeploymentAnomaly({
   DUEL_WATCH_REPORT:path,GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture'
  },request);
  assert.deepEqual(calls.map(x=>x.opts.method||'GET'),['GET','POST']);
  const alert=JSON.parse(calls[1].opts.body);
  assert.equal(alert.title,MONITOR_UNAVAILABLE_TITLE);
  assert.match(alert.body,/配備失敗を意味しない/);
  assert.doesNotMatch(alert.body,/private-secret|token/i);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
