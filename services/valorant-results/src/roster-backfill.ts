import type { Match } from './results.ts';
import {compactCompetitiveRoster,recordCompetitiveRoster} from './match-rosters.ts';

export const ROSTER_BACKFILL_SWITCH='roster_backfill:enabled';
const TARGET_RIOT='Dolly#SDGs';
const prefix='roster_backfill:';

// Restoration is deliberately opt-in and confined to VDK's recorded competitive
// matches. It must never call saveMatch, grant KP or emit a Discord notification.
export type BackfillStatus='disabled'|'cooldown'|'deferred'|'complete'|'saved'|'unavailable';
export interface BackfillOutcome {status:BackfillStatus;matchId?:string}
const candidateSql=`SELECT n.match_id,t.region,n.ended_at FROM notifications n
 JOIN tracked_players t ON t.riot_id=n.riot_id
 WHERE n.riot_id=? AND n.mode='competitive'
  AND n.ended_at<?
  AND NOT EXISTS(SELECT 1 FROM valorant_match_rosters v WHERE v.match_id=n.match_id)
  AND NOT EXISTS(SELECT 1 FROM monitor_state s WHERE s.key='roster_backfill:unavailable:'||n.match_id)
  AND NOT EXISTS(SELECT 1 FROM monitor_state s WHERE s.key='roster_backfill:defer:'||n.match_id AND CAST(s.value AS INTEGER)>?)
 ORDER BY n.ended_at DESC LIMIT 1`;
const outstandingSql=`SELECT COUNT(*) AS n FROM notifications n
 WHERE n.riot_id=? AND n.mode='competitive'
  AND NOT EXISTS(SELECT 1 FROM valorant_match_rosters v WHERE v.match_id=n.match_id)
  AND NOT EXISTS(SELECT 1 FROM monitor_state s WHERE s.key='roster_backfill:unavailable:'||n.match_id)`;
async function put(db:D1Database,key:string,value:string){
 await db.prepare('INSERT INTO monitor_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value).run();
}

export async function backfillRecordedVdkMatches(db:D1Database,
 fetchDetail:(region:string,matchId:string)=>Promise<Match>,
 now=Date.now()):Promise<BackfillOutcome>{
 const enabled=await db.prepare('SELECT value FROM monitor_state WHERE key=?').bind(ROSTER_BACKFILL_SWITCH).first<{value:string}>();
 if(enabled?.value!==TARGET_RIOT)return {status:'disabled'};
 const apiAfter=await db.prepare("SELECT value FROM monitor_state WHERE key='api_after'").first<{value:string}>();
 if(Number(apiAfter?.value??0)>now)return {status:'cooldown'};
 const c=await db.prepare(candidateSql)
  .bind(TARGET_RIOT,now-120_000,now)
  .first<{match_id:string;region:string;ended_at:number}>();
 if(!c){
  const outstanding=await db.prepare(outstandingSql).bind(TARGET_RIOT).first<{n:number}>();
  if((outstanding?.n??0)===0){
   await put(db,ROSTER_BACKFILL_SWITCH,'complete');
   return {status:'complete'};
  }
  return {status:'deferred'};
 }
 // No more than one detail call per invocation. Strict match identity and time
 // checks prevent mismatched API responses from corrupting the archive.
 const matchId=c.match_id;
 try{
  const detail=await fetchDetail(c.region,matchId);
  const compact=compactCompetitiveRoster(detail,now);
  if(!compact||compact.id!==matchId||Math.abs(compact.endedAt-c.ended_at)>120_000){
   await put(db,prefix+'defer:'+matchId,String(now+60*60_000));
   return {status:'deferred',matchId};
  }
  const saved=await recordCompetitiveRoster(db,detail,now);
  if(!saved){
   // Another monitor invocation may have archived it during our request.
   const exists=await db.prepare('SELECT 1 FROM valorant_match_rosters WHERE match_id=?').bind(matchId).first();
   if(!exists)throw Error('Roster write returned no record');
  }
  await put(db,prefix+'last_saved',matchId);
  return {status:'saved',matchId};
 }catch(error){
  // A 404 on old match details is unavailable, not proof the user did not play.
  const message=error instanceof Error?error.message:'';
  const unavailable=/\b(?:HTTP|API) 404\b/.test(message);
  await put(db,prefix+(unavailable?'unavailable:':'defer:')+matchId,unavailable?String(now):String(now+30*60_000));
  return {status:unavailable?'unavailable':'deferred',matchId};
 }
}
