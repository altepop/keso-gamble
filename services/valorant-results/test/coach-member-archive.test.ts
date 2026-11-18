import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {COACH_MEMBER_ACCOUNTS,enableAllMemberArchive,discoverCoachMemberPage,
 fetchNextCoachMemberMatch,coachMemberCoverage} from '../src/coach-member-archive.ts';
import {recordCompetitiveRoster} from '../src/match-rosters.ts';
import {recordCompetitiveRoundEvents} from '../src/round-events.ts';
import type {Match} from '../src/results.ts';

const now=Date.parse('2026-11-17T08:00:00Z');
const started='2026-11-16T10:00:00.000Z';
function makeMatch(id:string,sourcePuuid='player-0'):Match{
 return {metadata:{match_id:id,queue:{id:'competitive'},is_completed:true,
   started_at:started,game_length_in_ms:1_200_000,map:{name:'Lotus'}},
  players:Array.from({length:10},(_,i)=>({
   puuid:i===0?sourcePuuid:'other-'+i,team_id:i<5?'Blue':'Red',
   name:i===0?'Dolly':'player'+i,tag:i===0?'SDGs':'JP',
   stats:{kills:5,deaths:10,assists:3,score:1600,headshots:4,bodyshots:12,legshots:4,damage:{dealt:2400,received:3000}},agent:{name:'Fade'}
  })),
  teams:[{team_id:'Blue',won:true,rounds:{won:13}},{team_id:'Red',won:false,rounds:{won:8}}],
  rounds:[{id:0,winning_team:'Blue',attacking_team:'Blue',defending_team:'Red'}],
  kills:[{round:0,time_in_round_in_ms:2300,killer:{puuid:sourcePuuid},victim:{puuid:'other-5'},assistants:[]}]};
}
function setup(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE monitor_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE tracked_players(riot_id TEXT PRIMARY KEY,puuid TEXT,region TEXT);
 CREATE TABLE valorant_match_rosters(match_id TEXT PRIMARY KEY,ended_at INTEGER,map TEXT,
 act_name TEXT,teams_json TEXT,players_json TEXT,recorded_at INTEGER);
 CREATE TABLE valorant_match_round_events(match_id TEXT PRIMARY KEY,rounds_json TEXT,
 kills_json TEXT,recorded_at INTEGER);`);
 const schema=[
  `CREATE TABLE coach_member_sources(riot_id TEXT PRIMARY KEY,puuid TEXT,region TEXT,
    next_page INTEGER NOT NULL DEFAULT 1,done INTEGER NOT NULL DEFAULT 0,
    truncated INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE coach_member_queue(match_id TEXT PRIMARY KEY,region TEXT NOT NULL,
    source_riot_id TEXT NOT NULL,source_puuid TEXT NOT NULL,started_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
    next_at INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE coach_member_links(riot_id TEXT NOT NULL,match_id TEXT NOT NULL,
    PRIMARY KEY(riot_id,match_id))`
 ];
 sql.exec(schema.join(';')+';');
 let queries=0,writes=0;
 const db={prepare:(text:string)=>{
  const make=(args:unknown[])=>({
   first:async()=>{queries++;return sql.prepare(text).get(...args as never[])??null;},
   all:async()=>{queries++;return {results:sql.prepare(text).all(...args as never[])};},
   run:async()=>{writes++;return {meta:{changes:Number(sql.prepare(text).run(...args as never[]).changes)}};}
  });
  return {...make([]),bind:(...a:unknown[])=>make(a)};
 }} as unknown as D1Database;
 const count=(table:string)=>Number((sql.prepare('SELECT COUNT(*) AS n FROM '+table).get() as {n:number}).n);
 return {sql,db,count,requests:()=>({queries,writes}),close:()=>sql.close()};
}
test('off until explicitly enabled, no account API calls, match writes or KP',async()=>{
 const f=setup();try{
  assert.equal(await discoverCoachMemberPage(f.db,async()=>{throw Error('network')},async()=>[],now),'disabled');
  assert.equal(await fetchNextCoachMemberMatch(f.db,async()=>{throw Error('network')},now),'disabled');
  assert.equal(f.count('coach_member_queue'),0);assert.equal(f.requests().writes,0,'no queue upgrade or archive writes before owner opt-in');
 }finally{f.close()}
});
test('all six accounts including Kobe/Aquatopia, Fujimura, Ishihara, Abema have separate history sources',async()=>{
 const f=setup();try{
  const r=await enableAllMemberArchive(f.db);
  assert.equal(r.persons.length,6);
  assert.equal(f.count('coach_member_sources'),6);
  assert.ok(COACH_MEMBER_ACCOUNTS.some(x=>x.person==='神戸'&&x.riotId==='Aquatopia#toppy'));
  assert.ok(COACH_MEMBER_ACCOUNTS.some(x=>x.person==='藤村'&&x.riotId==='frin#怖すぎ'));
  assert.equal(COACH_MEMBER_ACCOUNTS.filter(x=>x.person==='神戸').length,1);
  await enableAllMemberArchive(f.db);
  assert.equal(f.count('coach_member_sources'),6,'idempotent start');
  const status=await coachMemberCoverage(f.db);
  assert.equal(status.enabled,true);
  assert.equal(status.people.length,6);
  assert.ok(status.source.includes('not guaranteed exhaustive'));
 }finally{f.close()}
});
test('paged lifetime index deduplicates shared matches and only fetches new competitive matches',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  let accounts=0,history=0;
  const account=async(riotId:string)=>{accounts++;return {region:'ap',puuid:'player-0'};};
  const historyFn=async(_region:string,_puuid:string,page:number,size:number)=>{
   history++;assert.equal(page,1);assert.equal(size,50);
   return [{meta:{id:'game-one',mode:'competitive',started_at:started}},
    {meta:{id:'game-two',mode:'competitive',started_at:started}},
    {meta:{id:'game-junk',mode:'spikerush',started_at:started}},
    {meta:{id:'game-one',mode:'competitive',started_at:started}},
    {meta:{id:'wrong-time',mode:'competitive',started_at:'bad'}}];
  };
  for(let i=0;i<6;i++)assert.equal(await discoverCoachMemberPage(f.db,account,historyFn,now),'resolved');
  for(let i=0;i<6;i++)assert.equal(await discoverCoachMemberPage(f.db,account,historyFn,now),'discovery_done');
  assert.equal(accounts,6);assert.equal(history,6);
  assert.equal(f.count('coach_member_queue'),2,'match_id globally unique even when shared');
  assert.equal(f.count('coach_member_links'),12,'links keep all source memberships');
  let fetched=0;
  const fetch=async(_region:string,id:string)=>{fetched++;return makeMatch(id);};
  assert.equal(await fetchNextCoachMemberMatch(f.db,fetch,now),'saved');
  assert.equal(await fetchNextCoachMemberMatch(f.db,fetch,now),'saved');
  assert.equal(await fetchNextCoachMemberMatch(f.db,fetch,now),'idle');
  assert.equal(fetched,2);
  assert.equal(f.count('valorant_match_rosters'),2);
  assert.equal(f.count('valorant_match_round_events'),2);
  const coverage=await coachMemberCoverage(f.db);
  assert.equal(coverage.people.every(x=>x.complete===2&&x.discovered===2),true);
  assert.equal(coverage.people.every(x=>x.discoveryDone),true);
 }finally{f.close()}
});
test('source validation, absent kill timelines and missing upstream games cannot appear as complete',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  const riot=COACH_MEMBER_ACCOUNTS[0].riotId;
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=?,done=1 WHERE riot_id=?')
   .run('player-0','ap',riot);
  const add=(id:string)=>f.sql.prepare(`INSERT INTO coach_member_queue
   VALUES(?,?,?,?,?,'pending',0,0)`).run(id,'ap',riot,'player-0',Date.parse(started));
  add('mismatch');
  let response=await fetchNextCoachMemberMatch(f.db,async()=>makeMatch('not-mismatch'),now);
  assert.equal(response,'deferred');
  assert.equal(f.count('valorant_match_rosters'),0);
  add('partial');
  // At most the newest of two candidates is selected each time.
  const id=(f.sql.prepare("SELECT match_id FROM coach_member_queue WHERE status='pending' AND next_at=0 ORDER BY started_at DESC LIMIT 1").get() as {match_id:string}).match_id;
  const missing=makeMatch(id);delete missing.kills;
  response=await fetchNextCoachMemberMatch(f.db,async()=>missing,now);
  assert.equal(response,'partial');
  assert.equal(f.count('valorant_match_rosters'),1);
  assert.equal(f.count('valorant_match_round_events'),1);
  assert.equal((f.sql.prepare('SELECT status FROM coach_member_queue WHERE match_id=?').get(id) as {status:string}).status,'partial');
  const status=await coachMemberCoverage(f.db);
  assert.equal(status.people.find(x=>x.person==='VDK')?.complete,0);
  assert.equal(status.people.find(x=>x.person==='VDK')?.partial,0,
   'coverage is only counted for candidates linked to that person, never guessed');
 }finally{f.close()}
});

test('partial kill timelines are retried after cooldown and repaired without rewriting earlier rounds',async()=>{
 const f=setup();
 try{
  await enableAllMemberArchive(f.db);
  const riot=COACH_MEMBER_ACCOUNTS[0].riotId,id='repairable';
  const start=Date.parse(started);
  f.sql.prepare(`INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)`)
   .run(id,'ap',riot,'player-0',start);
  let calls=0;
  const detail=async()=>{
   calls++;
   const m=makeMatch(id);
   if(calls===1)delete m.kills;
   return m;
  };
  assert.equal(await fetchNextCoachMemberMatch(f.db,detail,now),'partial');
  assert.equal(await fetchNextCoachMemberMatch(f.db,detail,now+14*60_000),'idle',
    'a partial game must not cause uncontrolled repeat requests');
  assert.equal(await fetchNextCoachMemberMatch(f.db,detail,now+16*60_000),'saved');
  assert.equal(calls,2);
  assert.equal(f.count('valorant_match_rosters'),1,'same game must not be duplicated');
  assert.equal(f.count('valorant_match_round_events'),1);
  const status=f.sql.prepare('SELECT status,attempts FROM coach_member_queue WHERE match_id=?')
   .get(id) as {status:string;attempts:number};
  assert.equal(status.status,'complete');
  assert.equal(status.attempts,2);
  const row=f.sql.prepare('SELECT rounds_json,kills_json FROM valorant_match_round_events WHERE match_id=?')
   .get(id) as {rounds_json:string;kills_json:string};
  assert.ok(JSON.parse(row.rounds_json).length>0);
  assert.ok(JSON.parse(row.kills_json).length>0);
  assert.equal(await fetchNextCoachMemberMatch(f.db,detail,now+32*60_000),'idle');
 }finally{f.close()}
});
test('incomplete match after three tries stays explicitly partial rather than claiming a clean archive',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  const id='persistently-partial',riot=COACH_MEMBER_ACCOUNTS[0].riotId;
  f.sql.prepare(`INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)`)
   .run(id,'ap',riot,'player-0',Date.parse(started));
  let calls=0;
  const incomplete=async()=>{calls++;const m=makeMatch(id);delete m.kills;return m};
  for(let n=0;n<3;n++)assert.equal(
   await fetchNextCoachMemberMatch(f.db,incomplete,now+n*16*60_000),'partial');
  assert.equal(await fetchNextCoachMemberMatch(f.db,incomplete,now+4*16*60_000),'idle');
  assert.equal(calls,3);
  const status=f.sql.prepare('SELECT status,attempts FROM coach_member_queue WHERE match_id=?')
   .get(id) as {status:string;attempts:number};
  assert.equal(status.status,'partial');
  assert.equal(status.attempts,3);
 }finally{f.close()}
});

test('owner opt-in requeues a legacy complete capture and fills its missing fields within the existing single-fetch slot',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);const id='legacy-complete',full=makeMatch(id);
  await recordCompetitiveRoster(f.db,full,now-1000);await recordCompetitiveRoundEvents(f.db,full,now-1000);
  const ps=JSON.parse(String(f.sql.prepare('SELECT players_json FROM valorant_match_rosters').get()!.players_json));
  for(const p of ps)for(const key of ['hs','bs','ls','damageDealt','damageReceived','coachSchema'])delete p[key];
  const ks=JSON.parse(String(f.sql.prepare('SELECT kills_json FROM valorant_match_round_events').get()!.kills_json));
  for(const k of ks){delete k.assistants;delete k.assistantsAt;delete k.assistSchema;}
  f.sql.prepare('UPDATE valorant_match_rosters SET players_json=?').run(JSON.stringify(ps));f.sql.prepare('UPDATE valorant_match_round_events SET kills_json=?').run(JSON.stringify(ks));
  f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'complete',1,0)").run(id,'ap',COACH_MEMBER_ACCOUNTS[0].riotId,'player-0',Date.parse(started));
  let calls=0;assert.equal(await fetchNextCoachMemberMatch(f.db,async()=>{calls++;return full;},now),'saved');assert.equal(calls,1);
  const saved=f.sql.prepare('SELECT players_json,recorded_at FROM valorant_match_rosters').get()!;
  assert.equal(JSON.parse(String(saved.players_json))[0].coachSchema,2);assert.equal(saved.recorded_at,now-1000);
  assert.equal(await fetchNextCoachMemberMatch(f.db,async()=>{calls++;return full;},now+16*60_000),'idle');assert.equal(calls,1);
 }finally{f.close()}
});
