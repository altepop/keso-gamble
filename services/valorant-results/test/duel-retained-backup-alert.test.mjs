import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildBackupAlert,notifyBackupRetention,BACKUP_ALERT_TITLE}
 from '../../../scripts/duel-retained-backup-alert.mjs';

const report=(state,ok=false)=>({state,ok,artifactId:42,sourceRunId:9,daysRemaining:3});
test('only confirmed report anomalies trigger alert; untrusted text excluded',()=>{
 for(const state of ['missing','expired','expiring','unknown']){
  const a=buildBackupAlert(report(state));
  assert.equal(a.title,BACKUP_ALERT_TITLE);
  assert.match(a.body,new RegExp('判定: '+state));
 }
 assert.equal(buildBackupAlert(report('available',true)),null);
 assert.equal(buildBackupAlert(report('available',false)),null);
 assert.equal(buildBackupAlert(report('failed')),null);
 assert.equal(buildBackupAlert({state:'missing',ok:true}),null);
 assert.equal(buildBackupAlert(null),null);
 assert.ok(!buildBackupAlert({...report('unknown'),error:'secret-token'}).body.includes('secret-token'));
});
async function fixture(r,fn){
 const dir=mkdtempSync(join(tmpdir(),'duel-backup-alert-'));
 const path=join(dir,'report.json');writeFileSync(path,JSON.stringify(r));
 const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'test',DUEL_BACKUP_REPORT:path};
 try{return await fn(env);}finally{rmSync(dir,{recursive:true,force:true});}
}
test('healthy report performs zero HTTP writes or reads',async()=>{
 await fixture(report('available',true),async env=>{
  assert.equal(await notifyBackupRetention(env,()=>{throw Error('unexpected network');}),'healthy');
 });
});
test('missing backup creates one issue after checking open issues',async()=>{
 await fixture(report('missing'),async env=>{
  const calls=[];
  const req=async(url,opts)=>{
   calls.push({url,method:opts.method??'GET',body:opts.body});
   if(opts.method==='POST')return {ok:true,json:async()=>({number:123})};
   return {ok:true,json:async()=>([])};
  };
  assert.equal(await notifyBackupRetention(env,req),'created');
  assert.equal(calls.length,2);
  assert.equal(calls[0].method,'GET');assert.equal(calls[1].method,'POST');
  const body=JSON.parse(calls[1].body);
  assert.equal(body.title,BACKUP_ALERT_TITLE);
  assert.ok(!calls.some(c=>/cloudflare|d1|discord/i.test(c.url)));
 });
});
test('deduplicate only non-PR open issue with matching title',async()=>{
 await fixture(report('expired'),async env=>{
  const calls=[];
  const req=async(url,opts)=>{
   calls.push(opts.method??'GET');
   return {ok:true,json:async()=>([{title:BACKUP_ALERT_TITLE,number:2}])};
  };
  assert.equal(await notifyBackupRetention(env,req),'deduplicated');
  assert.deepEqual(calls,['GET']);
 });
});
test('saturated list and API failures fail closed; do not create issue',async()=>{
 await fixture(report('unknown'),async env=>{
  const full=Array.from({length:100},(_,i)=>({title:'unrelated '+i,number:i+1}));
  const req=async()=>({ok:true,json:async()=>full});
  await assert.rejects(notifyBackupRetention(env,req),/saturated/);
  await assert.rejects(notifyBackupRetention(env,async()=>({ok:false,status:403})),/HTTP 403/);
  await assert.rejects(notifyBackupRetention({...env,GITHUB_REPOSITORY:'other/repo'},req),/Authorized/);
 });
});
