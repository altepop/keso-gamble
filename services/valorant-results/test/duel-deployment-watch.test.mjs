import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDeploymentRuns} from '../../../scripts/duel-deployment-watch.mjs';
const now=Date.parse('2026-11-23T04:00:00Z');
const entry=(name,id,status,conclusion,created_at='2026-11-23T03:00:00Z',head_sha='testsha')=>({name,id,status,conclusion,created_at,head_sha,event:'push'});
const pages=entry('pages build and deployment',10,'completed','success');
const worker=entry('VALORANT Bot check and deploy',11,'completed','success');
test('latest paired successful deployment is healthy',()=>{
 const r=evaluateDeploymentRuns([pages,worker],now);
 assert.equal(r.ok,true);assert.equal(r.sharedSha,'testsha');
});
test('failed run cannot be hidden by an older successful run',()=>{
 const r=evaluateDeploymentRuns([pages,worker,entry(worker.name,12,'completed','failure','2026-11-23T03:15:00Z')],now);
 assert.equal(r.ok,false);assert.equal(r.results[1].state,'failed');
});
test('recent in-progress deploy is a safe pending state, old one fails',()=>{
 const recent=entry(worker.name,12,'in_progress',null,'2026-11-23T03:50:00Z');
 assert.equal(evaluateDeploymentRuns([pages,recent],now).results[1].state,'pending');
 const old=entry(worker.name,12,'in_progress',null,'2026-11-23T03:00:00Z');
 assert.equal(evaluateDeploymentRuns([pages,old],now).results[1].state,'stalled');
});
test('pull-request checks cannot masquerade as production deployment',()=>{
 const r=evaluateDeploymentRuns([pages,{...worker,event:'pull_request'}],now);
 assert.equal(r.ok,false);assert.equal(r.results[1].state,'missing');
});
test('different successful SHAs are reported, without asserting a deployment failure',()=>{
 const r=evaluateDeploymentRuns([pages,{...worker,head_sha:'other'}],now);
 assert.equal(r.ok,true);assert.equal(r.sharedSha,null);
});
test('unknown API data is failed closed',()=>{
 assert.throws(()=>evaluateDeploymentRuns(null,now));
 assert.equal(evaluateDeploymentRuns([pages],now).ok,false);
});

test('schedule keeps hourly read-only watch without additional D1, KP or paid APIs',async()=>{
 const {readFileSync}=await import('node:fs');
 const workflow=readFileSync('.github/workflows/duel-deployment-watch.yml','utf8');
 assert.ok(workflow.includes("cron: '43 * * * *'"));
 assert.match(workflow,/actions: read/);
 assert.doesNotMatch(workflow,/CLOUDFLARE_API_TOKEN|wrangler d1|database\/query/);
});
