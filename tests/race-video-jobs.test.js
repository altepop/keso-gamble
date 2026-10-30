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
test('an empty video queue reports no work without preparing or invoking an encoder',async t=>{
 const f=await harness(t);const result=f.run(['--claim','--jobs-file',f.cache]);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Skipping video tools/);assert.equal(await readFile(f.output,'utf8'),'has_jobs=false\n');
 assert.deepEqual((await f.calls()).map(c=>c.kind),['identity','claim']);assert.deepEqual(JSON.parse(await readFile(f.cache,'utf8')).jobs,[]);assert.equal((await stat(f.cache)).mode&0o777,0o600);
 const render=f.run(['--jobs-file',f.cache]);assert.equal(render.status,0,render.stderr);assert.match(render.stdout,/Race videos posted: 0/);assert.deepEqual((await f.calls()).map(c=>c.kind),['identity','claim']);
});
test('video jobs are claimed once before tools, then the same leases are encoded and delivered',async t=>{
 const jobs=[job(),job(1793189700000)],f=await harness(t,jobs);
 const claimed=f.run(['--claim','--jobs-file',f.cache]);assert.equal(claimed.status,0,claimed.stderr);assert.equal(await readFile(f.output,'utf8'),'has_jobs=true\n');assert.deepEqual((await f.calls()).map(c=>c.kind),['identity','claim']);
 const saved=await readFile(f.cache,'utf8');assert(!saved.includes('fixture-oidc-token'));assert(!saved.includes('fixture-request-secret'));assert.deepEqual(JSON.parse(saved).jobs,jobs);
 const delivered=f.run(['--jobs-file',f.cache]);assert.equal(delivered.status,0,delivered.stderr);assert.match(delivered.stdout,/Race videos posted: 2/);
 const calls=await f.calls();assert.equal(calls.filter(c=>c.kind==='claim').length,1);assert.equal(calls.filter(c=>c.kind==='encode').length,2);
 assert.deepEqual(calls.filter(c=>c.kind==='upload').map(c=>[Number(c.race),c.lease,c.type]),jobs.map(j=>[j.race,j.lease,'video/mp4']));
});
test('a failed queue request stops instead of claiming there is no video work',async t=>{
 const f=await harness(t),result=f.run(['--claim','--jobs-file',f.cache],{FIXTURE_QUEUE_STATUS:'503'});assert.equal(result.status,1);assert.match(result.stderr,/queue_http_503/);await assert.rejects(readFile(f.cache),{code:'ENOENT'});await assert.rejects(readFile(f.output),{code:'ENOENT'});assert.equal((await f.calls()).filter(c=>c.kind==='encode').length,0);
});
test('stale or malformed job handoffs cannot start rendering or upload',async t=>{
 for(const data of [{claimedAt:Date.now()-21*60000,jobs:[job()]},{claimedAt:Date.now()+60000,jobs:[job()]},{claimedAt:Date.now(),jobs:[job(),job()]},{claimedAt:Date.now(),jobs:[{...job(),lease:'invalid'}]}]){
  const f=await harness(t);await writeFile(f.cache,JSON.stringify(data));const result=f.run(['--jobs-file',f.cache]);assert.equal(result.status,1);assert.match(result.stderr,/invalid_job_handoff/);assert.deepEqual(await f.calls(),[]);
 }
});
test('oversized handoffs and invalid argument combinations fail before any external request',async t=>{
 const f=await harness(t);await writeFile(f.cache,'x'.repeat(1024*1024+1));const oversized=f.run(['--jobs-file',f.cache]);assert.equal(oversized.status,1);assert.match(oversized.stderr,/invalid_job_handoff/);
 for(const args of [['--claim'],['--jobs-file'],['--check','--claim','--jobs-file',f.cache]]){const result=f.run(args);assert.equal(result.status,1);assert.match(result.stderr,/invalid_arguments/);}
 assert.deepEqual(await f.calls(),[]);
});
test('manual video check renders its fixture without claiming or posting live races',async t=>{
 const f=await harness(t,[job()]),result=f.run(['--check']);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/No Discord post/);assert.deepEqual((await f.calls()).map(c=>c.kind),['encode']);await assert.rejects(readFile(f.output),{code:'ENOENT'});
});
test('the existing direct CLI still claims and renders in a single invocation',async t=>{
 const f=await harness(t,[job()]),result=f.run([]);assert.equal(result.status,0,result.stderr);assert.deepEqual((await f.calls()).map(c=>c.kind),['identity','claim','encode','identity','upload']);
});
