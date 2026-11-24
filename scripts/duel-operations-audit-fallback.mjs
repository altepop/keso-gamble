/** Read-only decision about an independent daily audit fallback.
 * Never grants deletion or writes to Cloudflare/D1/KP.
 */
const WORKFLOW='duel-operations-audit.yml';
const DAY=86_400_000;
const validRun=r=>r&&Number.isSafeInteger(r.id)&&r.id>0&&
 r.event==='schedule'&&r.head_branch==='main'&&
 typeof r.created_at==='string'&&Number.isFinite(Date.parse(r.created_at))&&
 ['queued','pending','waiting','in_progress','completed'].includes(r.status)&&
 (r.status!=='completed'||['success','failure','cancelled','timed_out','skipped','action_required'].includes(r.conclusion));
export function decideAuditFallback(runs,now=Date.now()){
 if(!Array.isArray(runs)||runs.length>100||!Number.isSafeInteger(now)||now<DAY)throw Error('Invalid scheduled audit inventory');
 // Anchor to the most recent 22:17 UTC fallback slot, including the next UTC morning.
 // Permit at most 12 hours of lateness; outside this bounded window the slot is ambiguous.
 // The primary for that slot is 46 minutes earlier (21:31 UTC).
 const fallbackOffset=22*3_600_000+17*60_000;
 const slot=Math.floor((now-fallbackOffset)/DAY)*DAY+fallbackOffset;
 if(now-slot>12*3_600_000)throw Error('Fallback invoked outside its UTC execution window');
 const due=slot-46*60_000;
 if(runs.length>=100)throw Error('Scheduled audit inventory saturated');
 for(const run of runs){
  if(!validRun(run))throw Error('Scheduled audit metadata invalid');
  const at=Date.parse(run.created_at);
  if(at>now+5*60_000)throw Error('Scheduled audit run timestamp is future');
 }
 const relevant=runs.filter(r=>Date.parse(r.created_at)>=due&&Date.parse(r.created_at)<=now);
 // A still-active older primary is also unsafe to duplicate, even if its slot is uncertain.
 if(runs.some(r=>r.status!=='completed'&&Date.parse(r.created_at)<due))
  throw Error('Older primary audit still active; fallback slot uncertain');
 // A successful or still-running original must not be duplicated. A confirmed
 // failure/cancellation permits a separate read-only retry.
 const already=relevant.some(r=>r.status!=='completed'||r.conclusion==='success');
 return {execute:!already,reason:already?'original-scheduled-or-running':'original-scheduled-missing-or-failed',
  originalRuns:relevant.length,deleteAuthorized:false};
}
export async function checkAuditFallback(env=process.env,request=fetch,now=Date.now()){
 if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN)
  throw Error('Authorized GitHub Actions metadata access missing');
 const url='https://api.github.com/repos/altepop/keso-gamble/actions/workflows/'+WORKFLOW+
  '/runs?event=schedule&per_page=100';
 const response=await request(url,{headers:{
  Authorization:'Bearer '+env.GITHUB_TOKEN,
  Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Scheduled audit Actions metadata HTTP '+response.status);
 const payload=await response.json();
 if(!Number.isSafeInteger(payload?.total_count)||payload.total_count<0||
  !Array.isArray(payload.workflow_runs))throw Error('Scheduled audit metadata malformed');
 // API is newest first; for the current day's original run to be absent
 // from page one, the page must be saturated or the schedule actually missed.
 if(payload.workflow_runs.length>=100)throw Error('Scheduled audit metadata first page saturated');
 return decideAuditFallback(payload.workflow_runs,now);
}
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 checkAuditFallback().then(decision=>{
  if(!process.env.GITHUB_OUTPUT)throw Error('Missing Actions output file');
  appendFileSync(process.env.GITHUB_OUTPUT,'execute='+(decision.execute?'true':'false')+'\n');
  console.log('DUEL_AUDIT_FALLBACK_DECISION '+JSON.stringify(decision));
 }).catch(e=>{console.error('DUEL_AUDIT_FALLBACK_UNAVAILABLE '+e.message);process.exitCode=1;});
