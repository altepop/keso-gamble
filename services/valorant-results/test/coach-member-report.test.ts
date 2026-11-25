import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {recordCompetitiveRoster} from '../src/match-rosters.ts';
import {recordCompetitiveRoundEvents} from '../src/round-events.ts';
import {enableAllMemberArchive} from '../src/coach-member-archive.ts';
import {readCoachMemberReport,readCoachComparison} from '../src/coach-member-report.ts';
import type {Match} from '../src/results.ts';

const now=Date.parse('2026-11-17T08:00:00Z');
function game(id:string,playerName:string,playerTag:string,puuid:string,
  alsoVdk=false):Match{
 const names=Array.from({length:10},(_,i)=>({
  puuid:i===0?puuid:i===1&&alsoVdk?'vdk-id':'other-'+i+'-'+id,
  team_id:i<5?'Blue':'Red',name:i===0?playerName:i===1&&alsoVdk?'Dolly':'other'+i,
  tag:i===0?playerTag:i===1&&alsoVdk?'SDGs':'J',
  agent:{name:'Fade'},stats:{kills:i===0?1:0,deaths:i===5?1:0,assists:0,score:i===0?200:0}
 }));
 return {metadata:{match_id:id,is_completed:true,
  started_at:'2026-11-12T10:00:00Z',game_length_in_ms:1_200_000,map:{name:'Ascent'},queue:{id:'competitive'}},
  players:names,teams:[{team_id:'Blue',won:true,rounds:{won:13}},
   {team_id:'Red',won:false,rounds:{won:8}}],
  rounds:Array.from({length:21},(_,id)=>({id,winning_team:id<13?'Blue':'Red',attacking_team:id<12?'Blue':'Red',defending_team:id<12?'Red':'Blue'})),
  kills:[{round:0,time_in_round_in_ms:600,killer:{puuid},victim:{puuid:'other-5-'+id}}]};
}
function setup(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE monitor_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE valorant_match_rosters(match_id TEXT PRIMARY KEY,ended_at INTEGER,map TEXT,
 act_name TEXT,teams_json TEXT,players_json TEXT,recorded_at INTEGER);
 CREATE TABLE valorant_match_round_events(match_id TEXT PRIMARY KEY,rounds_json TEXT,
 kills_json TEXT,recorded_at INTEGER);
 CREATE TABLE valorant_match_positions(match_id TEXT PRIMARY KEY,positions_json TEXT,recorded_at INTEGER,has_coordinates INTEGER);
 CREATE TABLE coach_member_sources(riot_id TEXT PRIMARY KEY,puuid TEXT,region TEXT,
 next_page INTEGER NOT NULL DEFAULT 1,done INTEGER NOT NULL DEFAULT 0,
 truncated INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE coach_member_queue(match_id TEXT PRIMARY KEY,region TEXT NOT NULL,
 source_riot_id TEXT NOT NULL,source_puuid TEXT NOT NULL,started_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
 next_at INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE coach_member_links(riot_id TEXT NOT NULL,match_id TEXT NOT NULL,PRIMARY KEY(riot_id,match_id));`);
 let writes=0;const queries:string[]=[];
 const db={prepare:(text:string)=>{queries.push(text);
  const wrap=(args:unknown[])=>({
   first:async()=>sql.prepare(text).get(...args as never[])??null,
   all:async()=>({results:sql.prepare(text).all(...args as never[])}),
   run:async()=>{writes++;return {meta:{changes:Number(sql.prepare(text).run(...args as never[]).changes)}}}
  });return {...wrap([]),bind:(...args:unknown[])=>wrap(args)};
 }} as unknown as D1Database;
 return {sql,db,queries,writes:()=>writes,close:()=>sql.close()};
}
test('personal baseline includes own games without VDK; no duplicate game when co-playing',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?')
   .run('aqua-id','ap','Aquatopia#toppy');
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?')
   .run('vdk-id','ap','Dolly#SDGs');
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?')
   .run('abema-id','ap','Abema#ttv');
  const alone=game('aqua-alone','Aquatopia','toppy','aqua-id');
  const duo=game('with-vdk','Aquatopia','toppy','aqua-id',true);
  const vdk=game('vdk-only','Dolly','SDGs','vdk-id');
  const otherAccount=game('abema-alone','Abema','ttv','abema-id');
  for(const m of [alone,duo,vdk,otherAccount]){
   await recordCompetitiveRoster(f.db,m,now);
   await recordCompetitiveRoundEvents(f.db,m,now);
  }
  const before=f.writes();
  const me=await readCoachMemberReport(f.db,'神戸');
  assert.equal(me.person,'神戸');
  assert.equal(me.profile,'神戸');
  assert.deepEqual(me.accounts,['Abema#ttv','Aquatopia#toppy']);
  assert.equal(me.usableMatches,3,'Kobe includes Abema alone and Aquatopia with/without VDK');
  assert.equal(me.individual.length,1);
  assert.equal(me.individual[0]?.matches,3);
  assert.equal(me.individual[0]?.samePartyAsVdk,0,
   'the owner must never be compared with their own party ID');
  assert.equal(me.individual[0]?.partyUnknown,3,
   'VDK-absent and missing party IDs are not fake same-party successes');
  assert.equal(me.overall.matches,3);
  assert.equal(me.coverage.analysisMatches,3);
  assert.equal(me.matchTrend.length,3,'same three complete person-matches create the visible trend');
  assert.ok(me.matchTrend.every(x=>x.outcome==='win'&&x.kills===1));
  assert.equal(JSON.stringify(me.matchTrend).includes('aqua-id'),false,'chart cannot leak PUUID');
  assert.equal(me.coverage.allMatchesGuaranteed,false);
  assert.equal(me.fullDiagnosis.synopsis.find(s=>s.subject==='神戸')?.subject,'神戸');
  assert.equal(me.fullDiagnosis.synopsis.some(s=>s.subject==='Abema'||s.subject==='Aquatopia'),false,
   'person summary should not score the same owner as two different people');
  assert.equal(JSON.stringify(me).includes('aqua-id'),false,'PUUID is never leaked');
  const dolly=await readCoachMemberReport(f.db,'VDK');
  assert.equal(dolly.usableMatches,2,'VDK has its own game plus shared game');
  assert.equal(dolly.individual[0]?.matches,2);
  const abema=await readCoachMemberReport(f.db,'Abema');
  assert.equal(abema.usableMatches,1,'account-specific view remains available');
  assert.equal(abema.individual[0]?.player,'Abema');
  const aqua=await readCoachMemberReport(f.db,'Aquatopia');
  assert.deepEqual(aqua.accounts,['Aquatopia#toppy']);assert.equal(aqua.performance.overall.matches,2);
  assert.equal(me.performance.overall.matches,3);
  const ishihara=await readCoachMemberReport(f.db,'石原');
  assert.equal(ishihara.usableMatches,0);
  assert.equal(ishihara.individual.length,0);
  assert.equal(f.writes(),before,'authenticated analyses only read D1');
 }finally{f.close()}
});
test('an old in-game alias is still matched to confirmed PUUID without attributing another user',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?')
   .run('aqua-id','ap','Aquatopia#toppy');
  const old=game('renamed','OldName','OLDTAG','aqua-id');
  await recordCompetitiveRoster(f.db,old,now);
  await recordCompetitiveRoundEvents(f.db,old,now);
  const result=await readCoachMemberReport(f.db,'神戸');
  assert.equal(result.usableMatches,1);
  assert.equal(result.individual[0]?.player,'神戸');
  assert.equal(result.individual[0]?.firstKills,1);
  assert.deepEqual(result.accounts,['Abema#ttv','Aquatopia#toppy']);
  await assert.rejects(()=>readCoachMemberReport(f.db,'untrusted#account'),/Unrecognized/);
 }finally{f.close()}
});

test('two Kobe accounts in one match row are deduplicated by match_id, not twice in the person sample',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?')
   .run('abema-id','ap','Abema#ttv');
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?')
   .run('aqua-id','ap','Aquatopia#toppy');
  const m=game('shared-id','Abema','ttv','abema-id');
  await recordCompetitiveRoster(f.db,m,now);
  await recordCompetitiveRoundEvents(f.db,m,now);
  const result=await readCoachMemberReport(f.db,'神戸');
  assert.equal(result.usableMatches,1);
  assert.equal(result.individual[0]?.matches,1);
  assert.equal(result.individual[0]?.player,'神戸');
 }finally{f.close()}
});

test('comparison validates the cohort before reads and preserves independent per-person profiles',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);await recordCompetitiveRoster(f.db,game('own-only','Dolly','SDGs','vdk-id'),now);
  const before=f.writes(),start=f.queries.length,result=await readCoachComparison(f.db,['VDK','小林']);
  assert.equal(f.queries.slice(start).filter(q=>q.includes('GROUP BY s.riot_id')).length,1,'coverage aggregation shared across profiles');
  assert.equal(result.profiles[0].performance.overall.matches,1);assert.equal(result.profiles[1].performance.overall.matches,0);assert.equal(f.writes(),before);
  await assert.rejects(()=>readCoachComparison(f.db,['VDK','VDK']));await assert.rejects(()=>readCoachComparison(f.db,['untrusted']));await assert.rejects(()=>readCoachComparison(f.db,[]));
 }finally{f.close()}
});

test('incomplete round events never drive FK diagnosis but still allow valid roster performance',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);const m=game('missing-events','Dolly','SDGs','vdk-id');
  await recordCompetitiveRoster(f.db,m,now);await recordCompetitiveRoundEvents(f.db,{...m,kills:[]},now);
  const r=await readCoachMemberReport(f.db,'VDK');assert.equal(r.archivedMatches,1);assert.equal(r.performance.overall.kdMatches,1);assert.equal(r.usableMatches,0);assert.equal(r.individual.length,0);assert.equal(r.killDataMissing,1);
  assert.equal(r.nextMatch.matches,0);assert.ok(r.nextMatch.focus.action);assert.equal(r.nextMatch.check.metrics.length,0,'incomplete event history is not treated as a verified comparative game');
  assert.equal(r.matchFeedback.sessions.length,0,'incomplete events cannot become a verified evaluation');assert.ok(r.matchFeedback.starter);assert.equal(r.matchFeedback.quality.incompleteExcluded,1);
 }finally{f.close()}
});

test('authenticated owner report exposes only aggregate Phase 0 location coverage',async()=>{
 const f=setup();
 try{
  await enableAllMemberArchive(f.db);
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?')
   .run('vdk-id','ap','Dolly#SDGs');
  const m=game('position-case','Dolly','SDGs','vdk-id');
  await recordCompetitiveRoster(f.db,m,now);
  await recordCompetitiveRoundEvents(f.db,m,now);
  const sorted=[...m.players].sort((a,b)=>a.puuid.localeCompare(b.puuid));
  const own=sorted.findIndex(p=>p.puuid==='vdk-id');
  f.sql.prepare('INSERT INTO valorant_match_positions VALUES(?,?,?,?)').run('position-case',JSON.stringify({
   schema:1,roster:sorted.map(p=>({id:p.puuid,team:p.team_id})),
   frames:[{victim:own,killer:null,victimLocation:[23,44],locations:[]}]
  }),now,1);
  const before=f.writes();
  const result=await readCoachMemberReport(f.db,'VDK');
  assert.equal(result.positionCoverage.verifiedPositionMatches,1);
  assert.equal(result.positionCoverage.knownOwnVictimLocations,1);
  assert.equal(result.positionCoverage.observedOwnVictimEvents,1);
  assert.equal(f.writes(),before);
  assert.equal(JSON.stringify(result.positionCoverage).includes('vdk-id'),false);
  assert.equal(JSON.stringify(result.positionCoverage).includes('23,44'),false);
 }finally{f.close();}
});

test('invalid historical roster JSON is ignored without aborting verified owner reporting',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  await recordCompetitiveRoster(f.db,game('valid-legacy','Dolly','SDGs','vdk-id'),now);
  await recordCompetitiveRoundEvents(f.db,game('valid-legacy','Dolly','SDGs','vdk-id'),now);
  f.sql.prepare("INSERT INTO valorant_match_rosters(match_id,ended_at,recorded_at,map,act_name,players_json,teams_json) VALUES(?,?,?,?,?,?,?)")
   .run('broken-legacy',now,now,'Ascent','', '{broken json','[]');
  const result=await readCoachMemberReport(f.db,'VDK');
  assert.equal(result.archivedMatches,1);
  assert.equal(result.coverage.positionEvidenceUnavailable,false);
 }finally{f.close();}
});

test('oversized position evidence falls back to position-unavailable without inventing evidence or writing D1',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  const match=game('position-large','Dolly','SDGs','vdk-id');
  await recordCompetitiveRoster(f.db,match,now);
  await recordCompetitiveRoundEvents(f.db,match,now);
  const original=f.db;
  const db={prepare:(sql:string)=>{
   if(sql.includes('pos.positions_json'))return {bind:()=>({all:async()=>{throw Error('D1 query result exceeded the maximum response size limit of 50 MB');}})};
   return original.prepare(sql);
  }} as unknown as D1Database;
  const before=f.writes();
  const result=await readCoachMemberReport(db,'VDK');
  assert.equal(result.archivedMatches,1);
  assert.equal(result.coverage.positionEvidenceUnavailable,true);
  assert.equal(result.positionCoverage.verifiedPositionMatches,0);
  assert.equal(f.writes(),before);
 }finally{f.close();}
});

test('06:57 time-only roster cannot block last fully verified competitive evaluation',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?').run('vdk-id','ap','Dolly#SDGs');
  const complete=game('verified-older','Dolly','SDGs','vdk-id');
  assert.equal(await recordCompetitiveRoster(f.db,complete,now),true);
  assert.equal(await recordCompetitiveRoundEvents(f.db,complete,now),true);
  const empty=game('timestamp-only','Dolly','SDGs','vdk-id');
  empty.metadata.started_at='2026-11-21T21:37:00Z';
  delete empty.metadata.map;
  empty.teams=empty.teams.map(t=>({...t,won:null,rounds:{won:null}})) as unknown as Match['teams'];
  empty.players=empty.players.map(p=>({...p,agent:undefined,stats:undefined})) as unknown as Match['players'];
  empty.rounds=[];empty.kills=[];
  assert.equal(await recordCompetitiveRoster(f.db,empty,now),true);
  const before=f.writes();
  const result=await readCoachMemberReport(f.db,'VDK');
  assert.equal(f.writes(),before,'evaluation is read only');
  assert.equal(result.archivedMatches,2,'partial archive remains for retry');
  assert.equal(result.performance.quality.excluded['time-only-record'],1);
  assert.equal(result.performance.timeline.length,1);
  assert.equal(result.matchFeedback.sessions.length,1);
  assert.equal(result.matchFeedback.sessions[0].map,'Ascent');
  assert.equal(result.matchFeedback.sessions[0].eventVerified,true);
  assert.equal(result.matchFeedback.quality.incompleteExcluded,1);
  assert.doesNotMatch(JSON.stringify(result.matchFeedback),/2026-11-21T21:57/);
  assert.match(result.nextMatch.strength.evidence,/Ascent/);
 }finally{f.close();}
});

test('fifty-five newer incomplete score rows cannot hide the last complete owner game',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?').run('vdk-id','ap','Dolly#SDGs');
  const older=game('older-complete','Dolly','SDGs','vdk-id');
  await recordCompetitiveRoster(f.db,older,now);await recordCompetitiveRoundEvents(f.db,older,now);
  for(let i=0;i<55;i++){
   const newer=game('newer-no-events-'+i,'Dolly','SDGs','vdk-id');
   newer.metadata.started_at=new Date(Date.parse('2026-11-13T00:00:00Z')+i*60000).toISOString();
   await recordCompetitiveRoster(f.db,newer,now);
  }
  const before=f.writes(),out=await readCoachMemberReport(f.db,'VDK');
  assert.equal(f.writes(),before);
  assert.equal(out.performance.timeline.length,50,'ordinary performance still respects its 50 match bound');
  assert.equal(out.matchFeedback.sessions.length,1,'evaluation searches all verified source rows, not the first 50 partials');
  assert.equal(out.matchFeedback.sessions[0].eventVerified,true);
  assert.equal(out.matchFeedback.quality.incompleteExcluded,55);
 }finally{f.close();}
});
