import test from 'node:test';
import assert from 'node:assert/strict';
import {decideAuditFallback,checkAuditFallback} from '../../../scripts/duel-operations-audit-fallback.mjs';
const now=Date.parse('2026-11-23T22:21:00Z');
const run=(status='completed',conclusion='success',at='2026-11-23T21:34:00Z')=>({
 id:123,event:'schedule',head_branch:'main',created_at:at,status,conclusion
});
const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture'};
test('success and active primary run prevent another D1 read',()=>{
 for(const r of [run(),run('in_progress',null),run('queued',null)]){
  const x=decideAuditFallback([r],now);
  assert.equal(x.execute,false);assert.equal(x.deleteAuthorized,false);
 }
});
test('missing, failed, cancelled and prior-day primary permit read-only fallback',()=>{
 for(const input of [[],[run('completed','failure')],[run('completed','cancelled')],
  [run('completed','success','2026-11-22T21:33:00Z')]]){
  const x=decideAuditFallback(input,now);
  assert.equal(x.execute,true);
  assert.equal(x.deleteAuthorized,false);
 }
});
test('untrusted, saturated, future and inconsistent Actions inventory fails closed',()=>{
 const invalid=[[{...run(),id:0}],[{...run(),head_branch:'feature'}],
  [{...run(),event:'push'}],[{...run(),created_at:'tomorrow'}],
  [{...run(),status:'completed',conclusion:'unknown'}],
  [{...run(),created_at:'2026-11-23T23:45:00Z'}],
  Array.from({length:100},(_,i)=>({...run(),id:i+1}))];
 for(const rows of invalid)assert.throws(()=>decideAuditFallback(rows,now));
 assert.throws(()=>decideAuditFallback([],Date.parse('2026-11-23T20:00:00Z')));
});
test('GitHub metadata only; no production Cloudflare requests or raw identifiers',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  return {ok:true,json:async()=>({total_count:1,workflow_runs:[run()]})};
 };
 assert.equal((await checkAuditFallback(env,fetcher,now)).execute,false);
 assert.equal(calls.length,1);
 assert.match(calls[0].url,/api\.github\.com\/repos\/altepop\/keso-gamble\/actions\/workflows\/duel-operations-audit.yml\/runs\?event=schedule/);
 assert.equal(calls[0].options.method,undefined);
 assert.doesNotMatch(calls[0].url,/cloudflare|d1\/database|kp_/);
 await assert.rejects(checkAuditFallback(env,async()=>({ok:false,status:403}),now),/HTTP 403/);
 await assert.rejects(checkAuditFallback(env,async()=>({ok:true,json:async()=>({workflow_runs:[]})}),now),/malformed/);
 await assert.rejects(checkAuditFallback({...env,GITHUB_TOKEN:''},()=>{throw Error('called');},now),/missing/);
});
test('fallback is separate from primary cron and never automatically deletes records',async()=>{
 const {readFileSync}=await import('node:fs');
 const w=readFileSync(new URL('../../../.github/workflows/duel-operations-audit-fallback.yml',import.meta.url),'utf8');
 assert.match(w,/cron: '17 22 \* \* \*'/);
 assert.match(w,/steps\.decision\.outputs\.execute == 'true'/);
 assert.match(w,/node scripts\/duel-scheduled-operations-audit\.mjs/);
 assert.match(w,/node scripts\/duel-scheduled-operations-alert\.mjs/);
 assert.doesNotMatch(w,/DELETE FROM|DROP TABLE|TRUNCATE|wrangler d1 execute|kp_wallet/);
});

test('actual Nov 24 15:08 JST delayed fallback uses previous UTC day primary slot',()=>{
 const delayed=Date.parse('2026-11-24T06:08:54Z');
 const actualPrimary=run('completed','success','2026-11-24T05:24:00Z');
 for(const r of [actualPrimary,run(),run('in_progress',null,'2026-11-24T05:24:00Z'),run('queued',null)]){
  const result=decideAuditFallback([r],delayed);
  assert.equal(result.execute,false);assert.equal(result.deleteAuthorized,false);
 }
 for(const rows of [[],[run('completed','failure','2026-11-24T05:24:00Z')],[run('completed','success','2026-11-22T21:33:00Z')]]){
  const result=decideAuditFallback(rows,delayed);
  assert.equal(result.execute,true);assert.equal(result.deleteAuthorized,false);
 }
 assert.throws(()=>decideAuditFallback([run('in_progress',null,'2026-11-22T21:33:00Z')],delayed),/Older primary/);
});
test('UTC rollover boundary and bounded lateness preserve fail-closed behavior',()=>{
 for(const at of ['2026-11-23T23:59:59Z','2026-11-24T00:00:00Z','2026-11-24T10:17:00Z'])
  assert.equal(decideAuditFallback([run()],Date.parse(at)).execute,false);
 assert.throws(()=>decideAuditFallback([],Date.parse('2026-11-24T10:17:00.001Z')),/outside/);
 assert.throws(()=>decideAuditFallback([],Date.parse('2026-11-24T22:16:59Z')),/outside/);
 assert.equal(decideAuditFallback([run()],Date.parse('2026-11-24T22:17:00Z')).execute,true);
});
