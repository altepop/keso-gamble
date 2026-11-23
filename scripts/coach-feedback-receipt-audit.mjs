// Read-only 2026-11-24 incident audit. No Henrik requests or Discord posts.
import {pathToFileURL} from 'node:url';
export const WINDOW_START=Date.parse('2026-11-24T00:10:00+09:00');
export const WINDOW_END=Date.parse('2026-11-24T01:15:00+09:00');
const SELECT=[
 'SELECT n.riot_id,n.match_id,n.ended_at,n.outcome,n.mode,r.map,',
 "(SELECT json_extract(j.value,'$.agent') FROM json_each(COALESCE(r.players_json,'[]')) j",
 "WHERE lower(json_extract(j.value,'$.name')||'#'||json_extract(j.value,'$.tag'))=lower(n.riot_id) LIMIT 1) AS agent,",
 'CASE WHEN r.match_id IS NOT NULL THEN 1 ELSE 0 END AS roster_saved,',
 'CASE WHEN e.rounds_json IS NOT NULL THEN 1 ELSE 0 END AS rounds_saved,',
 'CASE WHEN e.kills_json IS NOT NULL THEN 1 ELSE 0 END AS kills_saved,',
 'CASE WHEN a.subject_id IS NOT NULL THEN 1 ELSE 0 END AS profile_linked,',
 's.value AS receipt,d.value AS replay_diagnostic,',
 "(SELECT last_ok FROM kp_health WHERE feature='coach_personal_feedback_replay') AS replay_last_ok,",
 "(SELECT last_error FROM kp_health WHERE feature='coach_personal_feedback_replay') AS replay_last_error,",
 '(SELECT failures FROM kp_health WHERE feature=\'coach_personal_feedback_replay\') AS replay_failures FROM notifications n',
 'LEFT JOIN valorant_match_rosters r ON r.match_id=n.match_id',
 'LEFT JOIN valorant_match_round_events e ON e.match_id=n.match_id',
 'LEFT JOIN tracked_players t ON lower(t.riot_id)=lower(n.riot_id)',
 'LEFT JOIN coach_profile_accounts a ON a.puuid=t.puuid',
 "LEFT JOIN monitor_state s ON s.key='coach_personal_feedback:v1:'||a.subject_id||':'||n.match_id",
 "LEFT JOIN monitor_state d ON d.key='coach_feedback_replay_result:v1:'||n.match_id",
 "WHERE lower(n.riot_id) IN ('dolly#sdgs','h1d3g1g4s#1037')",
 "AND n.mode='competitive' AND n.ended_at BETWEEN ? AND ?",
 'ORDER BY n.ended_at DESC LIMIT 12'
].join(' ');
const jst=at=>Number.isFinite(at)&&at>0?new Date(at+9*3600_000).toISOString().replace('T',' ').slice(0,19)+' JST':null;
function receiptJson(x){try{return x&&typeof x==='string'?JSON.parse(x):null;}catch{return null;}}
export function summarizeCoachFeedbackAudit(rows){
 return rows.map(r=>{
  const value=receiptJson(r.receipt),diagnostic=receiptJson(r.replay_diagnostic),claimedAt=Number(value?.at);
  let postedAt=null;
  if(typeof value?.messageId==='string'&&/^\d{17,22}$/.test(value.messageId)){
   try{postedAt=jst(Number((BigInt(value.messageId)>>22n)+1420070400000n));}catch{}
  }
  return {member:String(r.riot_id).toLowerCase()==='dolly#sdgs'?'VDK':'石原',
   matchId:r.match_id,endedJst:jst(Number(r.ended_at)),map:r.map,outcome:r.outcome,agent:r.agent,
   rosterSaved:r.roster_saved===1,roundsSaved:r.rounds_saved===1,killsSaved:r.kills_saved===1,
   profileLinked:r.profile_linked===1,receiptState:value?.state??'none',
   claimedJst:jst(claimedAt),postedJst:postedAt,httpStatus:value?.httpStatus??null,
   replayLastOkJst:jst(Number(r.replay_last_ok)),replayLastErrorJst:jst(Number(r.replay_last_error)),
   replayFailures:r.replay_failures??null,replayResult:diagnostic?.status??null,
   replayAttemptJst:jst(Number(diagnostic?.at)),
   postedText:value?.state==='posted'?value.content??null:null};
 });
}
export async function auditCoachFeedback(env=process.env,request=fetch){
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[a-f0-9]{32}$/i.test(account??'')||!token)throw Error('configuration');
 const base='https://api.cloudflare.com/client/v4/accounts/'+account;
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const settings=await request(base+'/workers/scripts/valorant-results/settings',
   {headers,redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!settings.ok)throw Error('settings');
 const sb=await settings.json();
 const bindings=sb.result?.bindings?.filter(b=>b.type==='d1'&&b.name==='DB');
 if(!sb.success||bindings?.length!==1||!/^[a-f0-9-]{36}$/i.test(bindings[0].id))throw Error('binding');
 if(!SELECT.trim().startsWith('SELECT ')||SELECT.includes(';'))throw Error('select_only');
 const res=await request(base+'/d1/database/'+bindings[0].id+'/query',{
 method:'POST',headers,body:JSON.stringify({sql:SELECT,params:[WINDOW_START,WINDOW_END]}),
 redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!res.ok)throw Error('query');
 const payload=await res.json(),q=payload.result?.[0];
 if(!payload.success||!q?.success||!Array.isArray(q.results))throw Error('query');
 return {at:new Date().toISOString(),windowJst:'2026-11-24 00:10–01:15',
  rows:summarizeCoachFeedbackAudit(q.results),rowsRead:q.meta?.rows_read??null,mutations:0,henrikCalls:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log('COACH_FEEDBACK_RECEIPT_AUDIT '+JSON.stringify(await auditCoachFeedback()));}
 catch{console.error('COACH_FEEDBACK_RECEIPT_AUDIT_UNAVAILABLE');process.exitCode=1;}
}
