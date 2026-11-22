/** Require real, same-main-SHA production deploys before manual/automatic P9 release. */
const need={pages:'pages build and deployment',worker:'VALORANT Bot check and deploy'};
export function summarizeDeployGate(runs,sha){
 const exact=runs.filter(r=>r.head_sha===sha && r.head_branch==='main');
 const pages=exact.filter(r=>r.name===need.pages);
 const workers=exact.filter(r=>r.name===need.worker&&r.event==='push');
 const pick=xs=>xs.sort((a,b)=>(b.run_number??0)-(a.run_number??0))[0];
 const page=pick(pages),worker=pick(workers);
 if([page,worker].some(r=>r&&r.status==='completed'&&r.conclusion!=='success'))
  return {state:'failed',pages:page?.conclusion??null,worker:worker?.conclusion??null};
 if(page?.status==='completed'&&page.conclusion==='success'&&
    worker?.status==='completed'&&worker.conclusion==='success')
  return {state:'verified',pages:page.id,worker:worker.id};
 return {state:'pending',pages:page?.conclusion??null,worker:worker?.conclusion??null};
}
export async function verifyDeploys({repo,sha,token,request=fetch,delay=ms=>new Promise(r=>setTimeout(r,ms)),iterations=45}){
 if(repo!=='altepop/keso-gamble'||!/^[a-f0-9]{40}$/i.test(sha)||!token)
  throw Error('invalid_release_deploy_gate');
 for(let n=0;n<iterations;n++){
  const response=await request('https://api.github.com/repos/'+repo+'/actions/runs?per_page=100',{
   headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},
   signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!response.ok)throw Error('github_deploy_query_http_'+response.status);
  const body=await response.json();
  const result=summarizeDeployGate(body.workflow_runs??[],sha);
  if(result.state==='verified')return result;
  if(result.state==='failed')throw Error('production_deploy_failed');
  if(n+1<iterations)await delay(20_000);
 }
 throw Error('production_deploy_timeout');
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 try{
  const result=await verifyDeploys({repo:process.env.GITHUB_REPOSITORY,sha:process.env.GITHUB_SHA,token:process.env.GITHUB_TOKEN});
  console.log('DUEL_RELEASE_DEPLOY_GATE '+JSON.stringify(result));
 }catch(error){
  console.error('DUEL_RELEASE_DEPLOY_GATE_FAILED '+(error instanceof Error?error.message:'unknown'));
  process.exitCode=1;
 }
}
