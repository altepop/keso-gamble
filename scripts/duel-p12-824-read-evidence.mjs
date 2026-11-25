/** P12 #824: single-query read-only counterfactual, NOT a live traffic savings claim.
 * The SQL and binding order are copied from duel-history.ts at pre-#824 main e189a4c.
 * Requires explicit authenticated member identifiers; never prints them, returned rows, SQL or credentials.
 * Invocation: CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... D1_DATABASE_ID=...
 *             DUEL_EVIDENCE_GUILD=... DUEL_EVIDENCE_USER=... node scripts/duel-p12-824-read-evidence.mjs
 */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export const legacyPvpSessionSql=`SELECT s.id,s.game,s.difficulty,s.turn,s.winner,s.version,s.human_moves,s.cpu_moves,
   s.created_at,s.updated_at,d.jst_day AS daily_day
   FROM kp_duel_pve_sessions s
   LEFT JOIN kp_duel_pve_daily_entries d ON d.guild=s.guild AND d.user=s.user AND d.session_id=s.id
   WHERE s.guild=? AND s.user=? AND (?='all' OR ?='pve')
     AND (?='all' OR s.game=?)
   ORDER BY s.updated_at DESC,s.id DESC LIMIT ?`;

export async function collectEvidence(env=process.env,request=fetch){
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 const database=env.D1_DATABASE_ID,guild=env.DUEL_EVIDENCE_GUILD,user=env.DUEL_EVIDENCE_USER;
 if(!/^[0-9a-f]{32}$/i.test(account??'')||!/^[0-9a-f-]{36}$/i.test(database??'')||
    !token||!/^[0-9]{15,22}$/.test(guild??'')||!/^[0-9]{15,22}$/.test(user??''))
  throw Error('Missing or invalid read-only evidence configuration');
 // Source baseline is exactly the old PvP-only discarded session SELECT, same 20-row cap.
 const params=[guild,user,'pvp','pvp','all','all',20];
 const response=await request('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+database+'/query',{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({sql:legacyPvpSessionSql,params}),signal:AbortSignal.timeout(20000)
 });
 if(!response.ok)throw Error('Read-only D1 evidence request failed (HTTP '+response.status+')');
 const payload=await response.json(),result=payload.result?.[0];
 if(!payload.success||!result?.success||!Number.isSafeInteger(result.meta?.rows_read)||
    !Array.isArray(result.results))throw Error('D1 did not return valid rows-read evidence');
 if(result.results.length!==0)throw Error('Unexpected legacy PvP session results');
 return {slice:'#824',sourceBaseline:'e189a4c',mode:'pvp',game:'all',limit:20,
  legacyQueryExecutions:1,legacyCounterfactualRowsRead:result.meta.rows_read,
  currentOmittedQueryExecutions:0, // Source contract (#824): excluded from batch; not live traffic telemetry.
  legacyReturnedRows:0,productionTrafficRowsSaved:'unmeasured',
  note:'One read-only counterfactual query on an explicit member; not an observed request-rate or before/after production savings measurement'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 collectEvidence().then(x=>console.log('DUEL_P12_824_SQL_EVIDENCE',JSON.stringify(x)))
 .catch(e=>{console.error('DUEL_P12_824_SQL_EVIDENCE_ERROR',e.message);process.exitCode=1;});
}
