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
export async function inspectBackupRun(env=process.env,request=fetch){
 if(env.GITHUB_REPOSITORY!=='altepop/keso-gamble'||!env.GITHUB_TOKEN)
  throw Error('Read-only GitHub Actions permission unavailable');
 const id=parseBackupRunId(env.DUEL_BACKUP_RUN_ID);
 const resp=await request('https://api.github.com/repos/altepop/keso-gamble/actions/runs/'+id,{
  headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json',
   'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
 if(!resp.ok)throw Error('Backup run metadata unavailable: HTTP '+resp.status);
 return validateBackupRun(await resp.json(),id);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 inspectBackupRun().then(row=>{
  console.log('DUEL_RETENTION_DRILL_SOURCE_OK '+JSON.stringify(row));
 }).catch(error=>{console.error('DUEL_RETENTION_DRILL_SOURCE_ERROR '+error.message);process.exitCode=1;});
}
