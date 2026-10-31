// Issue #194: offline synthetic render verification ONLY.
// This runner has no Discord credentials, no OIDC API calls, no D1 job claiming
// and no production MP4 upload code. Old scheduled/queued invocations fail closed.
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {raceCard,raceResult,raceTimeline,raceOdds,raceCommentary} from '../../js/racing.js';
if(process.argv.length!==3||process.argv[2]!=='--check'){
 console.error('race_video_delivery_disabled');
 process.exit(2);
}
const folder=await mkdtemp(join(tmpdir(),'keso-video-check-'));
try{
 const start=Date.UTC(2026,9,28,12),card=raceCard(start),seed='video-check-only',result=raceResult(card,seed);
 const timeline=raceTimeline(card,result,seed),odds=raceOdds(card);
 const show={card,timeline,order:result.order,odds,commentary:raceCommentary(card,result,timeline,odds,seed)};
 const input=join(folder,'race.json');
 await writeFile(input,JSON.stringify(show));
 const encoded=spawnSync(process.env.VIDEO_PYTHON??'python3',
  [fileURLToPath(new URL('./render.py',import.meta.url)),input,join(folder,'race.mp4'),'--font',process.env.RACE_VIDEO_FONT],
  {stdio:'pipe',timeout:180000});
 if(encoded.status!==0)throw Error('encode_failed');
 const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_name,codec_type,width,height',
  '-show_entries','format=duration,size','-of','json',join(folder,'race.mp4')],
  {encoding:'utf8',timeout:15000});
 if(probe.status!==0)throw Error('video_probe_failed');
 const measured=JSON.parse(probe.stdout);
 if(measured.streams.length!==1||measured.streams[0].codec_name!=='h264'
   ||measured.streams[0].width!==768||measured.streams[0].height!==432
   ||Math.abs(Number(measured.format.duration)-52)>.1||Number(measured.format.size)>8000000)
  throw Error('video_format_failed');
 await writeFile(process.env.RACE_VIDEO_CHECK_OUTPUT??join(tmpdir(),'keso-race-check.mp4'),await readFile(join(folder,'race.mp4')));
 console.log('Video render check passed. No Discord post.');
}catch(error){
 console.error(error instanceof Error&&/^[a-z_]+$/.test(error.message)?error.message:'race_video_check_failed');
 process.exitCode=1;
}finally{await rm(folder,{recursive:true,force:true});}
