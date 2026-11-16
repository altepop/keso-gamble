import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Uses the same Cloudflare D1 read endpoint as ensure-round-events.mjs.
// The only output is a fixed allowlist of aggregated counts/statuses.
// Does not print SQL, IDs, credentials, rosters, names or kill events.
export async function auditCoachArchive(directory,env=process.env,request=fetch,now=Date.now()){
 const config=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8'));
 const binding=config.d1_databases?.find(b=>b.binding==='DB');
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!token||!/^[0-9a-f]{32}$/i.test(account??'')||
    !/^[0-9a-f-]{36}$/i.test(binding?.database_id??'')||
    config.name!=='valorant-results')throw Error('Missing verified live D1 configuration');
 const sql=`WITH targets AS (
   SELECT r.match_id,r.ended_at,e.match_id AS archived,
    e.rounds_json,e.kills_json,
    EXISTS(SELECT 1 FROM json_each(r.players_json) p
     JOIN tracked_players t ON lower(t.riot_id)='dolly#sdgs'
     WHERE json_extract(p.value,'$.name')='Dolly'
       AND json_extract(p.value,'$.tag')='SDGs'
       AND json_extract(p.value,'$.puuid')=t.puuid) AS current_puuid_match,
    (SELECT value FROM monitor_state s
     WHERE s.key='coach_round_backfill:unavailable:'||r.match_id) AS unavailable_reason,
    EXISTS(SELECT 1 FROM monitor_state s
     WHERE s.key='coach_round_backfill:retry_once:'||r.match_id) AS retry_attempted,
    EXISTS(SELECT 1 FROM monitor_state s
     WHERE s.key='coach_round_backfill:legacy_v2_once:'||r.match_id) AS legacy_v2_attempted
   FROM valorant_match_rosters r
   LEFT JOIN valorant_match_round_events e ON e.match_id=r.match_id
   WHERE EXISTS(SELECT 1 FROM json_each(r.players_json) p
    WHERE json_extract(p.value,'$.name')='Dolly'
      AND json_extract(p.value,'$.tag')='SDGs')
 )
 SELECT COUNT(*) AS roster_count,
   COALESCE(SUM(CASE WHEN rounds_json IS NOT NULL AND kills_json IS NOT NULL THEN 1 ELSE 0 END),0) AS complete_count,
   COALESCE(SUM(CASE WHEN archived IS NULL THEN 1 ELSE 0 END),0) AS missing_count,
   COALESCE(SUM(CASE WHEN archived IS NOT NULL AND (rounds_json IS NULL OR kills_json IS NULL) THEN 1 ELSE 0 END),0) AS partial_count,
   COALESCE(SUM(CASE WHEN unavailable_reason IS NOT NULL THEN 1 ELSE 0 END),0) AS unavailable_count,
   COALESCE(SUM(CASE WHEN archived IS NOT NULL AND rounds_json IS NOT NULL
      AND kills_json IS NULL THEN 1 ELSE 0 END),0) AS missing_kills_only,
   COALESCE(SUM(CASE WHEN archived IS NOT NULL AND rounds_json IS NULL
      AND kills_json IS NOT NULL THEN 1 ELSE 0 END),0) AS missing_rounds_only,
   COALESCE(SUM(CASE WHEN unavailable_reason='missing_kills' THEN 1 ELSE 0 END),0) AS reason_missing_kills,
   COALESCE(SUM(CASE WHEN unavailable_reason='missing_rounds' THEN 1 ELSE 0 END),0) AS reason_missing_rounds,
   COALESCE(SUM(CASE WHEN unavailable_reason='no_round_data' THEN 1 ELSE 0 END),0) AS reason_no_round_data,
   COALESCE(SUM(CASE WHEN unavailable_reason='404' THEN 1 ELSE 0 END),0) AS reason_not_found,
   COALESCE(SUM(CASE WHEN retry_attempted=1 THEN 1 ELSE 0 END),0) AS retry_attempts,
   COALESCE(SUM(CASE WHEN retry_attempted=1 AND rounds_json IS NOT NULL
      AND kills_json IS NULL THEN 1 ELSE 0 END),0) AS retry_still_missing_kills,
   COALESCE(SUM(CASE WHEN legacy_v2_attempted=1 THEN 1 ELSE 0 END),0) AS legacy_v2_attempts,
   COALESCE(SUM(CASE WHEN legacy_v2_attempted=1 AND rounds_json IS NOT NULL
      AND kills_json IS NULL THEN 1 ELSE 0 END),0) AS legacy_v2_still_missing_kills,
   COALESCE(SUM(CASE WHEN current_puuid_match=0 THEN 1 ELSE 0 END),0) AS historical_puuid_mismatch,
   COALESCE(SUM(CASE WHEN (rounds_json IS NULL OR kills_json IS NULL)
     AND unavailable_reason IS NULL AND ended_at<${Math.floor(now-120000)}
     THEN 1 ELSE 0 END),0) AS eligible_backlog,
   (SELECT value FROM monitor_state WHERE key='coach_round_backfill:enabled') AS switch_value,
   (SELECT value FROM monitor_state WHERE key='api_after') AS api_cooldown_until,
   (SELECT COUNT(*) FROM tracked_players WHERE lower(riot_id)='dolly#sdgs' AND length(region)>0) AS tracked_profile_exists
 FROM targets`;
 const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+binding.database_id+'/query';
 const res=await request(url,{method:'POST',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({sql}),signal:AbortSignal.timeout(30000)});
 if(!res.ok)throw Error('D1 archive audit HTTP '+res.status);
 const payload=await res.json();
 if(!payload.success||!payload.result?.[0]?.success)throw Error('D1 read-only archive audit failed');
 const row=payload.result[0].results?.[0];
 if(!row)throw Error('D1 archive audit returned no count row');
 const number=(v)=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;
 const result={
  rosterCount:number(row.roster_count),
  complete:number(row.complete_count),
  missing:number(row.missing_count),
  partial:number(row.partial_count),
  unavailable:number(row.unavailable_count),
  missingKillsOnly:number(row.missing_kills_only),
  missingRoundsOnly:number(row.missing_rounds_only),
  oneTimeRetries:number(row.retry_attempts),
  retryStillMissingKills:number(row.retry_still_missing_kills),
  legacyV2Attempts:number(row.legacy_v2_attempts),
  legacyV2StillMissingKills:number(row.legacy_v2_still_missing_kills),
  unavailableReasons:{
    missingKills:number(row.reason_missing_kills),
    missingRounds:number(row.reason_missing_rounds),
    noRoundData:number(row.reason_no_round_data),
    notFound:number(row.reason_not_found)
  },
  historicalPuuidMismatch:number(row.historical_puuid_mismatch),
  eligibleBacklog:number(row.eligible_backlog),
  trackedProfileExists:Number(row.tracked_profile_exists)===1,
  switchStatus:['Dolly#SDGs','complete','repaired','rechecked'].includes(row.switch_value)
    ?({ 'Dolly#SDGs':'running',complete:'complete',repaired:'repaired',rechecked:'rechecked'})[row.switch_value]
    :'disabled',
  cooldownActive:Number(row.api_cooldown_until??0)>now
 };
 if([result.rosterCount,result.complete,result.missing,result.partial,
      result.unavailable,result.missingKillsOnly,result.missingRoundsOnly,
      result.oneTimeRetries,result.retryStillMissingKills,
      result.legacyV2Attempts,result.legacyV2StillMissingKills,
      ...Object.values(result.unavailableReasons),result.historicalPuuidMismatch,
      result.eligibleBacklog].some(v=>v===null) ||
   result.rosterCount!==result.complete+result.missing+result.partial ||
   result.missingKillsOnly+result.missingRoundsOnly>result.partial ||
   result.oneTimeRetries>result.rosterCount ||
   result.retryStillMissingKills>result.missingKillsOnly ||
   result.retryStillMissingKills>result.oneTimeRetries ||
   result.legacyV2Attempts>result.oneTimeRetries ||
   result.legacyV2StillMissingKills>result.missingKillsOnly ||
   result.legacyV2StillMissingKills>result.legacyV2Attempts ||
   Object.values(result.unavailableReasons).reduce((a,b)=>a+b,0)>result.unavailable)
   throw Error('Inconsistent archive counts, will not report invalid totals');
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const x=await auditCoachArchive(process.cwd());
  console.log('KESO_COACH_D1_AGGREGATES '+JSON.stringify(x));
 }catch(error){
  // This is diagnostics, not an excuse to interrupt production deployment.
  // Do not print Cloudflare response bodies, secrets, SQL, or private IDs.
  console.log('KESO_COACH_D1_AUDIT_UNAVAILABLE '+(error instanceof Error?error.message:'unknown audit error'));
 }
}
