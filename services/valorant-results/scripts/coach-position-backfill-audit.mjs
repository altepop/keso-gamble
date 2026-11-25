import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {auditPositions} from './coach-position-audit.mjs';
export async function auditPositionBackfill(directory,env=process.env,request=fetch){
 const c=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8')),b=c.d1_databases?.find(x=>x.binding==='DB');
 if(c.name!=='valorant-results'||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!/^[0-9a-f-]{36}$/i.test(b?.database_id??'')||!env.CLOUDFLARE_API_TOKEN)throw Error('Invalid backfill audit configuration');
 const sql=`WITH targets AS (SELECT q.match_id,p.has_coordinates,b.status,b.reason,b.attempts FROM coach_member_queue q
 LEFT JOIN valorant_match_positions p ON p.match_id=q.match_id LEFT JOIN coach_position_backfill b ON b.match_id=q.match_id
 WHERE (q.status='complete' OR (q.status='partial' AND q.attempts>=3)) AND EXISTS(SELECT 1 FROM coach_member_links l JOIN coach_member_sources s ON s.riot_id=l.riot_id
 WHERE l.match_id=q.match_id AND s.riot_id=q.source_riot_id AND s.puuid=q.source_puuid))
 SELECT COUNT(*) AS targets,COALESCE(SUM(has_coordinates=1),0) AS captured,
 COALESCE(SUM(attempts IS NOT NULL),0) AS attempted,
 COALESCE(SUM(COALESCE(has_coordinates,0)=0 AND (status IS NULL OR status IN ('retry','running')) AND COALESCE(attempts,0)<3),0) AS pending,
 COALESCE(SUM(status='saved'),0) AS backfilled,
 COALESCE(SUM(status='unavailable' OR (status='running' AND attempts=3)),0) AS unavailable,
 COALESCE(SUM(reason='not-found'),0) AS notFound,
 COALESCE(SUM(reason='no-usable-position-response'),0) AS noPositionData,
 COALESCE(SUM(reason='retry-exhausted'),0) AS retryExhausted,
 (SELECT value FROM monitor_state WHERE key='coach_all_members:enabled') AS archiveSwitch FROM targets`;
 const r=await request('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+b.database_id+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Backfill audit HTTP '+r.status);const body=await r.json(),result=body.result?.[0];if(!body.success||!result?.success)throw Error('Backfill audit failed');
 const row=result.results?.[0],out={enabled:row?.archiveSwitch==='enabled'};
 for(const k of ['targets','captured','attempted','pending','backfilled','unavailable','notFound','noPositionData','retryExhausted']){if(!Number.isSafeInteger(row?.[k])||row[k]<0)throw Error('Invalid backfill audit counts');out[k]=row[k];}
 if(Number.isSafeInteger(result.meta?.rows_read)&&result.meta.rows_read>=0)out.rowsRead=result.meta.rows_read;
 return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)(async()=>{
 // Observe at most one existing five-minute slot. No API calls or writes here.
 for(let i=0;i<7;i++){
  const v=await auditPositionBackfill(process.cwd());console.log('COACH_POSITION_BACKFILL_AUDIT',JSON.stringify(v));
  if(process.env.WAIT_FOR_POSITION_BACKFILL!=='true'||!v.enabled||v.pending===0||v.attempted>0)break;
  if(i<6)await new Promise(r=>setTimeout(r,55000));
 }
 console.log('COACH_POSITION_STORAGE_AUDIT',JSON.stringify(await auditPositions(process.cwd())));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
