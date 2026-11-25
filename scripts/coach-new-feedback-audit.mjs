// Read-only production verification of natural replay delivery after 2026-11-24 02:33 JST.
// No webhooks, forced resends, external match API calls, or D1 mutations.
import {pathToFileURL} from 'node:url';
export const SINCE=Date.parse('2026-11-24T02:33:00+09:00');
const jst=at=>Number.isFinite(at)&&at>0?new Date(at+9*3600_000).toISOString().replace('T',' ').slice(0,19)+' JST':null;
const parse=value=>{try{return value?JSON.parse(value):null}catch{return null}};
export function summarizeNewCoachReceipts(rows){
 return rows.map(r=>{
  const receipt=parse(r.receipt),diagnostic=parse(r.replay_diagnostic);
  let postedAt=null;
  if(typeof receipt?.messageId==='string'&&/^\d{17,22}$/.test(receipt.messageId)){
   try{postedAt=jst(Number((BigInt(receipt.messageId)>>22n)+1420070400000n))}catch{}
  }
  const riot=String(r.riot_id).toLowerCase();
  return {member:riot==='dolly#sdgs'?'VDK':riot==='h1d3g1g4s#1037'?'石原':riot.startsWith('frin#')?'藤村':'その他',
   matchId:r.match_id,endedJst:jst(Number(r.ended_at)),map:r.map,outcome:r.outcome,
   resultNoticeSent:r.sent===1,resultNoticePostedJst:null,
   rosterSaved:r.roster_saved===1,roundsSaved:r.rounds_saved===1,killsSaved:r.kills_saved===1,
   profileLinked:r.profile_linked===1,
   receiptState:receipt?.state??'none',httpStatus:receipt?.httpStatus??null,
   replayStatus:diagnostic?.status??null,replayAttemptJst:jst(Number(diagnostic?.at)),
   postedJst:postedAt,postedText:receipt?.state==='posted'?receipt?.content??null:null};
 });
}
export async function auditNewCoachReceipts(env=process.env,request=fetch){
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[a-f0-9]{32}$/i.test(account??'')||!token)throw Error('configuration');
 const base='https://api.cloudflare.com/client/v4/accounts/'+account;
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const settings=await request(base+'/workers/scripts/valorant-results/settings',{headers,redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!settings.ok)throw Error('settings');
 const binding=(await settings.json()).result?.bindings?.filter(x=>x.type==='d1'&&x.name==='DB');
 if(binding?.length!==1||!/^[a-f0-9-]{36}$/i.test(binding[0].id))throw Error('binding');
 const sql=[
  'SELECT n.riot_id,n.match_id,n.ended_at,n.outcome,n.sent,r.map,',
  'CASE WHEN r.match_id IS NOT NULL THEN 1 ELSE 0 END AS roster_saved,',
  'CASE WHEN e.rounds_json IS NOT NULL THEN 1 ELSE 0 END AS rounds_saved,',
  'CASE WHEN e.kills_json IS NOT NULL THEN 1 ELSE 0 END AS kills_saved,',
  'CASE WHEN a.subject_id IS NOT NULL THEN 1 ELSE 0 END AS profile_linked,',
  's.value AS receipt,COALESCE(d2.value,d1.value) AS replay_diagnostic',
  'FROM notifications n LEFT JOIN tracked_players t ON lower(t.riot_id)=lower(n.riot_id)',
  'LEFT JOIN coach_profile_accounts a ON a.puuid=t.puuid',
  'LEFT JOIN valorant_match_rosters r ON r.match_id=n.match_id',
  'LEFT JOIN valorant_match_round_events e ON e.match_id=n.match_id',
  "LEFT JOIN monitor_state s ON s.key='coach_personal_feedback:v1:'||a.subject_id||':'||n.match_id",
  "LEFT JOIN monitor_state d2 ON d2.key='coach_feedback_replay_result:v2:'||a.subject_id||':'||n.match_id",
  "LEFT JOIN monitor_state d1 ON d1.key='coach_feedback_replay_result:v1:'||n.match_id",
  "WHERE n.mode='competitive' AND n.ended_at>=? AND lower(n.riot_id) IN ('dolly#sdgs','h1d3g1g4s#1037','frin#怖すぎ')",
  'ORDER BY n.ended_at DESC LIMIT 50'
 ].join(' ');
 if(!sql.startsWith('SELECT ')||sql.includes(';'))throw Error('not_select');
 const res=await request(base+'/d1/database/'+binding[0].id+'/query',{method:'POST',headers,
  body:JSON.stringify({sql,params:[SINCE]}),redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!res.ok)throw Error('query_http');
 const out=await res.json(),q=out.result?.[0];
 if(!out.success||!q?.success||!Array.isArray(q.results))throw Error('query');
 return {at:new Date().toISOString(),sinceJst:'2026-11-24 02:33:00 JST',
  rows:summarizeNewCoachReceipts(q.results),rowsRead:q.meta?.rows_read??null,mutations:0,discordPosts:0,henrikCalls:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log('COACH_NEW_FEEDBACK_RECEIPT_AUDIT '+JSON.stringify(await auditNewCoachReceipts()));}
 catch{console.error('COACH_NEW_FEEDBACK_RECEIPT_AUDIT_UNAVAILABLE');process.exitCode=1;}
}
