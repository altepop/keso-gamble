import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeManualOperations,hashManualOperations,collectManualOperations}
 from '../../../scripts/duel-manual-operations-audit.mjs';
const now=Date.parse('2026-11-23T09:00:00Z');
const row=(o={})=>({id:123,name:'P12 duel retained ciphertext recovery drill',
 event:'workflow_dispatch',head_sha:'a'.repeat(40),
 actor:{login:'altepop'},created_at:'2026-11-23T08:00:00Z',
 status:'completed',conclusion:'success',...o});
test('sanitize selected manual workflow metadata and mark approval as unverified',()=>{
 const a=summarizeManualOperations([row(),row({id:124,actor:{login:'operator-2'},name:'P12 duel D1 encrypted backup and isolated restore'})],now);
 assert.equal(a.entries.length,2);
 assert.equal(a.unexpectedActorCount,1);
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
  {created_at:'2026-11-24T09:00:00Z'},{status:'completed',conclusion:null}
 ])assert.throws(()=>summarizeManualOperations([row(bad)],now),/malformed/);
 assert.throws(()=>summarizeManualOperations(Array.from({length:100},()=>row()),now),/bounded/);
});
test('strict GitHub read-only GET and no untrusted fields emitted',async()=>{
 let request;
 const env={GITHUB_TOKEN:'test',GITHUB_REPOSITORY:'altepop/keso-gamble'};
 const a=await collectManualOperations(env,async(url,options)=>{
  request={url,options};return {ok:true,json:async()=>({workflow_runs:[row({token:'private',user_id:123,secret:'never log'})]})};
 },now);
 assert.equal(a.entries.length,1);
 assert.doesNotMatch(JSON.stringify(a),/private|never log|token/);
 assert.equal(request.options.method,undefined);
 assert.match(request.url,/\/actions\/runs\?event=workflow_dispatch&per_page=100$/);
 await assert.rejects(collectManualOperations({...env,GITHUB_TOKEN:''}),/Authorized/);
 await assert.rejects(collectManualOperations(env,async()=>({ok:false,status:500})),/HTTP 500/);
});
