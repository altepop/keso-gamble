/** P12 manual-operations audit from GitHub Actions metadata.
 * Captures public GitHub actor IDs for selected high-impact manual workflows.
 * Read-only: never changes GitHub issues, Cloudflare D1, KP or deployment state.
 */
import {createHash} from 'node:crypto';
import {appendFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const CRITICAL_MANUAL_WORKFLOWS=Object.freeze([
 'P12 duel D1 encrypted backup and isolated restore',
 'P12 duel retained ciphertext recovery drill',
 'P12 duel scheduled operations audit (read-only)',
 'P12 duel administrator deployment evidence',
 'P12 duel deployment monitor heartbeat',
 'P12 duel deployment health (read-only)',
 'P12 duel retained encrypted backup readiness',
 'P12 duel retained backup schedule watchdog',
 'P12 duel critical manual operations evidence'
]);
const named=new Set(CRITICAL_MANUAL_WORKFLOWS);
const validSha=sha=>typeof sha==='string'&&/^[a-f0-9]{40}$/i.test(sha);
const validActor=login=>typeof login==='string'&&/^[a-z0-9-]{1,39}$/i.test(login);
const validBranch=branch=>typeof branch==='string'&&branch.length>0&&branch.length<=255&&/^[a-zA-Z0-9._/-]+$/.test(branch);
const DAY_MS=86400000;
export function summarizeManualOperations(runs,now=Date.now()){
 if(!Array.isArray(runs)||!Number.isSafeInteger(now)||now<DAY_MS)
  throw Error('Invalid manual operation evidence input');
 // The REST query is limited to 100 results; fail rather than imply completeness
 // when the first page is saturated.
 if(runs.length>=100)throw Error('Manual operations list exceeds bounded audit window');
 const rows=[];
 for(const r of runs){
  if(r?.event!=='workflow_dispatch'||!named.has(r.name))continue;
  const at=Date.parse(r.created_at);
  if(!Number.isSafeInteger(r.id)||r.id<=0||!validSha(r.head_sha)||
     r.repository?.full_name!=='altepop/keso-gamble'||!validBranch(r.head_branch)||
     !Number.isFinite(at)||at>now||!validActor(r.actor?.login)||
     !['completed','queued','in_progress','waiting','pending'].includes(r.status)||
     (r.status==='completed'&&!['success','failure','cancelled','timed_out','skipped','action_required'].includes(r.conclusion)))
    throw Error('Critical manual operation metadata malformed');
  if(at<now-DAY_MS)continue;
  rows.push({runId:r.id,workflow:r.name,sha:r.head_sha,actor:r.actor.login,
   createdAt:new Date(at).toISOString(),status:r.status,
   conclusion:r.status==='completed'?r.conclusion:null,expectedOwner:r.actor.login==='altepop',
   branch:r.head_branch,expectedMain:r.head_branch==='main'});
 }
 rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.runId-a.runId);
 return {schema:'duel-manual-operations-audit-v2',asOf:new Date(now).toISOString(),
  windowHours:24,source:'github-actions-workflow-dispatch',entries:rows,
  unexpectedActorCount:rows.filter(r=>!r.expectedOwner).length,
  nonMainCount:rows.filter(r=>!r.expectedMain).length,
  coveredWorkflowNames:[...CRITICAL_MANUAL_WORKFLOWS],
  approvalsVerified:false,allAdminActionsCovered:false};
}
export const hashManualOperations=audit=>createHash('sha256').update(JSON.stringify(audit)).digest('hex');
export async function collectManualOperations(env=process.env,request=fetch,now=Date.now()){
 if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN)
  throw Error('Authorized read-only Actions access unavailable');
 if(!Number.isSafeInteger(now)||now<DAY_MS)throw Error('Invalid manual operation evidence input');
 // Filter the actual rolling 24h server-side before the 100-row safety cap.
 // The local timestamp checks remain authoritative; never silently truncate.
 const created=new Date(now-DAY_MS).toISOString()+'..'+new Date(now).toISOString();
 const url='https://api.github.com/repos/altepop/keso-gamble/actions/runs?event=workflow_dispatch&per_page=100&created='+encodeURIComponent(created);
 const res=await request(url,{
  headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json',
   'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw Error('Manual operations Actions query failed: HTTP '+res.status);
 const body=await res.json();
 if(!Array.isArray(body?.workflow_runs)||!Number.isSafeInteger(body.total_count)||
    body.total_count<0||body.total_count!==body.workflow_runs.length)
  throw Error('Manual operation metadata response invalid or incomplete');
 if(body.total_count>=100)throw Error('Manual operations list exceeds bounded audit window');
 return summarizeManualOperations(body.workflow_runs,now);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 collectManualOperations().then(audit=>{
  const file=process.env.DUEL_MANUAL_AUDIT_FILE;
  if(!file)throw Error('Runner evidence path missing');
  writeFileSync(file,JSON.stringify({audit,sha256:hashManualOperations(audit)},null,2)+'\n',{mode:0o600});
  const summary={observed:audit.entries.length,unexpectedActorCount:audit.unexpectedActorCount,
   nonMainCount:audit.nonMainCount,
   scope:'critical GitHub workflow_dispatch only',approvalVerified:false};
  console.log('DUEL_MANUAL_AUDIT '+JSON.stringify(summary));
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   '# P12 duel critical manual Actions audit\n\nObserved manual runs (24h): '+audit.entries.length+
   '\nUnexpected actors: '+audit.unexpectedActorCount+
   '\nNon-main dispatches: '+audit.nonMainCount+
   '\n\nNo approvals verified, no D1/KP access, and no comprehensive admin audit claim.\n');
 }).catch(error=>{console.error('DUEL_MANUAL_AUDIT_FAILED '+error.message);process.exitCode=1;});
}
