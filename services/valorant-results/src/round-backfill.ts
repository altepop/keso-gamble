import type {Match} from './results.ts';
import {compactCompetitiveRoundEvents,recordCompetitiveRoundEvents} from './round-events.ts';

export const ROUND_BACKFILL_SWITCH='coach_round_backfill:enabled';
const TARGET='Dolly#SDGs';
const PREFIX='coach_round_backfill:';
export type RoundBackfillStatus='disabled'|'cooldown'|'deferred'|'complete'|'saved'|'unavailable';
export interface RoundBackfillOutcome{status:RoundBackfillStatus;matchId?:string}
// Do not require the historical roster PUUID to equal the current tracked
// profile PUUID. Riot aliases and account re-linking may change independently.
// The request is still confined to known Dolly#SDGs competitive rosters and
// is verified against the immutable match ID and finish time before archival.
const candidate=`SELECT r.match_id,t.region,r.ended_at FROM valorant_match_rosters r
 JOIN json_each(r.players_json) p
 JOIN tracked_players t ON t.riot_id=?
 WHERE json_extract(p.value,'$.name')='Dolly'
 AND json_extract(p.value,'$.tag')='SDGs'

 AND r.ended_at<?
 AND NOT EXISTS(SELECT 1 FROM valorant_match_round_events e WHERE e.match_id=r.match_id
 AND e.rounds_json IS NOT NULL AND e.kills_json IS NOT NULL)
 AND (?=0 OR EXISTS(SELECT 1 FROM valorant_match_round_events p
   WHERE p.match_id=r.match_id AND (p.rounds_json IS NULL OR p.kills_json IS NULL)))
 AND NOT EXISTS(SELECT 1 FROM monitor_state s WHERE s.key='coach_round_backfill:unavailable:'||r.match_id)
 AND NOT EXISTS(SELECT 1 FROM monitor_state s WHERE s.key='coach_round_backfill:defer:'||r.match_id AND CAST(s.value AS INTEGER)>?)
 ORDER BY r.ended_at DESC LIMIT 1`;
// An older already-authorized task can safely re-check one upstream
// missing-kills response once. Never include unarchived games, 404s, or
// a match with any other unavailable reason.
const retryPreviouslyIncomplete=`SELECT r.match_id,t.region,r.ended_at
 FROM valorant_match_rosters r
 JOIN json_each(r.players_json) p
 JOIN tracked_players t ON t.riot_id=?
 JOIN valorant_match_round_events e ON e.match_id=r.match_id
 WHERE json_extract(p.value,'$.name')='Dolly'
  AND json_extract(p.value,'$.tag')='SDGs'
  AND e.rounds_json IS NOT NULL AND e.kills_json IS NULL
  AND r.ended_at<?
  AND EXISTS(SELECT 1 FROM monitor_state s WHERE
   s.key='coach_round_backfill:unavailable:'||r.match_id AND s.value='missing_kills')
  AND NOT EXISTS(SELECT 1 FROM monitor_state s WHERE
   s.key='coach_round_backfill:retry_once:'||r.match_id)
 ORDER BY r.ended_at DESC LIMIT 1`;
const remaining=`SELECT COUNT(*) AS n FROM valorant_match_rosters r
 JOIN json_each(r.players_json) p
 JOIN tracked_players t ON t.riot_id=?
 WHERE json_extract(p.value,'$.name')='Dolly'
 AND json_extract(p.value,'$.tag')='SDGs'

 AND NOT EXISTS(SELECT 1 FROM valorant_match_round_events e WHERE e.match_id=r.match_id
 AND e.rounds_json IS NOT NULL AND e.kills_json IS NOT NULL)
 AND (?=0 OR EXISTS(SELECT 1 FROM valorant_match_round_events p
   WHERE p.match_id=r.match_id AND (p.rounds_json IS NULL OR p.kills_json IS NULL)))
 AND NOT EXISTS(SELECT 1 FROM monitor_state s WHERE s.key='coach_round_backfill:unavailable:'||r.match_id)`;
