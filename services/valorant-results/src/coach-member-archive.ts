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
async function upgradeCaptureQueue(db:D1Database){
 const key='coach_capture_v2:ready';
 if(await db.prepare('SELECT value FROM monitor_state WHERE key=?').bind(key).first())return;
 // Only executes after the existing owner opt-in check. No records are removed,
 // and previously unavailable sources keep their backoff/unavailable state.
 await db.prepare(`UPDATE coach_member_queue SET status='pending',attempts=0,next_at=0
  WHERE status='complete' AND NOT EXISTS(SELECT 1 FROM valorant_match_rosters r
   JOIN valorant_match_round_events e ON e.match_id=r.match_id
   WHERE r.match_id=coach_member_queue.match_id AND ${ROSTER_SCHEMA_SQL} AND ${ASSIST_SCHEMA_SQL}
    AND e.rounds_json IS NOT NULL AND e.kills_json IS NOT NULL)`).run();
 await db.prepare('INSERT OR IGNORE INTO monitor_state(key,value) VALUES(?,?)').bind(key,'1').run();
}

type Account={puuid:string;region:string};
type Source={riot_id:string;puuid:string|null;region:string|null;
 next_page:number;done:number;truncated:number;next_at:number};
type Candidate={match_id:string;region:string;riot_id:string;puuid:string;started_at:number;attempts:number};
type LifetimeMatch={meta?:{id?:unknown;mode?:unknown;started_at?:unknown};metadata?:{match_id?:unknown;queue?:{id?:unknown};started_at?:unknown}};
export type ArchiveStep='disabled'|'resolved'|'discovered'|'discovery_done'|'saved'|'already_saved'|'partial'|'unavailable'|'deferred'|'idle';
const isId=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<=128;
const isRegion=(x:unknown):x is string=>typeof x==='string'&&['ap','na','eu','kr','br','latam'].includes(x);
const safeTime=(s:unknown)=>typeof s==='string'?Date.parse(s):NaN;
const delay=15*60_000;
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

