import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {raceCard,raceResult,raceTimeline,raceOdds,raceCommentary} from '../../js/racing.js';
const base='https://valorant-results.tealeaforest.workers.dev',check=process.argv.includes('--check');
const folder=await mkdtemp(join(tmpdir(),'keso-video-'));
async function identity(){
 const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);url.searchParams.set('audience','keso-race-video');
 const r=await fetch(url,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('identity_failed');return (await r.json()).value;
}
function encode(path){
 const result=spawnSync(process.env.VIDEO_PYTHON??'python3',[fileURLToPath(new URL('./render.py',import.meta.url)),path,join(folder,'race.mp4'),'--font',process.env.RACE_VIDEO_FONT],{stdio:'pipe',timeout:180000});
 if(result.status!==0)throw Error('encode_failed');
}
try{
 if(check){
  const start=Date.UTC(2026,9,28,12),card=raceCard(start),seed='video-check-only',result=raceResult(card,seed);
  const show={card,timeline:raceTimeline(card,result,seed),order:result.order,odds:raceOdds(card),commentary:raceCommentary(card,result,raceTimeline(card,result,seed),raceOdds(card),seed)};
  const input=join(folder,'race.json');await writeFile(input,JSON.stringify(show));encode(input);
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_name,codec_type,width,height','-show_entries','format=duration,size','-of','json',join(folder,'race.mp4')],{encoding:'utf8',timeout:15000});
  if(probe.status!==0)throw Error('video_probe_failed');
  const measured=JSON.parse(probe.stdout);if(measured.streams.length!==1||measured.streams[0].codec_name!=='h264'||measured.streams[0].width!==768||measured.streams[0].height!==432||Math.abs(Number(measured.format.duration)-52)>.1||Number(measured.format.size)>8000000)throw Error('video_format_failed');
  await writeFile(process.env.RACE_VIDEO_CHECK_OUTPUT??join(tmpdir(),'keso-race-check.mp4'),await readFile(join(folder,'race.mp4')));
  console.log('Video render check passed. No Discord post.');
 }else{
  const response=await fetch(base+'/api/racing/video/jobs',{headers:{Authorization:'Bearer '+await identity()},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('queue_http_'+response.status);
  const {jobs}=await response.json();if(!Array.isArray(jobs)||jobs.length>2)throw Error('invalid_queue');
  let sent=0;
  for(const job of jobs){
   const input=join(folder,'race.json');await writeFile(input,JSON.stringify(job.show));encode(input);
   const body=new FormData();body.set('race',String(job.race));body.set('lease',job.lease);body.set('video',new Blob([await readFile(join(folder,'race.mp4'))],{type:'video/mp4'}),'race.mp4');
   const uploaded=await fetch(base+'/api/racing/video/upload',{method:'POST',headers:{Authorization:'Bearer '+await identity()},body,signal:AbortSignal.timeout(60000)});
   if(!uploaded.ok)throw Error('delivery_http_'+uploaded.status);sent++;
  }
  console.log('Race videos posted: '+sent);
 }
}catch(error){console.error(error instanceof Error&&/^[a-z_]+(?:_\d{3})?$/.test(error.message)?error.message:'race_video_failed');process.exitCode=1;}
finally{await rm(folder,{recursive:true,force:true});}
