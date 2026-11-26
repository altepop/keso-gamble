import {captureCompetitivePositions} from './coach-position-storage.ts';
import type {Match} from './results.ts';
import {recordCompetitiveRoster} from './match-rosters.ts';
import {recordCompetitiveRoundEvents} from './round-events.ts';

// Exactly the user-confirmed cohort; no unregistered opponents are monitored.
// 神戸 is the person who owns Aquatopia#toppy (NOT an extra Riot account).
export const COACH_MEMBER_ACCOUNTS=[
 {person:'VDK',riotId:'Dolly#SDGs'},
 {person:'Abema',riotId:'Abema#ttv'},
 {person:'石原',riotId:'h1d3g1g4s#1037'},
 {person:'藤村',riotId:'frin#怖すぎ'},
 {person:'神戸',riotId:'Aquatopia#toppy'},
 {person:'小林',riotId:'mecael#2489'}
] as const;
export const ALL_MEMBER_SWITCH='coach_all_members:enabled';
const ROSTER_SCHEMA_SQL="json_extract(CASE WHEN json_valid(r.players_json) THEN r.players_json ELSE '[]' END,'$[0].coachSchema')=2";
const ASSIST_SCHEMA_SQL="json_extract(CASE WHEN json_valid(e.kills_json) THEN e.kills_json ELSE '[]' END,'$[0].assistSchema')=1";
const CONTEXT_SCHEMA_SQL="json_extract(CASE WHEN json_valid(e.rounds_json) THEN e.rounds_json ELSE '[]' END,'$[0].contextSchema')=1";
async function upgradeCaptureQueue(db:D1Database){
 const key='coach_capture_v3:ready';
 if(await db.prepare('SELECT value FROM monitor_state WHERE key=?').bind(key).first())return;
 // Only executes after the existing owner opt-in check. No records are removed,
 // and previously unavailable sources keep their backoff/unavailable state.
 await db.prepare(`UPDATE coach_member_queue SET status='pending',attempts=0,next_at=0
  WHERE status='complete' AND source_riot_id IN (${COACH_MEMBER_ACCOUNTS.map(()=>'?').join(',')})
   AND NOT EXISTS(SELECT 1 FROM valorant_match_rosters r
   JOIN valorant_match_round_events e ON e.match_id=r.match_id
   WHERE r.match_id=coach_member_queue.match_id AND ${ROSTER_SCHEMA_SQL} AND ${ASSIST_SCHEMA_SQL} AND ${CONTEXT_SCHEMA_SQL}
    AND e.rounds_json IS NOT NULL AND e.kills_json IS NOT NULL)`)
  .bind(...COACH_MEMBER_ACCOUNTS.map(p=>p.riotId)).run();
 await db.prepare('INSERT OR IGNORE INTO monitor_state(key,value) VALUES(?,?)').bind(key,'1').run();
}

type Account={puuid:string;region:string};
type Source={riot_id:string;puuid:string|null;region:string|null;
 next_page:number;done:number;truncated:number;next_at:number};
type Candidate={match_id:string;region:string;riot_id:string;original_riot_id:string;puuid:string;started_at:number;attempts:number};
type LifetimeMatch={meta?:{id?:unknown;mode?:unknown;started_at?:unknown};metadata?:{match_id?:unknown;queue?:{id?:unknown};started_at?:unknown}};
export type ArchiveStep='disabled'|'resolved'|'discovered'|'discovery_done'|'refreshed'|'saved'|'already_saved'|'partial'|'unavailable'|'deferred'|'idle';
const isId=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<=128;
const isRegion=(x:unknown):x is string=>typeof x==='string'&&['ap','na','eu','kr','br','latam'].includes(x);
const safeTime=(s:unknown)=>typeof s==='string'?Date.parse(s):NaN;
const delay=15*60_000;
export const COACH_REFRESH_INTERVAL=60*60_000;
async function repairLifetimeCaseDiscovery(db:D1Database){
 const key='coach_lifetime_case_v1:ready';
 if(await db.prepare('SELECT value FROM monitor_state WHERE key=?').bind(key).first())return;
 // The v1 index uses display labels such as "Competitive". Earlier discovery
 // rejected these while still advancing the page. Revisit those pages once,
 // retaining resolved accounts, saved matches, links and the existing API budget.
 // This function is called only after the existing explicit owner opt-in.
 await db.prepare(`UPDATE coach_member_sources SET next_page=1,done=0,truncated=0,next_at=0
  WHERE next_page>1 AND riot_id IN (${COACH_MEMBER_ACCOUNTS.map(()=>'?').join(',')})`)
  .bind(...COACH_MEMBER_ACCOUNTS.map(p=>p.riotId)).run();
 await db.prepare('INSERT OR IGNORE INTO monitor_state(key,value) VALUES(?,?)').bind(key,'1').run();
}
const getSwitch=async(db:D1Database)=>(await db.prepare('SELECT value FROM monitor_state WHERE key=?')
 .bind(ALL_MEMBER_SWITCH).first<{value:string}>())?.value==='enabled';

