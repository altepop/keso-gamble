import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildOperationsAlert,notifyOperationsAudit,OPERATIONS_ALERT_TITLE}
 from '../../../scripts/duel-scheduled-operations-alert.mjs';
const counts={staleFinishedPve:2,staleFinishedPvp:1,activePve:7,activePvp:3};
const review={state:'review',ok:true,counts,deletionAuthorized:false};
const unknown={state:'unknown',ok:false,counts:null,deletionAuthorized:false};
test('review requires positive validated aggregate stale count; never authorizes cleanup',()=>{
 const alert=buildOperationsAlert(review);
 assert.equal(alert.title,OPERATIONS_ALERT_TITLE);
 assert.match(alert.body,/PvE 90日超の終了済み記録: 2/);
 assert.match(alert.body,/自動削除・自動復旧/);
 assert.doesNotMatch(alert.body,/user_id|match_id|guild_id/);
 assert.equal(buildOperationsAlert({...review,counts:{...counts,staleFinishedPve:0,staleFinishedPvp:0}}),null);
 assert.equal(buildOperationsAlert({...review,counts:{...counts,staleFinishedPve:-1}}),null);
 assert.equal(buildOperationsAlert({...review,deletionAuthorized:true}),null);
 assert.equal(buildOperationsAlert({...review,counts:null}),null);
});
test('unknown reports monitoring uncertainty, not confirmed missing data',()=>{
 const alert=buildOperationsAlert(unknown);
 assert.match(alert.body,/監査未実施・判定失敗の可能性/);
 assert.match(alert.body,/未確認/);
 assert.equal(buildOperationsAlert({state:'healthy',ok:true,deletionAuthorized:false}),null);
 assert.equal(buildOperationsAlert({state:'unknown',ok:true,deletionAuthorized:false}),null);
});
async function withReport(report,fn){
 const dir=mkdtempSync(join(tmpdir(),'duel-operations-alert-'));
 const file=join(dir,'report.json');
 if(report!==null)writeFileSync(file,JSON.stringify(report));
 try{return await fn({GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture',DUEL_OPERATIONS_AUDIT_REPORT:file});}
 finally{rmSync(dir,{recursive:true,force:true});}
}
test('healthy result generates no GitHub request',async()=>{
 await withReport({state:'healthy',ok:true,deletionAuthorized:false},async env=>{
  assert.equal(await notifyOperationsAudit(env,()=>{throw Error('unexpected network');}),'healthy');
 });
});
test('review creates one deduplicated GitHub issue; metadata only',async()=>{
 await withReport(review,async env=>{
  const calls=[];
  const request=async(url,opts)=>{
   calls.push({url,opts});
   return {ok:true,json:async()=>opts.method==='POST'?{number:35}:[]};
  };
  assert.equal(await notifyOperationsAudit(env,request),'created');
  assert.deepEqual(calls.map(c=>c.opts.method??'GET'),['GET','POST']);
  assert.equal(JSON.parse(calls[1].opts.body).title,OPERATIONS_ALERT_TITLE);
  assert.ok(calls.every(c=>c.url.startsWith('https://api.github.com/repos/altepop/keso-gamble/')));
  assert.equal(await notifyOperationsAudit(env,async()=>({ok:true,json:async()=>[{title:OPERATIONS_ALERT_TITLE}]})),'deduplicated');
 });
});
test('malformed or missing report becomes unknown; API errors and saturation fail closed',async()=>{
 await withReport(null,async env=>{
  assert.equal(await notifyOperationsAudit(env,async(url,opts)=>({
   ok:true,json:async()=>opts.method==='POST'?{number:5}:[]
  })),'created');
  await assert.rejects(notifyOperationsAudit(env,async()=>({ok:false,status:403})),/403/);
  await assert.rejects(notifyOperationsAudit(env,async()=>({ok:true,json:async()=>Array.from({length:100},(_,i)=>({number:i+1,title:'unrelated'}))})),/saturated/);
 });
 await withReport(review,async env=>{
  await assert.rejects(notifyOperationsAudit({...env,GITHUB_REPOSITORY:'wrong'},()=>{throw Error('network');}),/Authorized/);
 });
});
