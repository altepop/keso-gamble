/** P12 controlled recovery drill: validate a retained encrypted GitHub Actions artifact source.
 * Does not download credentials, mutate D1/KP, or invoke a production restore.
 */
import {pathToFileURL} from 'node:url';

export const DUEL_BACKUP_WORKFLOW='P12 duel D1 encrypted backup and isolated restore';
export function parseBackupRunId(raw){
 if(typeof raw!=='string'||!/^[1-9][0-9]{0,14}$/.test(raw))throw Error('Invalid backup run ID');
 const id=Number(raw);
 if(!Number.isSafeInteger(id))throw Error('Invalid backup run ID');
 return id;
}
export function artifactName(runId){
 const id=parseBackupRunId(String(runId));
 return 'keso-duel-d1-restorable-'+id;
}
export function validateBackupRun(run,id){
 if(!run||run.id!==id||run.name!==DUEL_BACKUP_WORKFLOW||
    run.conclusion!=='success'||run.status!=='completed'||
    run.repository?.full_name!=='altepop/keso-gamble'||run.head_branch!=='main'||
    typeof run.head_sha!=='string'||!/^[a-f0-9]{40}$/i.test(run.head_sha))
  throw Error('Backup run is not an approved successful main workflow');
 return {runId:id,artifact:artifactName(id),headSha:run.head_sha};
}
/** Validate the exact retained artifact before handing its name to download-artifact.
 * This checks GitHub metadata only; ciphertext integrity/key and restore remain
 * independently checked by the existing isolated recovery step.
 */
export function validateRetainedDrillArtifact(inventory,runId,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<=0||!Number.isSafeInteger(runId)||runId<=0||
    !Array.isArray(inventory?.artifacts)||!Number.isSafeInteger(inventory?.total_count)||
    inventory.total_count<0||inventory.total_count>inventory.artifacts.length||
    inventory.artifacts.length>=100)
  throw Error('Retained artifact inventory unavailable or truncated');
 const matches=inventory.artifacts.filter(a=>a?.name===artifactName(runId));
 if(matches.length!==1)throw Error('Expected retained ciphertext artifact not unique or missing');
 const a=matches[0],created=Date.parse(a.created_at),expires=Date.parse(a.expires_at);
 if(!Number.isSafeInteger(a.id)||a.id<=0||
    !Number.isSafeInteger(a.size_in_bytes)||a.size_in_bytes<=0||
    a.expired!==false||!Number.isFinite(created)||!Number.isFinite(expires)||
    created>now||expires<=now||expires<=created||
    a.workflow_run?.id!==runId)
  throw Error('Retained ciphertext artifact metadata invalid, expired or unrelated');
 return {artifactId:a.id,artifact:artifactName(runId),bytes:a.size_in_bytes,expiresAt:a.expires_at};
}
export async function inspectBackupRun(env=process.env,request=fetch,now=Date.now()){
 if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN)
  throw Error('Read-only GitHub Actions permission unavailable');
 const id=parseBackupRunId(env.DUEL_BACKUP_RUN_ID);
 const base='https://api.github.com/repos/altepop/keso-gamble/actions/runs/'+id;
 const headers={Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28'};
 const read=async url=>{
  const resp=await request(url,{headers,signal:AbortSignal.timeout(15000)});
  if(!resp.ok)throw Error('Retained drill metadata unavailable: HTTP '+resp.status);
  return resp.json();
 };
 const provenance=validateBackupRun(await read(base),id);
 const artifact=validateRetainedDrillArtifact(await read(base+'/artifacts?per_page=100'),id,now);
 return {...provenance,...artifact};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 inspectBackupRun().then(row=>{
  console.log('DUEL_RETENTION_DRILL_SOURCE_OK '+JSON.stringify(row));
 }).catch(error=>{console.error('DUEL_RETENTION_DRILL_SOURCE_ERROR '+error.message);process.exitCode=1;});
}