// Only an authenticated, owner-authorized explicit action can start a new
// historical collection. There are no unbounded automatic API calls on deploy.
export async function enableAllMemberArchive(db:D1Database){
 await db.prepare('INSERT INTO monitor_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  .bind(ALL_MEMBER_SWITCH,'enabled').run();
 for(const entry of COACH_MEMBER_ACCOUNTS){
  await db.prepare('INSERT OR IGNORE INTO coach_member_sources(riot_id,next_page,done,truncated,next_at) VALUES(?,1,0,0,0)')
   .bind(entry.riotId).run();
 }
 return {enabled:true,persons:COACH_MEMBER_ACCOUNTS.map(x=>x.person)};
}
export async function pauseAllMemberArchive(db:D1Database){
 await db.prepare("INSERT INTO monitor_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE monitor_state.value<>excluded.value")
  .bind(ALL_MEMBER_SWITCH,'disabled').run();
 return {enabled:false};
}

async function postponeSource(db:D1Database,riotId:string,now:number){
 await db.prepare('UPDATE coach_member_sources SET next_at=? WHERE riot_id=?')
  .bind(now+delay,riotId).run();
}
async function postponeCandidate(db:D1Database,id:string,now:number,status:'pending'|'unavailable'|'partial'){
 await db.prepare(`UPDATE coach_member_queue SET
  status=CASE WHEN ?='pending' AND attempts>=2 THEN 'unavailable' ELSE ? END,
  attempts=attempts+1,next_at=? WHERE match_id=?`)
  .bind(status,status,now+delay,id).run();
}

/** Use bound composite-key seeks, avoiding the temporary JSON input scan.
 * Chunk only to bound SQL parameters; do not truncate an upstream page. */
export async function knownCoachMemberMatchIds(db:D1Database,riotId:string,matchIds:readonly string[]){
 const unique=[...new Set(matchIds)],known=new Set<string>();
 for(let i=0;i<unique.length;i+=50){
  const chunk=unique.slice(i,i+50);
  const rows=(await db.prepare(`SELECT match_id FROM coach_member_links WHERE riot_id=? AND match_id IN (${chunk.map(()=>'?').join(',')})`)
   .bind(riotId,...chunk).all<{match_id:string}>()).results;
  for(const row of rows)known.add(row.match_id);
 }
 return known;
}

export async function discoverCoachMemberPage(db:D1Database,
 account:(riotId:string)=>Promise<Account>,
 lifetime:(region:string,puuid:string,page:number,size:number)=>Promise<unknown>,
 now=Date.now()):Promise<ArchiveStep>{
 if(!await getSwitch(db))return 'disabled';
 await repairLifetimeCaseDiscovery(db);
 const source=await db.prepare(`SELECT riot_id,puuid,region,next_page,done,truncated,next_at
  FROM coach_member_sources WHERE next_at<=?
   AND riot_id IN (${COACH_MEMBER_ACCOUNTS.map(()=>'?').join(',')})
  ORDER BY CASE WHEN puuid IS NULL THEN 0 ELSE 1 END, next_at ASC,next_page ASC,riot_id ASC LIMIT 1`)
  .bind(now,...COACH_MEMBER_ACCOUNTS.map(p=>p.riotId)).first<Source>();
 if(!source)return 'idle';
 if(!isId(source.puuid)||!isRegion(source.region)){
  try{
   const a=await account(source.riot_id);
   if(!isId(a?.puuid)||!isRegion(a?.region))throw Error('invalid account');
   await db.prepare('UPDATE coach_member_sources SET puuid=?,region=?,next_at=0 WHERE riot_id=?')
    .bind(a.puuid,a.region,source.riot_id).run();
   return 'resolved';
  }catch{
   await postponeSource(db,source.riot_id,now);
   return 'deferred';
  }
 }
 const size=50,maxPages=40,refresh=source.done===1; // bounded history plus hourly newest-page checks
 if(!refresh&&source.next_page>maxPages){
  await db.prepare('UPDATE coach_member_sources SET done=1,truncated=1,next_at=? WHERE riot_id=?')
   .bind(now+COACH_REFRESH_INTERVAL,source.riot_id).run();
  return 'discovery_done';
 }
 try{
  const data=await lifetime(source.region,source.puuid,refresh?1:source.next_page,size);
  if(!Array.isArray(data))throw Error('invalid history');
  const seen=new Set<string>();
  const discovered:Array<{id:string;started:number}>=[];
  for(const raw of data as LifetimeMatch[]){
   const meta=raw?.meta??raw?.metadata;
   const id=raw?.meta?.id??raw?.metadata?.match_id;
   const queue=raw?.meta?.mode??raw?.metadata?.queue?.id;
   const started=safeTime(meta?.started_at);
   if(typeof queue!=='string'||queue.toLowerCase()!=='competitive'||!isId(id)||seen.has(id)||!Number.isFinite(started)||
      started<=0||started>now+120_000)continue;
   seen.add(id);discovered.push({id,started});
  }
  // A shared match is queued once by match_id, even if all five teammates find
  // the same game. Preserve every source-to-match link for coverage auditing.
  let newMatches=discovered;
  if(refresh&&discovered.length){
   const ids=await knownCoachMemberMatchIds(db,source.riot_id,discovered.map(m=>m.id));
   newMatches=discovered.filter(m=>!ids.has(m.id));
  }
  if(newMatches.length){
   const payload=JSON.stringify(newMatches);
   await db.prepare(`INSERT OR IGNORE INTO coach_member_queue
    (match_id,region,source_riot_id,source_puuid,started_at,status,attempts,next_at)
    SELECT json_extract(value,'$.id'),?,?,?,CAST(json_extract(value,'$.started') AS INTEGER),
      CASE WHEN EXISTS(
       SELECT 1 FROM valorant_match_rosters r
       JOIN valorant_match_round_events e ON e.match_id=r.match_id
       WHERE r.match_id=json_extract(value,'$.id')
        AND e.rounds_json IS NOT NULL AND e.kills_json IS NOT NULL AND ${ROSTER_SCHEMA_SQL} AND ${ASSIST_SCHEMA_SQL} AND ${CONTEXT_SCHEMA_SQL}
      ) THEN 'complete' ELSE 'pending' END,0,0
    FROM json_each(?)`).bind(source.region,source.riot_id,source.puuid,payload).run();
   await db.prepare(`INSERT OR IGNORE INTO coach_member_links(riot_id,match_id)
    SELECT ?,json_extract(value,'$.id') FROM json_each(?)`)
    .bind(source.riot_id,payload).run();
  }
  if(refresh){
   await db.prepare('UPDATE coach_member_sources SET next_at=? WHERE riot_id=?').bind(now+COACH_REFRESH_INTERVAL,source.riot_id).run();
   return 'refreshed';
  }
  const done=data.length<size||source.next_page>=maxPages;
  await db.prepare('UPDATE coach_member_sources SET next_page=?,done=?,truncated=?,next_at=? WHERE riot_id=?')
   .bind(source.next_page+1,done?1:0,data.length===size&&source.next_page>=maxPages?1:0,now+(done?COACH_REFRESH_INTERVAL:5*60_000),source.riot_id).run();
  return done?'discovery_done':'discovered';
 }catch{
  await postponeSource(db,source.riot_id,now);
  return 'deferred';
 }
}

export async function fetchNextCoachMemberMatch(db:D1Database,
 fetchDetail:(region:string,id:string)=>Promise<Match>,now=Date.now()):Promise<ArchiveStep>{
 if(!await getSwitch(db))return 'disabled';
 await upgradeCaptureQueue(db);
 // One candidate per tick. The unique match_id queue avoids duplicates across
 // all discovered players. Partial archives are retried at a cooldown until
 // all three total requests are exhausted; never treat missing kills as zero.
 // Phase 5: a shared match may have multiple verified collection sources.
 // Prefer the queue's original source only while its saved identity still matches;
 // otherwise select a verified, linked cohort member. No extra network request
 // or queue ownership mutation is made, including for older unlinked records.
 const permitted=COACH_MEMBER_ACCOUNTS.map(()=>'?').join(',');
 const row=await db.prepare(`SELECT q.match_id,
  COALESCE(source.region,q.region) AS region,
  COALESCE(source.riot_id,q.source_riot_id) AS riot_id,
  COALESCE(source.puuid,q.source_puuid) AS puuid,
  q.source_riot_id AS original_riot_id,q.started_at,q.attempts FROM coach_member_queue q
  LEFT JOIN coach_member_sources source ON source.riot_id=(
    SELECT s.riot_id FROM coach_member_links l
    JOIN coach_member_sources s ON s.riot_id=l.riot_id
    WHERE l.match_id=q.match_id AND s.riot_id IN (${permitted})
      AND length(s.puuid) BETWEEN 1 AND 128
      AND s.region IN ('ap','na','eu','kr','br','latam')
      AND (s.riot_id<>q.source_riot_id OR
       (s.puuid=q.source_puuid AND s.region=q.region))
    -- After a failed detail attempt, prefer an independently verified
    -- linked peer to avoid retrying only the original account (e.g. VDK).
    -- The queue still permits at most three attempts and one call per slot.
    ORDER BY CASE WHEN q.attempts>0
      THEN CASE WHEN s.riot_id=q.source_riot_id
         AND s.puuid=q.source_puuid AND s.region=q.region THEN 1 ELSE 0 END
      ELSE CASE WHEN s.riot_id=q.source_riot_id
         AND s.puuid=q.source_puuid AND s.region=q.region THEN 0 ELSE 1 END
     END,s.riot_id ASC LIMIT 1
  )
  WHERE q.status IN ('pending','partial') AND q.next_at<=? AND q.attempts<3
   AND (source.riot_id IS NOT NULL OR (
    q.source_riot_id IN (${permitted}) AND NOT EXISTS(
     SELECT 1 FROM coach_member_links l0 WHERE l0.match_id=q.match_id)))
  -- Prefer identity-verified linked matches over legacy unlinked rows.
  -- A missing legacy source must not monopolize a more useful cohort slot.
  ORDER BY CASE WHEN source.riot_id IS NOT NULL THEN 0 ELSE 1 END,
   q.started_at DESC LIMIT 1`)
  .bind(...COACH_MEMBER_ACCOUNTS.map(p=>p.riotId),now,...COACH_MEMBER_ACCOUNTS.map(p=>p.riotId)).first<Candidate>();
 if(!row)return 'idle';
 const complete=await db.prepare(`SELECT
  (SELECT COUNT(*) FROM valorant_match_rosters r WHERE match_id=? AND ${ROSTER_SCHEMA_SQL}) AS roster,
  (SELECT COUNT(*) FROM valorant_match_round_events e
   WHERE match_id=? AND rounds_json IS NOT NULL AND kills_json IS NOT NULL AND ${ASSIST_SCHEMA_SQL} AND ${CONTEXT_SCHEMA_SQL}) AS events,
  (SELECT value FROM monitor_state WHERE key=?) AS unavailable`)
  .bind(row.match_id,row.match_id,'coach_round_backfill:unavailable:'+row.match_id)
  .first<{roster:number;events:number;unavailable:string|null}>();
 if(complete?.roster&&complete.events){
  await db.prepare("UPDATE coach_member_queue SET status='complete' WHERE match_id=?").bind(row.match_id).run();
  return 'already_saved';
 }
 if(complete?.unavailable==='missing_kills'||complete?.unavailable==='404'){
  await postponeCandidate(db,row.match_id,now,'unavailable');
  return 'unavailable';
 }
 try{
  const detail=await fetchDetail(row.region,row.match_id);
  const started=safeTime(detail?.metadata?.started_at);
  if(detail?.metadata?.match_id!==row.match_id||detail.metadata.is_completed!==true||
   detail.metadata.queue?.id!=='competitive'||!Number.isFinite(started)||
   Math.abs(started-row.started_at)>120_000||
   !Array.isArray(detail.players)||detail.players.length!==10||
   !detail.players.some(p=>p.puuid===row.puuid)){
    await postponeCandidate(db,row.match_id,now,'pending');
    return 'deferred';
  }
  await recordCompetitiveRoster(db,detail,now);
  await recordCompetitiveRoundEvents(db,detail,now);
  await captureCompetitivePositions(db,detail,'detail',now);
  const saved=await db.prepare(`SELECT e.rounds_json,e.kills_json,
   (${ROSTER_SCHEMA_SQL}) AS roster_schema,(${ASSIST_SCHEMA_SQL}) AS assist_schema,(${CONTEXT_SCHEMA_SQL}) AS context_schema
   FROM valorant_match_round_events e LEFT JOIN valorant_match_rosters r ON r.match_id=e.match_id
   WHERE e.match_id=?`).bind(row.match_id).first<{rounds_json:string|null;kills_json:string|null;roster_schema:number|null;assist_schema:number|null;context_schema:number|null}>();
  const status=saved?.rounds_json&&saved.kills_json&&saved.roster_schema===1&&saved.assist_schema===1&&saved.context_schema===1?'complete':'partial';
  await db.prepare('UPDATE coach_member_queue SET status=?,attempts=attempts+1,next_at=? WHERE match_id=?')
   .bind(status,status==='partial'?now+delay:0,row.match_id).run();
  return status==='complete'?'saved':'partial';
 }catch(e){
  const notFound=e instanceof Error&&/\b(?:HTTP|API) 404\b/.test(e.message);
  if(notFound&&row.riot_id===row.original_riot_id&&row.attempts<2){
   // A 404 can be specific to the original source's region. Only retry if
   // a separately verified, linked member can fetch in another existing slot.
   // Do not spend this or a future slot on an unrelated or unresolved account.
   const peer=await db.prepare(`SELECT 1 AS eligible FROM coach_member_links l
    JOIN coach_member_sources s ON s.riot_id=l.riot_id
    WHERE l.match_id=? AND s.riot_id IN (${permitted}) AND s.riot_id<>?
     AND length(s.puuid) BETWEEN 1 AND 128
     AND s.region IN ('ap','na','eu','kr','br','latam')
    LIMIT 1`)
    .bind(row.match_id,...COACH_MEMBER_ACCOUNTS.map(p=>p.riotId),row.riot_id)
    .first<{eligible:number}>();
   if(peer){
    await postponeCandidate(db,row.match_id,now,'pending');
    return 'deferred';
   }
  }
  await postponeCandidate(db,row.match_id,now,notFound?'unavailable':'pending');
  return notFound?'unavailable':'deferred';
 }
}

export async function coachMemberCoverage(db:D1Database,onlyRiots?:readonly string[]){
 // No PUUID, tokens or raw match identifiers leave the authenticated API.
 const enabled=await getSwitch(db);
 const sources=await db.prepare(`SELECT s.riot_id,s.next_page,s.done,s.truncated,
   MAX(CASE WHEN s.puuid IS NOT NULL AND length(s.puuid)>0 AND s.region IN ('ap','na','eu','kr','br','latam') THEN 1 ELSE 0 END) AS identity_ready,
   COUNT(l.match_id) AS discovered,
   COALESCE(SUM(CASE WHEN q.status='complete' THEN 1 ELSE 0 END),0) AS complete,
   COALESCE(SUM(CASE WHEN q.status='partial' THEN 1 ELSE 0 END),0) AS partial,
   COALESCE(SUM(CASE WHEN q.status='unavailable' THEN 1 ELSE 0 END),0) AS unavailable,
   COALESCE(SUM(CASE WHEN q.status='pending' THEN 1 ELSE 0 END),0) AS pending
   FROM coach_member_sources s LEFT JOIN coach_member_links l ON l.riot_id=s.riot_id
   LEFT JOIN coach_member_queue q ON q.match_id=l.match_id
   ${onlyRiots?'WHERE s.riot_id IN ('+onlyRiots.map(()=>'?').join(',')+')':''}
   GROUP BY s.riot_id,s.next_page,s.done,s.truncated`).bind(...(onlyRiots??[])).all<{
    riot_id:string;next_page:number;done:number;truncated:number;identity_ready:number;discovered:number;
    complete:number;partial:number;unavailable:number;pending:number}>();
 return {enabled,refreshIntervalMinutes:COACH_REFRESH_INTERVAL/60000,refreshPageSize:50,supportsPause:true,source:'Henrik lifetime matches (API-known history; not guaranteed exhaustive)',
  people:COACH_MEMBER_ACCOUNTS.filter(p=>!onlyRiots||onlyRiots.includes(p.riotId)).map(person=>{
   const row=sources.results.find(s=>s.riot_id===person.riotId);
   return {person:person.person,riotId:person.riotId,
    discovered:row?.discovered??0,complete:row?.complete??0,
    partial:row?.partial??0,unavailable:row?.unavailable??0,
    pending:row?.pending??0,
    sourceResolved:row?.identity_ready===1,
    collectionStage:!enabled?'停止中':!row?'未登録':row.identity_ready!==1?'本人アカウント確認待ち':
     row.truncated?'履歴取得上限':row.done?'新しい試合を確認中':'過去試合を収集中',
    discoveryDone:Boolean(row?.done),truncated:Boolean(row?.truncated)};
  })};
}
