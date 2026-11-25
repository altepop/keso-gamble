import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeManualOperations,hashManualOperations,collectManualOperations}
 from '../../../scripts/duel-manual-operations-audit.mjs';
const now=Date.parse('2026-11-23T09:00:00Z');
const row=(o={})=>({id:123,name:'P12 duel retained ciphertext recovery drill',
 event:'workflow_dispatch',head_sha:'a'.repeat(40),
 actor:{login:'altepop'},repository:{full_name:'altepop/keso-gamble'},head_branch:'main',created_at:'2026-11-23T08:00:00Z',
 status:'completed',conclusion:'success',...o});
test('sanitize selected manual workflow metadata and mark approval as unverified',()=>{
 const a=summarizeManualOperations([row(),row({id:124,actor:{login:'operator-2'},name:'P12 duel D1 encrypted backup and isolated restore'})],now);
 assert.equal(a.entries.length,2);
 assert.equal(a.unexpectedActorCount,1);
 assert.equal(a.nonMainCount,0);
 assert.equal(a.schema,'duel-manual-operations-audit-v2');
 assert.equal(a.approvalsVerified,false);
 assert.equal(a.allAdminActionsCovered,false);
 assert.match(hashManualOperations(a),/^[a-f0-9]{64}$/);
});
test('ignore automatic jobs, unrelated workflows and records outside 24h',()=>{
 const a=summarizeManualOperations([
  row({event:'push'}),row({name:'private unknown workflow'}),row({created_at:'2026-11-21T08:00:00Z'})
 ],now);
 assert.equal(a.entries.length,0);
});
test('malformed critical manually triggered events fail closed',()=>{
 for(const bad of [
  {id:0},{head_sha:'abc'},{actor:{login:'!'}},{created_at:'n/a'},
  {repository:{full_name:'other/repo'}},{head_branch:'bad branch'},
  {created_at:'2026-11-24T09:00:00Z'},{status:'completed',conclusion:null}
 ])assert.throws(()=>summarizeManualOperations([row(bad)],now),/malformed/);
 assert.throws(()=>summarizeManualOperations(Array.from({length:100},()=>row()),now),/bounded/);
});
test('strict GitHub read-only GET and no untrusted fields emitted',async()=>{
 let request;
 const env={GITHUB_TOKEN:'test',GITHUB_REPOSITORY:'altepop/keso-gamble'};
 const a=await collectManualOperations(env,async(url,options)=>{
  request={url,options};return {ok:true,json:async()=>({total_count:1,workflow_runs:[row({token:'private',user_id:123,secret:'never log'})]})};
 },now);
 assert.equal(a.entries.length,1);
 assert.doesNotMatch(JSON.stringify(a),/private|never log|token/);
 assert.equal(request.options.method,undefined);
 const parsed=new URL(request.url);
 assert.equal(parsed.pathname,'/repos/altepop/keso-gamble/actions/runs');
 assert.equal(parsed.searchParams.get('event'),'workflow_dispatch');
 assert.equal(parsed.searchParams.get('per_page'),'100');
 assert.equal(parsed.searchParams.get('created'),'2026-11-22T09:00:00.000Z..2026-11-23T09:00:00.000Z');
 await assert.rejects(collectManualOperations({...env,GITHUB_TOKEN:''}),/Authorized/);
 await assert.rejects(collectManualOperations(env,async()=>({ok:false,status:500})),/HTTP 500/);
});

test('new critical workflows are covered; branch deviations remain visible',()=>{
 const added=[
  'P12 duel deployment health (read-only)',
  'P12 duel retained encrypted backup readiness',
  'P12 duel retained backup schedule watchdog',
  'P12 duel critical manual operations evidence'
 ];
 const rows=added.map((name,i)=>row({name,id:220+i,head_branch:i===1?'feature/audit':'main'}));
 const audit=summarizeManualOperations(rows,now);
 assert.equal(audit.entries.length,added.length);
 assert.equal(audit.nonMainCount,1);
 assert.equal(audit.entries.find(x=>x.branch==='feature/audit')?.expectedMain,false);
 assert.equal(audit.coveredWorkflowNames.length,9);
 assert.equal(audit.allAdminActionsCovered,false);
});
test('automated workflow runs of newly covered types never masquerade as manual actions',()=>{
 const audit=summarizeManualOperations([
  row({name:'P12 duel retained backup schedule watchdog',event:'schedule'}),
  row({name:'P12 duel retained encrypted backup readiness',event:'push'}),
  row({name:'P12 duel critical manual operations evidence',event:'pull_request'})
 ],now);
 assert.equal(audit.entries.length,0);
});

test('real Nov 24 saturated historical inventory is narrowed before safety cap',async()=>{
 const at=Date.parse('2026-11-24T06:25:03Z');
 const actualWindowRow=row({created_at:'2026-11-24T00:50:06Z'});
 const result=await collectManualOperations({GITHUB_TOKEN:'fixture',GITHUB_REPOSITORY:'altepop/keso-gamble'},async url=>{
  const range=new URL(url).searchParams.get('created');
  assert.equal(range,'2026-11-23T06:25:03.000Z..2026-11-24T06:25:03.000Z');
  return {ok:true,json:async()=>({total_count:1,workflow_runs:[actualWindowRow]})};
 },at);
 assert.equal(result.entries.length,1);
 assert.equal(result.approvalsVerified,false);
});
test('filtered response saturation or incomplete count fails closed',async()=>{
 const env={GITHUB_TOKEN:'fixture',GITHUB_REPOSITORY:'altepop/keso-gamble'};
 for(const payload of [{total_count:101,workflow_runs:[row()]},{total_count:100,workflow_runs:Array.from({length:100},(_,i)=>row({id:i+1}))},{workflow_runs:[]},{total_count:0,workflow_runs:[row()]}]){
  await assert.rejects(collectManualOperations(env,async()=>({ok:true,json:async()=>payload}),now),/bounded|incomplete|invalid/);
 }
 const empty=await collectManualOperations(env,async()=>({ok:true,json:async()=>({total_count:0,workflow_runs:[]})}),now);
 assert.equal(empty.entries.length,0);
});
