/** P12 administrator evidence: fixed allowlist of GitHub Actions metadata only.
 * Not a cryptographic signature, not an approval audit, not an authorization check.
 * This produces a tamper-evident digest of the downloaded JSON as an operational record.
 */
import {createHash} from 'node:crypto';
import {writeFileSync,appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const required=[
 {key:'pages',name:'pages build and deployment',events:['dynamic']},
 {key:'worker',name:'VALORANT Bot check and deploy',events:['push']},
 {key:'backup',name:'P12 duel D1 encrypted backup and isolated restore',events:['schedule','workflow_dispatch']}
];
const validSha=sha=>typeof sha==='string'&&/^[a-f0-9]{40}$/i.test(sha);
const validRunId=id=>Number.isSafeInteger(id)&&id>0;
const MAX_PAIR_GAP_MS=30*60*1000;
const MAX_EVIDENCE_AGE_MS=24*60*60*1000;
export function buildDuelEvidence(runs,generatedAt){
 if(!Array.isArray(runs)||typeof generatedAt!=='string'||!Number.isFinite(Date.parse(generatedAt)))
  throw Error('Invalid evidence input');
 const stamp=Date.parse(generatedAt);
 const entries={};
 for(const {key,name,events} of required){
  const filtered=runs.filter(r=>r?.name===name&&events.includes(r.event)&&
   r?.repository?.full_name==='altepop/keso-gamble'&&r?.head_branch==='main'&&
   r?.status==='completed'&&
   validSha(r.head_sha)&&validRunId(r.id)&&
   typeof r.created_at==='string'&&Number.isFinite(Date.parse(r.created_at))&&
   Date.parse(r.created_at)<=stamp&&stamp-Date.parse(r.created_at)<=MAX_EVIDENCE_AGE_MS&&
   ['success','failure','cancelled','timed_out','action_required','skipped'].includes(r.conclusion));
  filtered.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id-a.id);
  const r=filtered[0];
  entries[key]=r?{id:r.id,sha:r.head_sha,conclusion:r.conclusion,createdAt:r.created_at,event:r.event}:null;
 }
 const paired=entries.pages?.conclusion==='success'&&entries.worker?.conclusion==='success'&&
  entries.pages.sha===entries.worker.sha&&
  Math.abs(Date.parse(entries.pages.createdAt)-Date.parse(entries.worker.createdAt))<=MAX_PAIR_GAP_MS
  ?entries.pages.sha:null;
 return {schema:'duel-admin-evidence-v2',generatedAt,source:'github-actions-metadata',
  entries,pairedDeploymentSha:paired,provenanceRules:'main push worker + dynamic pages within 30 minutes',
  approvalOrRecoveryVerified:false};
}
export function hashDuelEvidence(evidence){
 return createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
}
export async function captureDuelEvidence(env=process.env,request=fetch,now=new Date()){
 if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN)
  throw Error('Expected repository and token unavailable');
 const url='https://api.github.com/repos/altepop/keso-gamble/actions/runs?per_page=100';
 const resp=await request(url,{headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,
  Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000)});
 if(!resp.ok)throw Error('Read-only Actions metadata query failed: HTTP '+resp.status);
 const data=await resp.json();
 if(!Array.isArray(data.workflow_runs))throw Error('Invalid Actions metadata response');
 // A missing record is explicit null, never inferred success. May not cover older runs beyond first 100.
 return buildDuelEvidence(data.workflow_runs,now.toISOString());
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 captureDuelEvidence().then(data=>{
  const file=process.env.DUEL_ADMIN_EVIDENCE_FILE;
  if(!file)throw Error('Private runner evidence file path unavailable');
  writeFileSync(file,JSON.stringify({evidence:data,sha256:hashDuelEvidence(data)},null,2)+'\n',{mode:0o600});
  const summary={paired:data.pairedDeploymentSha||'not confirmed',
   pages:data.entries.pages?.conclusion||'unavailable',worker:data.entries.worker?.conclusion||'unavailable',
   backup:data.entries.backup?.conclusion||'unavailable'};
  console.log('DUEL_ADMIN_EVIDENCE '+JSON.stringify(summary));
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   'P12 administrator evidence captured. SHA pair: '+summary.paired+
   '. Original backup evidence and approvals remain separately verifiable.\n');
 }).catch(e=>{console.error('DUEL_ADMIN_EVIDENCE_ERROR '+e.message);process.exitCode=1;});
}
