import type {Match} from './results.ts';
import {ALL_MEMBER_SWITCH,COACH_MEMBER_ACCOUNTS,fetchNextCoachMemberMatch} from './coach-member-archive.ts';
import {compactCompetitivePositions,recordCompetitivePositions} from './coach-position-storage.ts';
export type PositionBackfillStep='disabled'|'idle'|'cooldown'|'claimed_elsewhere'|'saved'|'unavailable'|'deferred';
const DELAY=15*60_000;
// Runs ONLY in an unused existing five-minute archive slot. Never increases
// the collector's one-detail-per-slot budget or replays rewards/notifications.
export async function backfillCoachPositions(db:D1Database,fetchDetail:(region:string,id:string)=>Promise<Match>,now=Date.now()):Promise<PositionBackfillStep>{
 const switches=await db.prepare('SELECT key,value FROM monitor_state WHERE key IN (?,?)').bind(ALL_MEMBER_SWITCH,'api_after').all<{key:string;value:string}>();
 if(!switches.results.some(s=>s.key===ALL_MEMBER_SWITCH&&s.value==='enabled'))return 'disabled';
 if(Number(switches.results.find(s=>s.key==='api_after')?.value)>now)return 'cooldown';
 // A match can belong to multiple verified cohort members. Reuse a linked,
 // resolved source instead of blocking all participants on the first (VDK)
 // attribution. Never use unrelated accounts, stale identities or extra calls.
 const permitted=COACH_MEMBER_ACCOUNTS.map(()=>'?').join(',');
 // SQLite otherwise may resolve linked sources for every completed match,
 // including those whose positions are already captured or retries exhausted.
 // CROSS JOIN keeps the eligibility guards ahead of the indexed cohort lookups.
 const row=await db.prepare(`SELECT q.match_id,s.region,s.puuid AS source_puuid,s.riot_id AS chosen_riot_id,
  q.source_riot_id AS original_riot_id,q.started_at FROM coach_member_queue q
  LEFT JOIN valorant_match_positions p ON p.match_id=q.match_id
  LEFT JOIN coach_position_backfill b ON b.match_id=q.match_id
  CROSS JOIN coach_member_links l ON l.match_id=q.match_id AND l.riot_id IN (${permitted})
  CROSS JOIN coach_member_sources s ON s.riot_id=l.riot_id
  WHERE (q.status='complete' OR (q.status='partial' AND q.attempts>=3)) AND COALESCE(p.has_coordinates,0)=0
   AND (b.match_id IS NULL OR (b.status IN ('retry','running') AND b.attempts<3 AND b.next_at<=?))
   AND length(s.puuid) BETWEEN 1 AND 128
   AND s.region IN ('ap','na','eu','kr','br','latam')
   AND (s.riot_id<>q.source_riot_id OR (s.puuid=q.source_puuid AND s.region=q.region))
  -- Newest eligible match first; match_id only resolves previously unspecified timestamp ties.
  -- Within that match preserve original-first / verified-peer-on-retry priority.
  ORDER BY q.started_at DESC,q.match_id ASC,
   CASE WHEN COALESCE(b.attempts,0)>0
    THEN CASE WHEN s.riot_id=q.source_riot_id AND s.puuid=q.source_puuid AND s.region=q.region THEN 1 ELSE 0 END
    ELSE CASE WHEN s.riot_id=q.source_riot_id AND s.puuid=q.source_puuid AND s.region=q.region THEN 0 ELSE 1 END
   END,s.riot_id ASC LIMIT 1`).bind(...COACH_MEMBER_ACCOUNTS.map(p=>p.riotId),now)
  .first<{match_id:string;region:string;source_puuid:string;chosen_riot_id:string;original_riot_id:string;started_at:number}>();
 if(!row)return 'idle';
 const claim=await db.prepare(`INSERT INTO coach_position_backfill(match_id,status,attempts,next_at,reason,updated_at)
  VALUES(?,'running',1,?,'in-progress',?) ON CONFLICT(match_id) DO UPDATE SET
  status='running',attempts=coach_position_backfill.attempts+1,next_at=excluded.next_at,reason='in-progress',updated_at=excluded.updated_at
  WHERE coach_position_backfill.status IN ('retry','running') AND coach_position_backfill.attempts<3 AND coach_position_backfill.next_at<=?`)
  .bind(row.match_id,now+DELAY,now,now).run();
 if(!claim.meta.changes)return 'claimed_elsewhere';
 const finish=async(status:string,reason:string)=>{await db.prepare('UPDATE coach_position_backfill SET status=?,reason=?,updated_at=? WHERE match_id=? AND updated_at=? AND status=\'running\'').bind(status,reason,now,row.match_id,now).run();};
 try{
  const detail=await fetchDetail(row.region,row.match_id);
  const started=Date.parse(detail?.metadata?.started_at);
  if(detail?.metadata?.match_id!==row.match_id||!Number.isFinite(started)||Math.abs(started-row.started_at)>120000||!detail?.players?.some(p=>p.puuid===row.source_puuid))throw Error('position response mismatch');
  const compact=compactCompetitivePositions(detail,'detail',now);
  if(!compact||!compact.hasCoordinates){await finish('unavailable','no-usable-position-response');return 'unavailable';}
  await recordCompetitivePositions(db,detail,'detail',now);
  const saved=await db.prepare('SELECT has_coordinates FROM valorant_match_positions WHERE match_id=?').bind(row.match_id).first<{has_coordinates:number}>();
  if(saved?.has_coordinates!==1)throw Error('position save pending');
  await finish('saved','captured');return 'saved';
 }catch(error){
  if(error instanceof Error&&/\b(?:HTTP|API) 404\b/.test(error.message)){
   // A 404 can be regional. Give a different verified linked cohort account
   // the next existing slot, but never retry the same missing source indefinitely.
   if(row.chosen_riot_id===row.original_riot_id){
    const peer=await db.prepare(`SELECT 1 AS eligible FROM coach_member_links l
     JOIN coach_member_sources s ON s.riot_id=l.riot_id
     WHERE l.match_id=? AND s.riot_id IN (${permitted}) AND s.riot_id<>?
      AND length(s.puuid) BETWEEN 1 AND 128
      AND s.region IN ('ap','na','eu','kr','br','latam')
     LIMIT 1`).bind(row.match_id,...COACH_MEMBER_ACCOUNTS.map(p=>p.riotId),row.chosen_riot_id)
     .first<{eligible:number}>();
    if(peer){
     await db.prepare(`UPDATE coach_position_backfill
      SET status=CASE WHEN attempts>=3 THEN 'unavailable' ELSE 'retry' END,
       reason=CASE WHEN attempts>=3 THEN 'retry-exhausted' ELSE 'source-404-peer-fallback' END,
       updated_at=?
      WHERE match_id=? AND updated_at=? AND status='running'`)
      .bind(now,row.match_id,now).run();
     return 'deferred';
    }
   }
   await finish('unavailable','not-found');return 'unavailable';
  }
  await db.prepare(`UPDATE coach_position_backfill SET status=CASE WHEN attempts>=3 THEN 'unavailable' ELSE 'retry' END,
   reason=CASE WHEN attempts>=3 THEN 'retry-exhausted' ELSE 'transient-or-invalid-response' END,updated_at=?
   WHERE match_id=? AND updated_at=? AND status='running'`).bind(now,row.match_id,now).run();
  return 'deferred';
 }
}

export async function runCoachPositionArchiveSlot(db:D1Database,fetchDetail:(region:string,id:string)=>Promise<Match>,now=Date.now(),archive=fetchNextCoachMemberMatch){
 let requested=false;
 const result=await archive(db,(region,id)=>{requested=true;return fetchDetail(region,id);},now);
 // A previously unavailable match can be rejected from persisted evidence
 // without issuing a detail request. Reuse that unused slot for a different
 // member's verified position backlog; never retry after a real API call.
 const positions=!requested&&(result==='idle'||result==='already_saved'||result==='unavailable')
  ?await backfillCoachPositions(db,fetchDetail,now):null;
 return {archive:result,positions};
}
