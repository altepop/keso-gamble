// Issue #194: replay MP4 delivery is permanently disabled, including stale leases,
// legacy workflow invocations and manual uploads. Live text commentary remains in
// racing-broadcast.ts and text payouts remain in racing-posts.ts.
import type {BroadcastEnv} from './racing-broadcast.ts';
import {ensureBroadcast} from './racing-broadcast.ts';

export async function claimVideoJobs(_env:BroadcastEnv,_now=Date.now()):Promise<never[]>{
 // No D1 query, claim, lease renewal or batch backlog delivery.
 return [];
}
export async function raceVideoApi(request:Request,env:BroadcastEnv){
 const path=new URL(request.url).pathname;
 if(path==='/api/racing/video/jobs'||path==='/api/racing/video/upload'){
  return new Response('Replay video delivery disabled',{status:410,headers:{'Cache-Control':'no-store'}});
 }
 if(request.method!=='GET'||path!=='/api/racing/status')return new Response('Not found',{status:404});
 await ensureBroadcast(env);
 const row=await env.DB.prepare("SELECT COUNT(*) AS races,SUM(CASE WHEN message IS NOT NULL AND message NOT IN ('creating','unknown','missing') THEN 1 ELSE 0 END) AS livePosts,SUM(CASE WHEN video='posted' THEN 1 ELSE 0 END) AS videos,MAX(CASE WHEN step=11 THEN race END) AS lastFinishedRace,MAX(CASE WHEN video='posted' THEN race END) AS lastVideoRace FROM race_broadcasts").first();
 return Response.json({enabled:Boolean(env.RACE_BROADCAST&&env.KP_EARNINGS_WEBHOOK_URL),videoPostingEnabled:false,pendingVideos:0,...row},{headers:{'Cache-Control':'no-store'}});
}
