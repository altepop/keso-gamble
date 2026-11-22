// Fixed 06:57 JST incident. SELECT only. No IDs, tokens or raw provider data in output.
import {pathToFileURL} from 'node:url';
const START=Date.parse('2026-11-22T06:57:00+09:00');
const OWN="((json_extract(p.value,'$.name')='Aquatopia' AND json_extract(p.value,'$.tag')='toppy') OR (json_extract(p.value,'$.name')='Abema' AND json_extract(p.value,'$.tag')='ttv') OR json_extract(p.value,'$.puuid') IN (SELECT s.puuid FROM coach_member_sources s WHERE s.riot_id IN ('Aquatopia#toppy','Abema#ttv') AND s.puuid IS NOT NULL))";
const PS="json_each(CASE WHEN json_valid(r.players_json) THEN r.players_json ELSE '[]' END)";
const fields=[
 "COUNT(*) AS matches",
 "COALESCE(SUM(CASE WHEN r.map IS NOT NULL AND length(r.map)>0 THEN 1 ELSE 0 END),0) AS map_known",
 "COALESCE(SUM(CASE WHEN json_valid(r.teams_json) AND json_array_length(r.teams_json)=2 THEN 1 ELSE 0 END),0) AS teams_known",
 "COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM "+PS+" p WHERE "+OWN+" AND json_type(p.value,'$.k')='integer' AND json_type(p.value,'$.d')='integer' AND json_type(p.value,'$.a')='integer') THEN 1 ELSE 0 END),0) AS kda_known",
 "COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM "+PS+" p WHERE "+OWN+" AND json_type(p.value,'$.score')='integer') THEN 1 ELSE 0 END),0) AS score_known",
 "COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM "+PS+" p WHERE "+OWN+" AND json_type(p.value,'$.agent')='text' AND length(json_extract(p.value,'$.agent'))>0) THEN 1 ELSE 0 END),0) AS agent_known",
 "COALESCE(SUM(CASE WHEN json_valid(e.rounds_json) AND json_array_length(e.rounds_json)>0 THEN 1 ELSE 0 END),0) AS rounds_known",
 "COALESCE(SUM(CASE WHEN json_valid(e.kills_json) AND json_array_length(e.kills_json)>0 THEN 1 ELSE 0 END),0) AS kills_known",
 "COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM notifications n WHERE n.match_id=r.match_id) THEN 1 ELSE 0 END),0) AS monitor_linked",
 "COALESCE(SUM(CASE WHEN q.match_id IS NOT NULL THEN 1 ELSE 0 END),0) AS queue_linked",
 "COALESCE(SUM(CASE WHEN q.status='pending' THEN 1 ELSE 0 END),0) AS pending",
 "COALESCE(SUM(CASE WHEN q.status='partial' THEN 1 ELSE 0 END),0) AS partial",
 "COALESCE(SUM(CASE WHEN q.status='unavailable' THEN 1 ELSE 0 END),0) AS unavailable",
 "COALESCE(SUM(CASE WHEN q.status='complete' THEN 1 ELSE 0 END),0) AS complete",
 "COALESCE(MAX(q.attempts),0) AS max_attempts",
 "COALESCE(SUM(CASE WHEN (SELECT value FROM monitor_state m WHERE m.key='coach_round_backfill:unavailable:'||r.match_id)='404' THEN 1 ELSE 0 END),0) AS reason_404",
 "COALESCE(SUM(CASE WHEN (SELECT value FROM monitor_state m WHERE m.key='coach_round_backfill:unavailable:'||r.match_id)='missing_kills' THEN 1 ELSE 0 END),0) AS reason_missing_kills"
];
const query1="SELECT "+fields.join(", ")+" FROM valorant_match_rosters r LEFT JOIN valorant_match_round_events e ON e.match_id=r.match_id LEFT JOIN coach_member_queue q ON q.match_id=r.match_id WHERE r.ended_at>=? AND r.ended_at<? AND EXISTS (SELECT 1 FROM "+PS+" p WHERE "+OWN+")";
const query2="SELECT COUNT(*) AS queue_start_count, COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0) AS queue_start_pending, COALESCE(SUM(CASE WHEN status='unavailable' THEN 1 ELSE 0 END),0) AS queue_start_unavailable FROM coach_member_queue WHERE started_at>=? AND started_at<? AND source_riot_id IN ('Aquatopia#toppy','Abema#ttv')";
export async function auditCoach0657(env=process.env,request=fetch){
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[a-f0-9]{32}$/i.test(account??'')||!token)throw Error('config');
 const base='https://api.cloudflare.com/client/v4/accounts/'+account;
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const settings=await request(base+'/workers/scripts/valorant-results/settings',{headers,redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!settings.ok)throw Error('settings');
 const conf=await settings.json(),bound=conf.result?.bindings?.filter(b=>b.type==='d1'&&b.name==='DB');
 if(!conf.success||bound?.length!==1||!/^[a-f0-9-]{36}$/i.test(bound[0].id))throw Error('binding');
 async function select(sql){
  if(!sql.startsWith('SELECT ')||sql.includes(';'))throw Error('unsafe');
  const response=await request(base+'/d1/database/'+bound[0].id+'/query',{method:'POST',headers,redirect:'error',
   body:JSON.stringify({sql,params:[START,START+60000]}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('query');
  const out=await response.json();
  if(!out.success||!out.result?.[0]?.success||out.result[0].results?.length!==1)throw Error('query');
  return out.result[0].results[0];
 }
 const counts={...await select(query1),...await select(query2)};
 const result={timestampJst:'2026-11-22 06:57',source:'read-only live D1'};
 for(const [k,v] of Object.entries(counts)){
  const n=Number(v??0);if(!Number.isSafeInteger(n)||n<0)throw Error('counts');
  result[k]=n;
 }
 return {...result,queries:2,mutations:0,extraProviderRequests:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log('COACH_0657_READONLY '+JSON.stringify(await auditCoach0657()));}
 catch{console.log('COACH_0657_READONLY_UNAVAILABLE');}
}
