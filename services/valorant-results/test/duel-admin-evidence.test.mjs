import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDuelEvidence,hashDuelEvidence,captureDuelEvidence,EVIDENCE_PAGE_SIZE,EVIDENCE_MAX_PAGES} from '../../../scripts/duel-admin-evidence.mjs';
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
 let seen;
 const evidence=await captureDuelEvidence({GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fake'},
  async(url,opts)=>{seen={url,opts};return {ok:true,json:async()=>({workflow_runs:[pages,worker]})};},
  new Date(now));
 assert.equal(evidence.pairedDeploymentSha,sha);
 assert.equal(seen.opts.method,undefined);
 assert.match(seen.url,/\/actions\/runs\?per_page=100$/);
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

test('full first page must be followed by bounded second-page proof',async()=>{
 const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture'};
 const filler=Array.from({length:EVIDENCE_PAGE_SIZE},(_,i)=>({
  ...run('Other workflow',1000+i),event:'push',
  created_at:'2026-11-22T23:30:00.000Z'
 }));
 const urls=[];
 const data=await captureDuelEvidence(env,async(url,opts)=>{
  urls.push(url);
  assert.equal(opts.method,undefined);
  return {ok:true,json:async()=>({workflow_runs:urls.length===1?filler:[pages,worker]})};
 },new Date(now));
 assert.equal(data.pairedDeploymentSha,sha);
 assert.equal(urls.length,2);
 assert.match(urls[1],/per_page=100&page=2$/);
});
test('three saturated pages fail closed and never produce partial evidence',async()=>{
 const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture'};
 let page=0;
 await assert.rejects(captureDuelEvidence(env,async()=>{
  const start=(page++)*EVIDENCE_PAGE_SIZE;
  return {ok:true,json:async()=>({workflow_runs:Array.from({length:EVIDENCE_PAGE_SIZE},(_,i)=>({
   ...run('Other workflow',10000+start+i),event:'push',
   created_at:'2026-11-22T23:00:00.000Z'
  }))})};
 },new Date(now)),/exceeds bounded pagination/);
 assert.equal(page,EVIDENCE_MAX_PAGES);
});
test('malformed, overfull and duplicated page inventory fail closed',async()=>{
 const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture'};
 await assert.rejects(captureDuelEvidence(env,async()=>({ok:true,json:async()=>({
  workflow_runs:Array.from({length:EVIDENCE_PAGE_SIZE+1},(_,i)=>run('Other workflow',100+i))
 })}),new Date(now)),/Invalid Actions metadata response/);
 await assert.rejects(captureDuelEvidence(env,async()=>({ok:true,json:async()=>({
  workflow_runs:[pages,pages]
 })}),new Date(now)),/Duplicated or malformed/);
 let page=0;
 await assert.rejects(captureDuelEvidence(env,async()=>{
  page++;
  return {ok:true,json:async()=>({workflow_runs:page===1?Array.from({length:EVIDENCE_PAGE_SIZE},(_,i)=>run('Other workflow',100+i)):[run('Other workflow',100)]})};
 },new Date(now)),/Duplicated or malformed/);
});

test('full page already older than 24h stops after proven cutoff without a false failure',async()=>{
 const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture'};
 let calls=0;
 const report=await captureDuelEvidence(env,async()=>{
  calls++;
  return {ok:true,json:async()=>({workflow_runs:Array.from({length:EVIDENCE_PAGE_SIZE},(_,i)=>({
   ...run('Other workflow',30000+i),event:'push',created_at:'2026-11-21T00:00:00.000Z'
  }))})};
 },new Date(now));
 assert.equal(calls,1);
 assert.equal(report.pairedDeploymentSha,null);
 assert.equal(report.entries.pages,null);
});
test('unordered and future-dated Action pages reject false 24h completeness',async()=>{
 const env={GITHUB_REPOSITORY:'altepop/keso-gamble',GITHUB_TOKEN:'fixture'};
 await assert.rejects(captureDuelEvidence(env,async()=>({ok:true,json:async()=>({
  workflow_runs:[{...pages,created_at:'2026-11-22T22:00:00.000Z'},worker]
 })}),new Date(now)),/unordered/);
 await assert.rejects(captureDuelEvidence(env,async()=>({ok:true,json:async()=>({
  workflow_runs:[{...pages,created_at:'2026-11-23T00:01:00.000Z'}]
 })}),new Date(now)),/future-dated/);
});
