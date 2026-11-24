import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDeploymentRuns} from '../../../scripts/duel-deployment-watch.mjs';
const now=Date.parse('2026-11-23T04:00:00Z');
const entry=(name,id,status,conclusion,created_at='2026-11-23T03:00:00Z',head_sha='testsha')=>({name,id,status,conclusion,created_at,head_sha,event:name==='pages build and deployment'?'dynamic':'push',head_branch:'main'});
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
 const workflow=readFileSync(new URL('../../../.github/workflows/duel-deployment-watch.yml',import.meta.url),'utf8');
 assert.ok(workflow.includes("cron: '43 * * * *'"));
 assert.match(workflow,/actions: read/);
 assert.doesNotMatch(workflow,/CLOUDFLARE_API_TOKEN|wrangler d1|database\/query/);
});

test('only real production main deployments can mask failures',()=>{
 const failing=entry(worker.name,12,'completed','failure','2026-11-23T03:15:00Z');
 const unrelated=entry(worker.name,13,'completed','success','2026-11-23T03:30:00Z');
 for(const value of [
  {...unrelated,head_branch:'feature/candidate'},
  {...unrelated,head_branch:null},
  {...unrelated,event:'workflow_dispatch'},
  {...unrelated,event:'pull_request'},
 ]){
  const result=evaluateDeploymentRuns([pages,failing,value],now);
  assert.equal(result.ok,false);
  assert.equal(result.results[1].runId,12);
  assert.equal(result.results[1].state,'failed');
 }
});
test('a branch-only successful run is not a production deployment',()=>{
 const r=evaluateDeploymentRuns([{...pages,head_branch:'gh-pages'}, {...worker,head_branch:'candidate'}],now);
 assert.equal(r.ok,false);
 assert.deepEqual(r.results.map(x=>x.state),['missing','missing']);
});
test('main Pages dynamic and Worker push deployments are accepted',()=>{
 const r=evaluateDeploymentRuns([pages,worker],now);
 assert.equal(r.ok,true);
 assert.equal(r.sharedSha,'testsha');
});

test('the independent D1 hourly scheduler also checks deployment health even when the D1 read alert fails',async()=>{
 const {readFileSync}=await import('node:fs');
 const workflow=readFileSync(new URL('../../../.github/workflows/d1-insights-report.yml',import.meta.url),'utf8');
 assert.match(workflow,/cron: '17 \* \* \* \*'/);
 const fallback=workflow.split('  deployment-watch-fallback:')[1]?.split('  budget-tests:')[0];
 assert.ok(fallback,'separate deployment-watch-fallback job must exist');
 assert.match(fallback,/github\.event_name == 'schedule'/);
 assert.match(fallback,/actions: read/);
 assert.match(fallback,/issues: write/);
 assert.match(fallback,/node scripts\/duel-deployment-watch\.mjs/);
 assert.match(fallback,/node scripts\/duel-deployment-alert\.mjs/);
 assert.match(fallback,/if: failure\(\)/);
 assert.doesNotMatch(fallback,/CLOUDFLARE_API_TOKEN|wrangler d1|database\/query|kp_settings/);
 assert.ok(workflow.indexOf('  deployment-watch-fallback:')<workflow.indexOf('  inspect:'),
  'fallback is independently scheduled and not gated on success of the D1 inspector');
});


test('independent hourly deployment schedule checks D1 Scheduled outages after its own alert step only',async()=>{
 const {readFileSync}=await import('node:fs');
 const yaml=readFileSync(new URL('../../../.github/workflows/duel-deployment-watch.yml',import.meta.url),'utf8');
 assert.match(yaml,/cron: '43 \* \* \* \*'/);
 assert.match(yaml,/run: node --test [^\n]*duel-d1-schedule-watch\.test\.mjs/);
 const deployIssue=yaml.indexOf('name: Create at most one open GitHub Issue for a real deployment anomaly');
 const d1Issue=yaml.indexOf('name: Independently notify on missing D1 Insights Scheduled executions');
 assert.ok(deployIssue>=0&&d1Issue>deployIssue,'D1 watchdog must not cause deployment incident creation');
 const separate=yaml.slice(d1Issue);
 assert.match(separate,/if: always\(\) && github\.event_name == 'schedule'/);
 assert.match(separate,/run: node scripts\/duel-d1-schedule-watch\.mjs/);
 assert.doesNotMatch(separate,/workflow_dispatch|CLOUDFLARE_API_TOKEN|wrangler|\/d1\/database\/|KP_TOKEN/);
 const watch=readFileSync(new URL('../../../scripts/duel-d1-schedule-watch.mjs',import.meta.url),'utf8');
 assert.match(watch,/d1-insights-report\.yml\/runs\?event=schedule/);
 assert.match(watch,/D1_SCHEDULE_ALERT_TITLE/);
});
