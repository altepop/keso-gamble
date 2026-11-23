import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildHeartbeatAlert,HEARTBEAT_ALERT_TITLE,notifyHeartbeat}
 from '../../../scripts/duel-monitor-heartbeat-alert.mjs';

test('alert is permitted only for actual heartbeat anomalies',()=>{
 for(const state of ['missing','stale','stalled','failed','unknown']){
  const alert=buildHeartbeatAlert({state,ok:false,runId:21,ageMinutes:246});
  assert.equal(alert.title,HEARTBEAT_ALERT_TITLE);assert.match(alert.body,new RegExp(state));
 }
 for(const state of ['healthy','running','pending']){
  assert.equal(buildHeartbeatAlert({state,ok:false}),null);
 }
 assert.equal(buildHeartbeatAlert({state:'failed',ok:true}),null);
 assert.equal(buildHeartbeatAlert(null),null);
});
test('untrusted run ID and time are excluded from issue body',()=>{
 const alert=buildHeartbeatAlert({ok:false,state:'stale',runId:'secret',ageMinutes:'sensitive'});
 assert.ok(alert);assert.doesNotMatch(alert.body,/secret|sensitive/);
 assert.match(alert.body,/不明/);
});
test('one issue at most, deduplicated and no D1 or discord access',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'heartbeat-alert-'));
 try{
  const file=join(dir,'report.json');
  writeFileSync(file,JSON.stringify({ok:false,state:'missing',runId:null,ageMinutes:null}));
  const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture',DUEL_HEARTBEAT_REPORT:file};
  const calls=[];
  const fetcher=async(url,options)=>{
   calls.push({url,options});
   if(url.includes('?state=open'))return {ok:true,json:async()=>[]};
   return {ok:true,json:async()=>({number:42})};
  };
  assert.equal(await notifyHeartbeat(env,fetcher),'created');
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.method,undefined);
  assert.equal(calls[1].options.method,'POST');
  assert.match(calls[1].url,/\/issues$/);
  assert.doesNotMatch(calls[1].url,/cloudflare|discord|d1/i);
  assert.equal(JSON.parse(calls[1].options.body).title,HEARTBEAT_ALERT_TITLE);
  assert.equal(await notifyHeartbeat(env,async()=>({ok:true,json:async()=>[{title:HEARTBEAT_ALERT_TITLE,number:1}]})),'deduplicated');
  writeFileSync(file,JSON.stringify({ok:true,state:'healthy'}));
  assert.equal(await notifyHeartbeat(env,async()=>{throw Error('should not call')}),'healthy');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('missing report is actionable unknown, API failure still fails closed',async()=>{
 const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture',DUEL_HEARTBEAT_REPORT:'/missing/file.json'};
 const calls=[];
 assert.equal(await notifyHeartbeat(env,async(url,opts)=>{
  calls.push({url,opts});
  return {ok:true,json:async()=>opts.method==='POST'?{number:43}:[]};
 }),'created');
 assert.equal(calls.length,2);
 assert.match(JSON.parse(calls[1].opts.body).body,/判定: unknown/);
 await assert.rejects(notifyHeartbeat(env,async()=>({ok:false,status:403})),/HTTP 403/);
 await assert.rejects(notifyHeartbeat({...env,GITHUB_REPOSITORY:'different'}),/authorized/);
});

test('unknown state explicitly disclaims deployment failure',()=>{
 const alert=buildHeartbeatAlert({state:'unknown',ok:false,runId:null,ageMinutes:null});
 assert.match(alert.body,/判定できない/);
 assert.match(alert.body,/断定しない/);
 assert.doesNotMatch(alert.body,/Bearer|token|credential/i);
});