export async function discoverCoachMemberPage(db:D1Database,
 account:(riotId:string)=>Promise<Account>,
 lifetime:(region:string,puuid:string,page:number,size:number)=>Promise<unknown>,
 now=Date.now()):Promise<ArchiveStep>{
 if(!await getSwitch(db))return 'disabled';
 const source=await db.prepare(`SELECT riot_id,puuid,region,next_page,done,truncated,next_at
  FROM coach_member_sources WHERE done=0 AND next_at<=?
  ORDER BY CASE WHEN puuid IS NULL THEN 0 ELSE 1 END, next_page ASC,riot_id ASC LIMIT 1`).bind(now).first<Source>();
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
 const size=50,maxPages=40; // explicit 2,000-match discovery cap per Riot ID
 if(source.next_page>maxPages){
  await db.prepare('UPDATE coach_member_sources SET done=1,truncated=1 WHERE riot_id=?')
   .bind(source.riot_id).run();
  return 'discovery_done';
 }
 try{
  const data=await lifetime(source.region,source.puuid,source.next_page,size);
  if(!Array.isArray(data))throw Error('invalid history');
  const seen=new Set<string>();
  const discovered:Array<{id:string;started:number}>=[];
  for(const raw of data as LifetimeMatch[]){
   const meta=raw?.meta??raw?.metadata;
   const id=raw?.meta?.id??raw?.metadata?.match_id;
   const queue=raw?.meta?.mode??raw?.metadata?.queue?.id;
   const started=safeTime(meta?.started_at);
   if(queue!=='competitive'||!isId(id)||seen.has(id)||!Number.isFinite(started)||
      started<=0||started>now+120_000)continue;
   seen.add(id);discovered.push({id,started});
  }
  // A shared match is queued once by match_id, even if all five teammates find
  // the same game. Preserve every source-to-match link for coverage auditing.
  if(discovered.length){
   const payload=JSON.stringify(discovered);
   await db.prepare(`INSERT OR IGNORE INTO coach_member_queue
    (match_id,region,source_riot_id,source_puuid,started_at,status,attempts,next_at)
    SELECT json_extract(value,'$.id'),?,?,?,CAST(json_extract(value,'$.started') AS INTEGER),
      CASE WHEN EXISTS(
       SELECT 1 FROM valorant_match_rosters r
       JOIN valorant_match_round_events e ON e.match_id=r.match_id
       WHERE r.match_id=json_extract(value,'$.id')
        AND e.rounds_json IS NOT NULL AND e.kills_json IS NOT NULL AND ${ROSTER_SCHEMA_SQL} AND ${ASSIST_SCHEMA_SQL}
      ) THEN 'complete' ELSE 'pending' END,0,0
    FROM json_each(?)`).bind(source.region,source.riot_id,source.puuid,payload).run();
   await db.prepare(`INSERT OR IGNORE INTO coach_member_links(riot_id,match_id)
    SELECT ?,json_extract(value,'$.id') FROM json_each(?)`)
    .bind(source.riot_id,payload).run();
  }
  const done=data.length<size||source.next_page>=maxPages;
  await db.prepare('UPDATE coach_member_sources SET next_page=?,done=?,truncated=?,next_at=0 WHERE riot_id=?')
   .bind(source.next_page+1,done?1:0,data.length===size&&source.next_page>=maxPages?1:0,source.riot_id).run();
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
 const row=await db.prepare(`SELECT q.match_id,q.region,q.source_riot_id AS riot_id,
  q.source_puuid AS puuid,q.started_at,q.attempts FROM coach_member_queue q
  WHERE q.status IN ('pending','partial') AND q.next_at<=? AND q.attempts<3
  ORDER BY q.started_at DESC LIMIT 1`).bind(now).first<Candidate>();
 if(!row)return 'idle';
 const complete=await db.prepare(`SELECT
  (SELECT COUNT(*) FROM valorant_match_rosters r WHERE match_id=? AND ${ROSTER_SCHEMA_SQL}) AS roster,
  (SELECT COUNT(*) FROM valorant_match_round_events e
   WHERE match_id=? AND rounds_json IS NOT NULL AND kills_json IS NOT NULL AND ${ASSIST_SCHEMA_SQL}) AS events,
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
  const saved=await db.prepare(`SELECT e.rounds_json,e.kills_json,
   (${ROSTER_SCHEMA_SQL}) AS roster_schema,(${ASSIST_SCHEMA_SQL}) AS assist_schema
   FROM valorant_match_round_events e LEFT JOIN valorant_match_rosters r ON r.match_id=e.match_id
   WHERE e.match_id=?`).bind(row.match_id).first<{rounds_json:string|null;kills_json:string|null;roster_schema:number|null;assist_schema:number|null}>();
  const status=saved?.rounds_json&&saved.kills_json&&saved.roster_schema===1&&saved.assist_schema===1?'complete':'partial';
  await db.prepare('UPDATE coach_member_queue SET status=?,attempts=attempts+1,next_at=? WHERE match_id=?')
   .bind(status,status==='partial'?now+delay:0,row.match_id).run();
  return status==='complete'?'saved':'partial';
 }catch(e){
  const notFound=e instanceof Error&&/\b(?:HTTP|API) 404\b/.test(e.message);
  await postponeCandidate(db,row.match_id,now,notFound?'unavailable':'pending');
  return notFound?'unavailable':'deferred';
 }
}

export async function coachMemberCoverage(db:D1Database){
 // No PUUID, tokens or raw match identifiers leave the authenticated API.
 const enabled=await getSwitch(db);
 const sources=await db.prepare(`SELECT s.riot_id,s.next_page,s.done,s.truncated,
   COUNT(l.match_id) AS discovered,
   COALESCE(SUM(CASE WHEN q.status='complete' THEN 1 ELSE 0 END),0) AS complete,
   COALESCE(SUM(CASE WHEN q.status='partial' THEN 1 ELSE 0 END),0) AS partial,
   COALESCE(SUM(CASE WHEN q.status='unavailable' THEN 1 ELSE 0 END),0) AS unavailable,
   COALESCE(SUM(CASE WHEN q.status='pending' THEN 1 ELSE 0 END),0) AS pending
   FROM coach_member_sources s LEFT JOIN coach_member_links l ON l.riot_id=s.riot_id
   LEFT JOIN coach_member_queue q ON q.match_id=l.match_id
   GROUP BY s.riot_id,s.next_page,s.done,s.truncated`).all<{
    riot_id:string;next_page:number;done:number;truncated:number;discovered:number;
    complete:number;partial:number;unavailable:number;pending:number}>();
 return {enabled,source:'Henrik lifetime matches (API-known history; not guaranteed exhaustive)',
  people:COACH_MEMBER_ACCOUNTS.map(person=>{
   const row=sources.results.find(s=>s.riot_id===person.riotId);
   return {person:person.person,riotId:person.riotId,
    discovered:row?.discovered??0,complete:row?.complete??0,
    partial:row?.partial??0,unavailable:row?.unavailable??0,
    pending:row?.pending??0,
    discoveryDone:Boolean(row?.done),truncated:Boolean(row?.truncated)};
  })};
}
