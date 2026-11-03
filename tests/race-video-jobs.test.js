import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const job=(race=1793188800000)=>({race,lease:'12345678-1234-4234-8234-123456789abc',show:{fixture:true}});
async function harness(t,jobs=[]){
 const dir=await mkdtemp(join(tmpdir(),'keso-video-jobs-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const preload=join(dir,'preload.mjs'),log=join(dir,'calls.jsonl'),output=join(dir,'github-output'),cache=join(dir,'jobs.json');
 await writeFile(preload,`
 import {appendFileSync,writeFileSync} from 'node:fs';
 import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
 const log=value=>appendFileSync(process.env.FIXTURE_LOG,JSON.stringify(value)+'\\n');
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input));
  if(url.hostname==='identity.fixture'){log({kind:'identity'});return Response.json({value:'fixture-oidc-token'});}
  if(url.origin!=='https://valorant-results.tealeaforest.workers.dev')throw Error('unexpected_external_request');
  if(init.headers.Authorization!=='Bearer fixture-oidc-token')throw Error('missing_fixture_identity');
  if(url.pathname==='/api/racing/video/jobs'){log({kind:'claim'});return Response.json({jobs:JSON.parse(process.env.FIXTURE_JOBS)},{status:Number(process.env.FIXTURE_QUEUE_STATUS||200)});}
  if(url.pathname==='/api/racing/video/upload'){log({kind:'upload',race:init.body.get('race'),lease:init.body.get('lease'),type:init.body.get('video').type,size:init.body.get('video').size});return Response.json({posted:true});}
  throw Error('unexpected_worker_request');
 };
 cp.spawnSync=(command,args)=>{
  if(command==='ffprobe')return {status:0,stdout:JSON.stringify({streams:[{codec_name:'h264',width:768,height:432}],format:{duration:52,size:16}})};
  if(command!=='python3')throw Error('unexpected_encoder');
  log({kind:'encode'});writeFileSync(args[2],'fixture-mp4');return {status:0};
 };syncBuiltinESMExports();
 `);
 const env={...process.env,FIXTURE_LOG:log,FIXTURE_JOBS:JSON.stringify(jobs),ACTIONS_ID_TOKEN_REQUEST_URL:'https://identity.fixture/token',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'fixture-request-secret',GITHUB_OUTPUT:output,RACE_VIDEO_CHECK_OUTPUT:join(dir,'check.mp4')};
 const run=(args,extra={})=>spawnSync(process.execPath,['--import',preload,'scripts/race-video/run.mjs',...args],{cwd:root,env:{...env,...extra},encoding:'utf8',timeout:10000});
 const calls=async()=>{try{return (await readFile(log,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch(e){if(e.code==='ENOENT')return [];throw e;}};
 return {dir,cache,output,run,calls};
}
test('all legacy production video invocations fail before fetching OIDC, claiming D1 jobs, rendering or uploading',async t=>{
 const f=await harness(t,[job()]);
 for(const args of [[],['--claim','--jobs-file',f.cache],['--jobs-file',f.cache],['--claim'],['--check','--jobs-file',f.cache],['--upload'],['--check','--claim']]){
  const result=f.run(args);
  assert.equal(result.status,2,JSON.stringify(args)+': '+result.stderr);
  assert.match(result.stderr,/race_video_delivery_disabled/);
 }
 assert.deepEqual(await f.calls(),[],'no network, D1, encoder or webhook calls');
 await assert.rejects(readFile(f.output),{code:'ENOENT'});
 await assert.rejects(readFile(f.cache),{code:'ENOENT'});
});
test('offline manual video fixture can render but makes no HTTP request or Discord upload',async t=>{
 const f=await harness(t,[job()]);
 const result=f.run(['--check']);
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/No Discord post/);
 assert.deepEqual((await f.calls()).map(c=>c.kind),['encode']);
 await assert.rejects(readFile(f.output),{code:'ENOENT'});
});
test('removed automatic trigger prevents scheduled and deploy-complete workflow dispatches',async()=>{
 const workflow=await readFile(join(root,'.github/workflows/race-video.yml'),'utf8');
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/^\s+schedule:\s*$/m);
 assert.doesNotMatch(workflow,/^\s+workflow_run:\s*$/m);
 assert.doesNotMatch(workflow,/--claim|--jobs-file|--upload/);
 assert.match(workflow,/run\.mjs --check/);
});
