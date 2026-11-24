import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDuelEvidence,hashDuelEvidence,captureDuelEvidence,EVIDENCE_PAGE_SIZE,EVIDENCE_EVENTS} from '../../../scripts/duel-admin-evidence.mjs';
const now='2026-11-23T00:00:00.000Z',sha='a'.repeat(40);
const run=(name,id,conclusion='success',head_sha=sha)=>({name,id,conclusion,head_sha,status:'completed',created_at:'2026-11-22T23:00:00.000Z',
 event:name==='pages build and deployment'?'dynamic':name==='VALORANT Bot check and deploy'?'push':'schedule',
 repository:{full_name:'altepop/keso-gamble'},head_branch:'main'});
const pages=run('pages build and deployment',1),worker=run('VALORANT Bot check and deploy',2),backup=run('P12 duel D1 encrypted backup and isolated restore',3);
test('audit manifest pairs only successful matching SHA, no approval claims',()=>{
 const value=buildDuelEvidence([pages,worker,backup],now);
 assert.equal(value.pairedDeploymentSha,sha);assert.equal(value.entries.backup.id,3);
 assert.equal(value.approvalOrRecoveryVerified,false);
 assert.match(hashDuelEvidence(value),/^[a-f0-9]{64}$/);
 assert.equal(JSON.stringify(value).includes('GITHUB_TOKEN'),false);
});
test('mismatch, failure and unknown outcomes never claim a matched deploy',()=>{
 assert.equal(buildDuelEvidence([pages,{...worker,head_sha:'b'.repeat(40)}],now).pairedDeploymentSha,null);
 assert.equal(buildDuelEvidence([pages,{...worker,conclusion:'failure'}],now).pairedDeploymentSha,null);
 assert.equal(buildDuelEvidence([pages,{...worker,status:'in_progress'}],now).entries.worker,null);
});
test('only fixed metadata is emitted; ignore fields containing secrets and personal data',()=>{
 const v=buildDuelEvidence([{...pages,actor:{login:'secret'},sql:'SELECT * FROM private',secret:'do not include'},worker],now);
 const raw=JSON.stringify(v);
 assert.doesNotMatch(raw,/secret|private|SELECT/);
 assert.equal(v.entries.backup,null);
});
test('non-action, malformed inputs are rejected and metadata retrieval is read-only',async()=>{
 assert.throws(()=>buildDuelEvidence({},now));
 assert.throws(()=>buildDuelEvidence([],''),/Invalid/);
 const seen=[];
 const evidence=await captureDuelEvidence({GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fake'},
  async(url,opts)=>{
   seen.push({url,opts});
   const event=new URL(url).searchParams.get('event');
   const rows=[pages,worker].filter(r=>r.event===event);
   return {ok:true,json:async()=>({total_count:rows.length,workflow_runs:rows})};
  },new Date(now));
 assert.equal(evidence.pairedDeploymentSha,sha);
 assert.equal(seen.length,4);
 for(const {url,opts} of seen){
  assert.equal(opts.method,undefined);
  const p=new URL(url).searchParams;
  assert.equal(p.get('branch'),'main');
  assert.equal(p.get('created'),'2026-11-22T00:00:00Z..2026-11-23T00:00:00Z');
  assert.equal(p.get('per_page'),'100');
 }
 assert.deepEqual(seen.map(x=>new URL(x.url).searchParams.get('event')),EVIDENCE_EVENTS);
 await assert.rejects(captureDuelEvidence({GITHUB_REPOSITORY:'bad',GITHUB_TOKEN:'fake'}),/repository/);
});

test('PR checks and unverified provenance must never be paired with production Pages',()=>{
 const pr={...worker,event:'pull_request'};
 assert.equal(buildDuelEvidence([pages,pr],now).pairedDeploymentSha,null);
 assert.equal(buildDuelEvidence([pages,{...worker,head_branch:'feature'}],now).pairedDeploymentSha,null);
 assert.equal(buildDuelEvidence([pages,{...worker,repository:{full_name:'other/repo'}}],now).pairedDeploymentSha,null);
 assert.equal(buildDuelEvidence([{...pages,event:'workflow_dispatch'},worker],now).pairedDeploymentSha,null);
 assert.equal(buildDuelEvidence([pages,{...worker,created_at:'2026-11-22T22:20:00.000Z'}],now).pairedDeploymentSha,null);
});
test('future and stale runs never count as current evidence',()=>{
 assert.equal(buildDuelEvidence([{...pages,created_at:'2026-11-23T00:01:00Z'},worker],now).pairedDeploymentSha,null);
 assert.equal(buildDuelEvidence([{...pages,created_at:'2026-11-21T22:59:00Z'},worker],now).entries.pages,null);
 assert.equal(buildDuelEvidence([pages,worker],now).schema,'duel-admin-evidence-v2');
});

const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture'};
const reply=rows=>({ok:true,json:async()=>({total_count:rows.length,workflow_runs:rows})});
const eventOf=url=>new URL(url).searchParams.get('event');
test('observed failed-run 24h event volumes fit four bounded disjoint requests',async()=>{
 const stamp=new Date('2026-11-24T05:57:35Z');
 const counts={dynamic:57,push:86,schedule:11,workflow_dispatch:13};
 const calls=[];
 const report=await captureDuelEvidence(env,async url=>{
  calls.push(url);
  const event=eventOf(url);
  const q=new URL(url).searchParams;
  assert.equal(q.get('created'),'2026-11-23T05:57:35Z..2026-11-24T05:57:35Z');
  const baseId=1000+EVIDENCE_EVENTS.indexOf(event)*100;
  const rows=Array.from({length:counts[event]},(_,i)=>({
   ...run('Other workflow',baseId+i),event,created_at:'2026-11-24T05:00:00Z'
  }));
  if(event==='dynamic')rows[0]={...rows[0],name:pages.name};
  if(event==='push')rows[0]={...rows[0],name:worker.name};
  return reply(rows);
 },stamp);
 assert.equal(calls.length,4);
 assert.equal(report.pairedDeploymentSha,sha);
 assert.equal(report.entries.backup,null);
});
test('saturated, incomplete, and malformed inventory fail closed',async()=>{
 const rows=Array.from({length:EVIDENCE_PAGE_SIZE},(_,i)=>({...pages,id:100+i}));
 await assert.rejects(captureDuelEvidence(env,async()=>reply(rows),new Date(now)),/exceeds bounded pagination/);
 await assert.rejects(captureDuelEvidence(env,async()=>({ok:true,json:async()=>({total_count:2,workflow_runs:[pages]})}),new Date(now)),/incomplete/);
 await assert.rejects(captureDuelEvidence(env,async()=>({ok:true,json:async()=>({workflow_runs:[pages]})}),new Date(now)),/Invalid Actions metadata/);
 await assert.rejects(captureDuelEvidence(env,async()=>reply([pages,pages]),new Date(now)),/Duplicated/);
});
test('wrong event, branch, repository, time and order fail closed',async()=>{
 for(const row of [
  {...pages,event:'pull_request'},
  {...pages,head_branch:'feature'},
  {...pages,repository:{full_name:'other/repo'}},
  {...pages,created_at:'2026-11-21T00:00:00Z'},
  {...pages,created_at:'2026-11-23T00:01:00Z'}
 ])await assert.rejects(captureDuelEvidence(env,async()=>reply([row]),new Date(now)),/outside requested partition/);
 await assert.rejects(captureDuelEvidence(env,async()=>reply([
  {...pages,created_at:'2026-11-22T22:00:00Z'},{...pages,id:2}
 ]),new Date(now)),/unordered/);
});
test('second-rounded API window does not widen exact evidence projection',async()=>{
 const stamp=new Date('2026-11-23T00:00:00.500Z');
 const report=await captureDuelEvidence(env,async url=>{
  const event=eventOf(url);
  assert.equal(new URL(url).searchParams.get('created'),'2026-11-22T00:00:00Z..2026-11-23T00:00:01Z');
  return reply(event==='dynamic'?[{...pages,created_at:'2026-11-22T00:00:00Z'}]:
   event==='push'?[{...worker,created_at:'2026-11-23T00:00:01Z'}]:[]);
 },stamp);
 assert.equal(report.entries.pages,null);
 assert.equal(report.entries.worker,null);
});
