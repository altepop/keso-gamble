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
export const EVIDENCE_PAGE_SIZE=100;
export const EVIDENCE_EVENTS=['dynamic','push','schedule','workflow_dispatch'];
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
 const stamp=now.getTime();
 if(!Number.isSafeInteger(stamp)||stamp<MAX_EVIDENCE_AGE_MS)throw Error('Invalid evidence clock');
 const cutoff=stamp-MAX_EVIDENCE_AGE_MS;
 // Fixed snapshot window and disjoint event partitions; no unrelated PR runs.
 // GitHub created filter is second-granular, so widen to whole seconds and
 // retain the existing exact millisecond bounds in the projection.
 const from=new Date(Math.floor(cutoff/1000)*1000).toISOString().replace('.000Z','Z');
 const to=new Date(Math.ceil(stamp/1000)*1000).toISOString().replace('.000Z','Z');
 const url='https://api.github.com/repos/altepop/keso-gamble/actions/runs?branch=main&created='+encodeURIComponent(from+'..'+to)+'&per_page='+EVIDENCE_PAGE_SIZE;
 const runs=[],seen=new Set();
 for(const event of EVIDENCE_EVENTS){
  const resp=await request(url+'&event='+event,{headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,
   Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000)});
  if(!resp.ok)throw Error('Read-only Actions metadata query failed: HTTP '+resp.status);
  const data=await resp.json();
  if(!Number.isSafeInteger(data?.total_count)||data.total_count<0||
     !Array.isArray(data.workflow_runs)||data.workflow_runs.length>EVIDENCE_PAGE_SIZE)
   throw Error('Invalid Actions metadata response');
  if(data.total_count>=EVIDENCE_PAGE_SIZE||data.total_count!==data.workflow_runs.length)
   throw Error('Actions evidence inventory exceeds bounded pagination or is incomplete');
  let previousTime=Infinity;
  for(const item of data.workflow_runs){
   if(!validRunId(item?.id)||seen.has(item.id))
    throw Error('Duplicated or malformed Actions run inventory');
   const at=Date.parse(item.created_at);
   if(item.event!==event||item.head_branch!=='main'||item.repository?.full_name!=='altepop/keso-gamble'||
      !Number.isFinite(at)||at<Date.parse(from)||at>Date.parse(to)||at>previousTime)
    throw Error('Actions evidence metadata outside requested partition or unordered');
   previousTime=at;
   seen.add(item.id);
   runs.push(item);
  }
 }
 return buildDuelEvidence(runs,now.toISOString());
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
