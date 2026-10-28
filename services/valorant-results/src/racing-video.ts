import type {BroadcastEnv,BroadcastRow} from './racing-broadcast.ts';
import {ensureBroadcast} from './racing-broadcast.ts';
import {earningsWebhook} from './racing-posts.ts';
// No shared secret: only the main-branch rendering workflow can upload via GitHub OIDC.
export const VIDEO_AUDIENCE='keso-race-video';
const ISSUER='https://token.actions.githubusercontent.com';
const WORKFLOW='altepop/keso-gamble/.github/workflows/race-video.yml@refs/heads/main';
const decode=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export function validVideoClaims(c:any,now=Date.now()){
 return c.iss===ISSUER&&c.aud===VIDEO_AUDIENCE&&c.repository_id==='1432637117'&&c.repository_owner_id==='338350078'&&c.repository==='altepop/keso-gamble'&&c.ref==='refs/heads/main'&&c.workflow_ref===WORKFLOW&&['schedule','workflow_dispatch','workflow_run'].includes(c.event_name)&&Number.isFinite(c.exp)&&c.exp*1000>now&&Number.isFinite(c.nbf)&&c.nbf*1000<=now+30000&&Number.isFinite(c.iat)&&Math.abs(now-c.iat*1000)<=600000;
}
let keys:{until:number;keys:JsonWebKey[]} |undefined;
export async function videoIdentity(request:Request,now=Date.now()){
 const bearer=request.headers.get('Authorization')??'';if(!bearer.startsWith('Bearer ')||bearer.length>16000)return false;
 try{
  const parts=bearer.slice(7).split('.');if(parts.length!==3)return false;
  const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if(header.alg!=='RS256'||typeof header.kid!=='string'||!validVideoClaims(claims,now))return false;
  if(!keys||keys.until<now||!keys.keys.some(k=>(k as any).kid===header.kid)){
   const r=await fetch(ISSUER+'/.well-known/jwks',{signal:AbortSignal.timeout(10000)});if(!r.ok)return false;
   const jwks=await r.json() as {keys:JsonWebKey[]};keys={until:now+3600000,keys:jwks.keys};
  }
  const jwk=keys.keys.find(k=>(k as any).kid===header.kid);if(!jwk)return false;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
 }catch{return false;}
}
export async function claimVideoJobs(env:BroadcastEnv,now=Date.now()){
 await ensureBroadcast(env);
 const rows=(await env.DB.prepare("SELECT * FROM race_broadcasts WHERE race+50000<=? AND race>=? AND (video='pending' OR (video='claimed' AND lease_until<?)) AND retry_at<=? ORDER BY race DESC LIMIT 2").bind(now,now-6*3600000,now,now).all<BroadcastRow>()).results;
 const jobs=[];
 for(const row of rows){const lease=crypto.randomUUID();
  const changed=await env.DB.prepare("UPDATE race_broadcasts SET video='claimed',lease=?,lease_until=? WHERE guild=? AND race=? AND (video='pending' OR (video='claimed' AND lease_until<?))").bind(lease,now+20*60000,row.guild,row.race,now).run();
  if(changed.meta.changes)jobs.push({race:row.race,lease,show:JSON.parse(row.snapshot)});
 }
 return jobs;
}
export async function raceVideoApi(request:Request,env:BroadcastEnv,identity=videoIdentity){
 const path=new URL(request.url).pathname;
 await ensureBroadcast(env);
 if(request.method==='GET'&&path==='/api/racing/status'){
  const row=await env.DB.prepare("SELECT COUNT(*) AS races,SUM(CASE WHEN message IS NOT NULL AND message NOT IN ('creating','unknown','missing') THEN 1 ELSE 0 END) AS livePosts,SUM(CASE WHEN video IN ('pending','claimed','uploading') THEN 1 ELSE 0 END) AS pendingVideos,SUM(CASE WHEN video='posted' THEN 1 ELSE 0 END) AS videos,MAX(CASE WHEN step=11 THEN race END) AS lastFinishedRace,MAX(CASE WHEN video='posted' THEN race END) AS lastVideoRace FROM race_broadcasts").first();
  return Response.json({enabled:Boolean(env.RACE_BROADCAST&&earningsWebhook(env)),...row},{headers:{'Cache-Control':'no-store'}});
 }
 if(!await identity(request))return new Response('Unauthorized',{status:401});
 if(request.method==='GET'&&path==='/api/racing/video/jobs')return Response.json({jobs:await claimVideoJobs(env)},{headers:{'Cache-Control':'no-store'}});
 if(request.method!=='POST'||path!=='/api/racing/video/upload')return new Response('Not found',{status:404});
 if(Number(request.headers.get('content-length')??0)>8500000)return new Response('Too large',{status:413});
 const form=await request.formData(),race=Number(form.get('race')),lease=String(form.get('lease')),file=form.get('video');
 if(!(file instanceof File)||file.size>8000000||file.size<24||file.type!=='video/mp4')return new Response('Invalid video',{status:400});
 const magic=new Uint8Array(await file.slice(0,12).arrayBuffer());if(String.fromCharCode(...magic.slice(4,8))!=='ftyp')return new Response('Invalid MP4',{status:400});
 const row=await env.DB.prepare('SELECT * FROM race_broadcasts WHERE race=? AND lease=?').bind(race,lease).first<BroadcastRow>();
 if(!row||Date.now()<race+50000)return new Response('Invalid lease',{status:409});
 if(row.video==='posted')return Response.json({posted:true,duplicate:true});
 if(row.video!=='claimed'||row.lease_until<Date.now())return new Response('Expired lease',{status:409});
 const url=earningsWebhook(env);if(!url)return new Response('Unavailable',{status:503});
 const changed=await env.DB.prepare("UPDATE race_broadcasts SET video='uploading' WHERE guild=? AND race=? AND lease=? AND video='claimed'").bind(row.guild,race,lease).run();if(!changed.meta.changes)return new Response('Already uploading',{status:409});
 const show=JSON.parse(row.snapshot),body=new FormData();
 body.set('payload_json',JSON.stringify({content:`🎬 **${show.card.name.replace(/[@`*_~<>|\r\n]/g,'')}** レース映像\n${row.channel&&row.message&&/^\d+$/.test(row.message)?`実況の投稿：https://discord.com/channels/${row.guild}/${row.channel}/${row.message}`:'確定した着順を再現した映像です。'}`,allowed_mentions:{parse:[]},attachments:[{id:0,filename:'keso-race-'+race+'.mp4'}]}));
 body.set('files[0]',file,'keso-race-'+race+'.mp4');url.searchParams.set('wait','true');
 try{
  const response=await fetch(url,{method:'POST',body,signal:AbortSignal.timeout(30000)});
  if(!response.ok){
   if(response.status>=500)throw Error('Delivery uncertain');
   let wait=300000;if(response.status===429){const limited=await response.json().catch(()=>({})) as {retry_after?:number};const seconds=Number(limited.retry_after);if(Number.isFinite(seconds))wait=Math.max(wait,seconds*1000);}
   await env.DB.prepare("UPDATE race_broadcasts SET video='pending',lease=NULL,retry_at=? WHERE guild=? AND race=?").bind(Date.now()+wait,row.guild,race).run();return new Response('Delivery pending',{status:503});
  }
  const message=await response.json() as {id:string};if(!/^\d{15,22}$/.test(message.id))throw Error('Invalid delivery response');
  await env.DB.prepare("UPDATE race_broadcasts SET video='posted',video_message=? WHERE guild=? AND race=? AND lease=?").bind(message.id,row.guild,race,lease).run();return Response.json({posted:true});
 }catch{await env.DB.prepare("UPDATE race_broadcasts SET video='unknown' WHERE guild=? AND race=? AND video='uploading'").bind(row.guild,race).run();return new Response('Delivery unconfirmed',{status:503});}
}
