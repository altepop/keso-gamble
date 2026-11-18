// One specific deployment-blocking check, never a general cancellation API.
export const targetRun=44228187908;
const targetSha='9f0238d7a49d1ed9b9fa970c9b21321f93058cbe';
export function canRecover(run,jobs,now=Date.now()){
 if(run?.id!==targetRun||run.head_sha!==targetSha||run.head_branch!=='main'||run.event!=='push'||run.status!=='in_progress'||run.path!=='.github/workflows/valorant-results.yml')return false;
 if(!Array.isArray(jobs)||jobs.some(j=>j.name==='deploy'&&!['skipped','cancelled'].includes(j.conclusion)))return false;
 const check=jobs.find(j=>j.name==='check');
 return check?.status==='in_progress'&&check.steps?.some(s=>s.name==='Prepare race video verification'&&s.status==='in_progress'&&Number.isFinite(Date.parse(s.started_at))&&now-Date.parse(s.started_at)>5*60_000)===true;
}
export async function recoverStalledCoachCi(token,request=fetch,now=Date.now()){
 if(!token)throw Error('configuration');
 const base='https://api.github.com/repos/altepop/keso-gamble/actions/runs/'+targetRun;
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const read=async suffix=>{const r=await request(base+suffix,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok)throw Error('read');return r.json();};
 const run=await read('');
 if(run.status==='completed')return {status:'already-finished',targetRun};
 const page=await read('/jobs?per_page=100');
 if(page.total_count!==page.jobs?.length||!canRecover(run,page.jobs,now))return {status:'refused-state',targetRun};
 const res=await request(base+'/cancel',{method:'POST',headers,signal:AbortSignal.timeout(15000),redirect:'error'});
 if(res.status!==202)throw Error('cancel');
 return {status:'cancel-requested',targetRun};
}
if(process.argv[1]?.endsWith('/recover-stalled-coach-ci.mjs')){
 try{console.log('COACH_CI_RECOVERY '+JSON.stringify(await recoverStalledCoachCi(process.env.GITHUB_TOKEN)));}
 catch{console.error('COACH_CI_RECOVERY_UNAVAILABLE');process.exitCode=1;}
}
