// P12 deployment monitor: GitHub Actions metadata only. No Cloudflare, D1 or KP access.
const DEPLOYMENTS=Object.freeze([
 {name:'Pages',workflow:'pages build and deployment'},
 {name:'Worker',workflow:'VALORANT Bot check and deploy'}
]);
export function evaluateDeploymentRuns(runs, now=Date.now(), graceMs=20*60*1000){
 if(!Array.isArray(runs))throw Error('Actions runs must be an array');
 const results=DEPLOYMENTS.map(item=>{
  // Only production main deployments qualify; branch runs and PR checks must not hide an outage.
  const selected=runs.filter(r=>r?.name===item.workflow&&r.head_branch==='main'&&
   (item.name==='Pages'?(r.event==='dynamic'||r.event==='push') : r.event==='push'))
   .sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0))[0];
  if(!selected)return {name:item.name,state:'missing'};
  const created=Date.parse(selected.created_at);
  if(!Number.isFinite(created))return {name:item.name,state:'invalid-timestamp',runId:selected.id};
  if(selected.status!=='completed'){
   return {name:item.name,state:now-created>graceMs?'stalled':'pending',runId:selected.id,sha:selected.head_sha};
  }
  return {name:item.name,state:selected.conclusion==='success'?'healthy':'failed',runId:selected.id,sha:selected.head_sha};
 });
 const failures=results.filter(x=>['missing','invalid-timestamp','stalled','failed'].includes(x.state));
 // Main can legitimately update Pages without deploying Worker; mismatch is informational, never an automatic write.
 return {ok:failures.length===0,results,sharedSha:results.every(x=>x.state==='healthy')&&results[0].sha===results[1].sha?results[0].sha:null};
}
async function run(){
 const token=process.env.GITHUB_TOKEN,repo=process.env.GITHUB_REPOSITORY;
 if(!token||repo!=='altepop/keso-gamble')throw Error('GitHub read-only monitoring credentials/repository unavailable');
 const res=await fetch('https://api.github.com/repos/'+repo+'/actions/runs?per_page=100',{
  headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
  signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw Error('GitHub Actions metadata request failed: '+res.status);
 const data=await res.json();
 const report=evaluateDeploymentRuns(data.workflow_runs);
 if(process.env.DUEL_WATCH_REPORT){
  const {writeFileSync}=await import('node:fs');
  writeFileSync(process.env.DUEL_WATCH_REPORT,JSON.stringify(report),{mode:0o600});
 }
 for(const item of report.results)console.log('DUEL_DEPLOY_WATCH '+JSON.stringify(item));
 console.log('DUEL_DEPLOY_WATCH_SUMMARY '+JSON.stringify({ok:report.ok,sharedSha:report.sharedSha}));
 if(process.env.GITHUB_STEP_SUMMARY){
  const {appendFileSync}=await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   '# P12 duel deployment monitor (read-only)\n\n'+
   '| Target | Latest run | State | SHA |\n|---|---:|---|---|\n'+
   report.results.map(x=>'| '+x.name+' | '+(x.runId||'-')+' | '+x.state+' | '+(x.sha||'-')+' |').join('\n')+
   '\n\nPaired deployed SHA: '+(report.sharedSha||'not identical / not yet confirmed')+'\n');
 }
 if(!report.ok)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)run().catch(err=>{console.error('DUEL_DEPLOY_WATCH_ERROR '+err.message);process.exitCode=1;});