async function state(db:D1Database,key:string,value:string){
 await db.prepare('INSERT INTO monitor_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value).run();
}
export async function backfillVdkRoundEvents(db:D1Database,fetchDetail:(region:string,id:string)=>Promise<Match>,now=Date.now()):Promise<RoundBackfillOutcome>{
 const enabled=await db.prepare('SELECT value FROM monitor_state WHERE key=?').bind(ROUND_BACKFILL_SWITCH).first<{value:string}>();
 if(enabled?.value!==TARGET&&enabled?.value!=='complete'&&enabled?.value!=='repaired')
  return {status:'disabled'};
 // Already authorized historical archive: use one final attempt only for a
 // partial missing-kills payload, never for 404 or a new match.
 const retryOnly=enabled.value==='repaired';
 const repairOnly=enabled.value==='complete';
 const cooldown=await db.prepare("SELECT value FROM monitor_state WHERE key='api_after'").first<{value:string}>();
 if(Number(cooldown?.value??0)>now)return {status:'cooldown'};
 const row=retryOnly?
  await db.prepare(retryPreviouslyIncomplete).bind(TARGET,now-120_000)
   .first<{match_id:string;region:string;ended_at:number}>():
  await db.prepare(candidate).bind(TARGET,now-120_000,repairOnly?1:0,now)
   .first<{match_id:string;region:string;ended_at:number}>();
 if(!row){
  if(retryOnly){
   await state(db,ROUND_BACKFILL_SWITCH,'rechecked');
   return {status:'complete'};
  }
  const left=await db.prepare(remaining).bind(TARGET,repairOnly?1:0).first<{n:number}>();
  if((left?.n??0)===0){
   await state(db,ROUND_BACKFILL_SWITCH,repairOnly?'repaired':'complete');
   return {status:'complete'};
  }
  return {status:'deferred'};
 }
 if(retryOnly){
  // Claim atomically: overlapping Cron invocations must never both call Henrik.
  // INSERT OR IGNORE preserves the original attempt marker on every later tick.
  const claim=await db.prepare('INSERT OR IGNORE INTO monitor_state(key,value) VALUES(?,?)')
   .bind(PREFIX+'retry_once:'+row.match_id,String(now)).run();
  if(Number(claim.meta.changes??0)!==1)return {status:'deferred'};
 }
 try{
  const detail=await fetchDetail(row.region,row.match_id);
  const compact=compactCompetitiveRoundEvents(detail,now);
  const started=Date.parse(detail.metadata?.started_at??'');
  const ended=started+(detail.metadata?.game_length_in_ms??NaN);
  if(detail.metadata?.match_id!==row.match_id||!Number.isFinite(ended)||Math.abs(ended-row.ended_at)>120_000){
   await state(db,PREFIX+'defer:'+row.match_id,String(now+60*60_000));
   return {status:'deferred',matchId:row.match_id};
  }
  if(!compact){
   await state(db,PREFIX+'unavailable:'+row.match_id,'no_round_data');
   return {status:'unavailable',matchId:row.match_id};
  }
  const saved=await recordCompetitiveRoundEvents(db,detail,now);
  const archive=await db.prepare(
   'SELECT rounds_json,kills_json FROM valorant_match_round_events WHERE match_id=?'
  ).bind(row.match_id).first<{rounds_json:string|null;kills_json:string|null}>();
  if(!archive)throw Error('Round archive write failed');
  if(!archive.rounds_json||!archive.kills_json){
   // Henrik returned no additional compatible event details. Keep the partial
   // archive and avoid burning Henrik quota forever; operators may explicitly
   // clear this marker if the upstream source is later repaired.
   const missing=!archive.rounds_json?'missing_rounds':'missing_kills';
   await state(db,PREFIX+'unavailable:'+row.match_id,missing);
   return {status:saved?'saved':'unavailable',matchId:row.match_id};
  }
  // A late successful upstream response supersedes the previous
  // missing-kills failure. Never keep a stale "unavailable" flag.
  if(retryOnly)
   await db.prepare('DELETE FROM monitor_state WHERE key=?')
    .bind(PREFIX+'unavailable:'+row.match_id).run();
  return {status:'saved',matchId:row.match_id};
 }catch(error){
  const message=error instanceof Error?error.message:'';
  const missing=/\b(?:HTTP|API) 404\b/.test(message);
  await state(db,PREFIX+(missing?'unavailable:':'defer:')+row.match_id,missing?'404':String(now+30*60_000));
  return {status:missing?'unavailable':'deferred',matchId:row.match_id};
 }
}

export async function resumeVdkRoundBackfill(db:D1Database):Promise<'resumed'|'already_running'|'not_opted_in'>{
 // Only reopen a previously authorized task. The authenticated route must
 // separately verify the caller owns the Dolly#SDGs linked KP account.
 const changed=await db.prepare(`UPDATE monitor_state
  SET value='Dolly#SDGs'
  WHERE key=? AND value IN ('complete','repaired','rechecked')`)
  .bind(ROUND_BACKFILL_SWITCH).run();
 if(Number(changed.meta.changes??0)>0)return 'resumed';
 const row=await db.prepare('SELECT value FROM monitor_state WHERE key=?')
  .bind(ROUND_BACKFILL_SWITCH).first<{value:string}>();
 return row?.value===TARGET?'already_running':'not_opted_in';
}
