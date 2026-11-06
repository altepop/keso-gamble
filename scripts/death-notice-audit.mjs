// Read-only incident diagnostic. Never print Riot IDs, Discord IDs, match/session IDs, message text or credentials.
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {D1_B_ID} from './relic-abuse-audit.mjs';
export async function audit(query,reportedAt,now=Date.now()){
 const time=Date.parse(reportedAt);
 if(!Number.isSafeInteger(time))throw Error('Invalid report time');
 const rows=await query(`SELECT riot_id,match_id,ended_at,mode,message FROM notifications WHERE ended_at BETWEEN ? AND ? ORDER BY ended_at,riot_id LIMIT 20`,[time-30*60000,time+10*60000]);
 const waiting=await query(`SELECT s.riot_id,s.armed_at,s.expires_at,
  COALESCE((SELECT value FROM monitor_state WHERE key='death_mode:'||s.session_id||':'||s.riot_id),'unrated') AS mode
  FROM death_unrated_sessions s WHERE s.cancelled_at IS NULL AND s.match_id IS NULL ORDER BY s.armed_at DESC LIMIT 20`,[]);
 const out=['# Death verdict diagnostic (read-only)','','No names, IDs or message bodies are included.','',`Reported delivery: ${new Date(time).toISOString()}`,'',`Nearby result records: ${rows.length}`];
 const clock=n=>new Date(Number(n)).toISOString();
 const safeMode=n=>String(n??'unrated').replace(/[^a-z0-9_-]/g,'').slice(0,64);
 const folded=n=>String(n).trim().toLowerCase();
 out.push('',`Inspected at: ${clock(now)}`,`Uncancelled unclaimed reservations (including expired): ${waiting.length}`);
 for(const [i,s] of waiting.entries()){
  out.push(`- Waiting ${i+1}: ${safeMode(s.mode)}, armed ${clock(s.armed_at)}, expires ${clock(s.expires_at)}, valid_now=${Number(s.armed_at)<=now&&Number(s.expires_at)>now}`);
 }
 if(waiting.length===20)out.push('Waiting reservation limit reached; this is not a complete inventory.');
 for(const [i,row] of rows.entries()){
  const sessions=await query(`SELECT s.armed_at,s.expires_at,s.cancelled_at,s.match_id,
   COALESCE((SELECT value FROM monitor_state WHERE key='death_mode:'||s.session_id||':'||s.riot_id),'unrated') AS mode
   FROM death_unrated_sessions s WHERE s.riot_id=? AND (s.match_id=? OR (s.armed_at<=? AND s.armed_at>=?)) ORDER BY s.armed_at DESC LIMIT 10`,[row.riot_id,row.match_id,row.ended_at,Number(row.ended_at)-24*3600000]);
  const post=await query('SELECT 1 AS present FROM monitor_state WHERE key=?',['post:'+row.match_id]);
  const verdict=String(row.message).includes('コンペ行き確定')?'competitive':String(row.message).includes('今回はセーフ')?'safe':String(row.message).includes('判定保留')?'pending':'ordinary';
  const mode=String(row.mode??'none').replace(/[^a-z0-9_-]/g,'').slice(0,64);
  out.push('',`## Result ${i+1}`,`- Finished: ${clock(row.ended_at)}`,`- Stored mode: ${mode}`,`- Stored verdict: ${verdict}`,`- Discord post recorded: ${post.length>0}`,`- Prior-24h/claimed reservations: ${sessions.length}`);
  for(const [j,s] of waiting.entries()){
   const exact=s.riot_id===row.riot_id;
   const normalized=folded(s.riot_id)===folded(row.riot_id);
   out.push(`  - Waiting ${j+1} comparison: exact_account=${exact}, casefold_account=${normalized}, armed_before_end=${Number(s.armed_at)<=Number(row.ended_at)}, end_within_window=${Number(s.armed_at)<=Number(row.ended_at)&&Number(s.expires_at)>=Number(row.ended_at)}`);
  }
  for(const s of sessions){
   const selected=String(s.mode??'unrated').replace(/[^a-z0-9_-]/g,'').slice(0,64);
   out.push(`  - ${selected}: armed ${clock(s.armed_at)}, expires ${clock(s.expires_at)}, cancelled=${s.cancelled_at!==null}, claimed_this_match=${s.match_id===row.match_id}, waiting=${s.match_id===null}, end_within_window=${s.armed_at<=row.ended_at&&s.expires_at>=row.ended_at}`);
  }
 }
 if(rows.length===20)out.push('','Result limit reached; this report is not a complete inventory.');
 return out.join('\n')+'\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const e=process.env;if(!e.CLOUDFLARE_API_TOKEN||!e.CLOUDFLARE_ACCOUNT_ID)throw Error('Cloudflare credentials are missing');
 const query=async(sql,params)=>{
  if(!/^SELECT\s/.test(sql))throw Error('Only SELECT is allowed');
  const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+e.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+D1_B_ID+'/query',{method:'POST',headers:{Authorization:'Bearer '+e.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('D1 HTTP '+r.status);
  const body=await r.json();if(body.success!==true||!body.result?.[0]?.success)throw Error('D1 read failed');return body.result[0].results;
 };
 const report=await audit(query,e.REPORTED_AT||'2026-11-07T00:37:00+09:00');console.log(report);if(e.GITHUB_STEP_SUMMARY)appendFileSync(e.GITHUB_STEP_SUMMARY,report);
}
