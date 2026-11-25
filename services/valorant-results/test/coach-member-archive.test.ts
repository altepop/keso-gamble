import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {COACH_MEMBER_ACCOUNTS,COACH_REFRESH_INTERVAL,enableAllMemberArchive,pauseAllMemberArchive,discoverCoachMemberPage,
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
  rounds:[{id:0,winning_team:'Blue',attacking_team:'Blue',defending_team:'Red',stats:[]}],
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
test('Phase 5 shows each source resolution independently without VDK-derived state or raw PUUID',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  const initial=await coachMemberCoverage(f.db);
  assert.equal(initial.people.length,6);
  assert.ok(initial.people.every(p=>p.sourceResolved===false&&p.collectionStage==='本人アカウント確認待ち'));
  f.sql.prepare("UPDATE coach_member_sources SET puuid=?,region=?,done=1 WHERE riot_id=?")
   .run('private-source-key','ap','frin#怖すぎ');
  const state=await coachMemberCoverage(f.db);
  const fuji=state.people.find(x=>x.person==='藤村')!;
  assert.equal(fuji.sourceResolved,true);
  assert.equal(fuji.collectionStage,'新しい試合を確認中');
  assert.equal(state.people.find(x=>x.person==='VDK')?.sourceResolved,false);
  assert.equal(state.people.find(x=>x.person==='神戸')?.sourceResolved,false);
  assert.equal(JSON.stringify(state).includes('private-source-key'),false);
  const scoped=await coachMemberCoverage(f.db,['frin#怖すぎ']);
  assert.deepEqual(scoped.people.map(x=>x.person),['藤村']);
  await pauseAllMemberArchive(f.db);
  assert.equal((await coachMemberCoverage(f.db)).people.find(x=>x.person==='藤村')?.collectionStage,'停止中');
 }finally{f.close();}
});
test('Phase 5 ignores unregistered lifetime sources without delaying or mutating six authorized accounts',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  // An unrelated source row must never be resolved, queried or reset by the
  // one-time migration, regardless of its due time or missing identity.
  f.sql.prepare("INSERT INTO coach_member_sources(riot_id,next_page,done,truncated,next_at) VALUES(?,3,1,1,0)")
   .run('unregistered#outside');
  const accountIds:string[]=[];
  const account=async(riotId:string)=>{accountIds.push(riotId);return {puuid:'player-0',region:'ap'};};
  assert.equal(await discoverCoachMemberPage(f.db,account,async()=>{throw Error('history must not run');},now),'resolved');
  assert.equal(accountIds.length,1);
  assert.ok(COACH_MEMBER_ACCOUNTS.some(x=>x.riotId===accountIds[0]));
  const extra=f.sql.prepare("SELECT next_page,done,truncated,next_at,puuid FROM coach_member_sources WHERE riot_id=?")
   .get('unregistered#outside') as {next_page:number;done:number;truncated:number;next_at:number;puuid:string|null};
  assert.deepEqual({...extra},{next_page:3,done:1,truncated:1,next_at:0,puuid:null},
   'unregistered source is neither repaired nor fetched');
  f.sql.prepare('UPDATE coach_member_sources SET next_at=? WHERE riot_id<>?')
   .run(now+COACH_REFRESH_INTERVAL,'unregistered#outside');
  let requests=0;
  assert.equal(await discoverCoachMemberPage(f.db,async()=>{requests++;throw Error('unregistered lookup');},
   async()=>{requests++;throw Error('unregistered lifetime');},now),'idle');
  assert.equal(requests,0);
  assert.equal(f.count('coach_member_links'),0);
  assert.equal(f.count('coach_member_queue'),0);
 }finally{f.close();}
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
test('v1 display-case modes are queued, other modes and invalid dates stay excluded',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  f.sql.prepare("UPDATE coach_member_sources SET puuid='player-0',region='ap',done=1,next_at=?").run(now+COACH_REFRESH_INTERVAL);
  f.sql.exec("UPDATE coach_member_sources SET done=0,next_at=0 WHERE riot_id='Dolly#SDGs'");
  const rows=[
   {meta:{id:'display-case',mode:'Competitive',started_at:started}},
   {meta:{id:'upper-case',mode:'COMPETITIVE',started_at:started}},
   {metadata:{match_id:'v4-id',queue:{id:'competitive'},started_at:started}},
   {meta:{id:'wrong-mode',mode:'Unrated',started_at:started}},
   {meta:{id:'unknown-mode',mode:null,started_at:started}},
   {meta:{id:'wrong-date',mode:'Competitive',started_at:'bad'}}
  ];
  assert.equal(await discoverCoachMemberPage(f.db,async()=>{throw Error('unneeded')},async()=>rows,now),'discovery_done');
  assert.deepEqual(f.sql.prepare('SELECT match_id FROM coach_member_queue ORDER BY match_id').all().map(r=>r.match_id),['display-case','upper-case','v4-id']);
 }finally{f.close()}
});
test('owner-opted-in legacy pages restart once without losing identities or existing data',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  f.sql.exec("UPDATE coach_member_sources SET puuid='player-0',region='ap',next_page=2,done=1,next_at=9999999999999");
  const rows=Array.from({length:50},(_,i)=>({meta:{id:'recovered-'+i,mode:'Competitive',started_at:started}}));
  let calls=0;
  const history=async(_region:string,_puuid:string,page:number)=>{calls++;assert.equal(page,1);return rows;};
  assert.equal(await discoverCoachMemberPage(f.db,async()=>{throw Error('must retain resolved identity')},history,now),'discovered');
  assert.equal(calls,1);assert.equal(f.count('coach_member_queue'),50);
  assert.equal((f.sql.prepare('SELECT COUNT(*) n FROM coach_member_sources WHERE next_page=1').get() as {n:number}).n,5);
  f.sql.prepare("UPDATE coach_member_sources SET next_page=3,done=1,next_at=?").run(now+COACH_REFRESH_INTERVAL);
  const writes=f.requests().writes;
  assert.equal(await discoverCoachMemberPage(f.db,async()=>{throw Error('unneeded')},history,now),'idle');
  assert.equal(f.requests().writes,writes,'repair does not reset pages on subsequent Cron runs');
  assert.equal(f.count('coach_member_queue'),50);assert.equal(f.count('coach_member_links'),50);
  assert.equal(calls,1);
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

test('Phase 5 shared match selects independently verified linked peer when original source identity is stale',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  const original=COACH_MEMBER_ACCOUNTS[0].riotId,peer=COACH_MEMBER_ACCOUNTS[3].riotId;
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?')
   .run('peer-verified','ap',peer);
  f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)")
   .run('shared-fallback','na',original,'stale-id',Date.parse(started));
  f.sql.prepare('INSERT INTO coach_member_links VALUES(?,?)').run(peer,'shared-fallback');
  let called=0;
  const result=await fetchNextCoachMemberMatch(f.db,async(region,id)=>{
   called++;assert.equal(region,'ap');assert.equal(id,'shared-fallback');
   return makeMatch(id,'peer-verified');
  },now);
  assert.equal(result,'saved');assert.equal(called,1,'no second Henrik detail request');
  assert.equal(f.count('valorant_match_rosters'),1);
  assert.equal((f.sql.prepare('SELECT source_riot_id FROM coach_member_queue WHERE match_id=?').get('shared-fallback') as {source_riot_id:string}).source_riot_id,original,'preserve queue attribution');
 }finally{f.close();}
});
test('Phase 5 prioritizes the still-verified original and never borrows unrelated source',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  const original=COACH_MEMBER_ACCOUNTS[0].riotId,peer=COACH_MEMBER_ACCOUNTS[3].riotId;
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?').run('player-0','ap',original);
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?').run('peer-verified','eu',peer);
  f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)")
   .run('shared-primary','ap',original,'player-0',Date.parse(started));
  for(const riot of [peer,original])f.sql.prepare('INSERT INTO coach_member_links VALUES(?,?)').run(riot,'shared-primary');
  let called=0;
  assert.equal(await fetchNextCoachMemberMatch(f.db,async(region,id)=>{
   called++;assert.equal(region,'ap');return makeMatch(id);
  },now),'saved');
  assert.equal(called,1);
  f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)")
   .run('unlinked-legacy','ap',original,'player-0',Date.parse(started)-1000);
  const older=makeMatch('unlinked-legacy');
  older.metadata.started_at=new Date(Date.parse(started)-1000).toISOString();
  assert.equal(await fetchNextCoachMemberMatch(f.db,async(region,id)=>{
   called++;assert.equal(region,'ap');return older;
  },now),'saved','old unlinked rows retain their original source');
  assert.equal(called,2);
 }finally{f.close();}
});
test('Phase 5 skips a linked match with stale identity so another member can collect within one slot',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  const stale=COACH_MEMBER_ACCOUNTS[0].riotId,ready=COACH_MEMBER_ACCOUNTS[1].riotId;
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?')
   .run('changed-identity','ap',stale);
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?')
   .run('player-0','ap',ready);
  const add=(id:string,riotId:string,puuid:string,time:number)=>{
   f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)")
    .run(id,'ap',riotId,puuid,time);
   f.sql.prepare('INSERT INTO coach_member_links VALUES(?,?)').run(riotId,id);
  };
  add('stale-newer',stale,'stale-identity',Date.parse(started)+1000);
  add('ready-older',ready,'player-0',Date.parse(started));
  let calls=0;
  assert.equal(await fetchNextCoachMemberMatch(f.db,async(region,id)=>{
   calls++;assert.equal(region,'ap');assert.equal(id,'ready-older');
   return makeMatch(id);
  },now),'saved');
  assert.equal(calls,1,'no wasted detail request to a stale source');
  assert.equal(f.count('valorant_match_rosters'),1);
  assert.equal((f.sql.prepare("SELECT status FROM coach_member_queue WHERE match_id='stale-newer'").get() as {status:string}).status,'pending');
  assert.equal(await fetchNextCoachMemberMatch(f.db,async()=>{calls++;throw Error('not permitted');},now),'idle');
  assert.equal(calls,1,'unresolved linked source never consumes API budget');
 }finally{f.close();}
});
test('Phase 5 permits a different verified linked source even if original account was replaced',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  const stale=COACH_MEMBER_ACCOUNTS[0].riotId,peer=COACH_MEMBER_ACCOUNTS[3].riotId;
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?').run('changed-identity','ap',stale);
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?').run('player-0','ap',peer);
  f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)")
   .run('linked-peer','ap',stale,'original-stale',Date.parse(started));
  for(const riot of [stale,peer])f.sql.prepare('INSERT INTO coach_member_links VALUES(?,?)').run(riot,'linked-peer');
  let calls=0;
  assert.equal(await fetchNextCoachMemberMatch(f.db,async(region,id)=>{
   calls++;assert.equal(id,'linked-peer');return makeMatch(id);
  },now),'saved');
  assert.equal(calls,1);
 }finally{f.close();}
});
test('Phase 5 prioritizes a verified linked member ahead of a newer legacy unlinked match',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  const verified=COACH_MEMBER_ACCOUNTS[3].riotId;
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?').run('player-0','ap',verified);
  f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)")
   .run('legacy-newer','ap',COACH_MEMBER_ACCOUNTS[0].riotId,'old-unverified',Date.parse(started)+1000);
  f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)")
   .run('linked-older','ap',verified,'player-0',Date.parse(started));
  f.sql.prepare('INSERT INTO coach_member_links VALUES(?,?)').run(verified,'linked-older');
  const fetched:string[]=[];
  assert.equal(await fetchNextCoachMemberMatch(f.db,async(region,id)=>{
   assert.equal(region,'ap');fetched.push(id);return makeMatch(id);
  },now),'saved');
  assert.deepEqual(fetched,['linked-older'],'a legacy gap cannot consume the verified member slot');
  assert.equal((f.sql.prepare("SELECT status FROM coach_member_queue WHERE match_id='legacy-newer'").get() as {status:string}).status,'pending');
  assert.equal(await fetchNextCoachMemberMatch(f.db,async(region,id)=>{
   fetched.push(id);throw Error('temporary provider error');
  },now),'deferred','legacy-only queue retains its historical fallback');
  assert.deepEqual(fetched,['linked-older','legacy-newer']);
 }finally{f.close();}
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

test('completed history refreshes only the newest page on schedule and skips all known links',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);f.sql.exec("INSERT INTO monitor_state VALUES('coach_lifetime_case_v1:ready','1')");
  f.sql.prepare("UPDATE coach_member_sources SET puuid='player-0',region='ap',done=1,next_page=5,next_at=?").run(now+COACH_REFRESH_INTERVAL);
  const riot=COACH_MEMBER_ACCOUNTS[0].riotId;f.sql.prepare('UPDATE coach_member_sources SET next_at=0 WHERE riot_id=?').run(riot);
  let calls=0;const history=async(_r:string,_p:string,page:number,size:number)=>{calls++;assert.equal(page,1);assert.equal(size,50);return [{meta:{id:'new-competitive',mode:'Competitive',started_at:started}}];};
  assert.equal(await discoverCoachMemberPage(f.db,async()=>{throw Error('resolved already')},history,now),'refreshed');
  const source=f.sql.prepare('SELECT * FROM coach_member_sources WHERE riot_id=?').get(riot)!;
  assert.equal(source.next_page,5);assert.equal(source.done,1);assert.equal(source.next_at,now+COACH_REFRESH_INTERVAL);assert.equal(f.count('coach_member_queue'),1);assert.equal(f.count('coach_member_links'),1);
  assert.equal(await discoverCoachMemberPage(f.db,async()=>{throw Error('unneeded')},history,now+COACH_REFRESH_INTERVAL-1),'idle');assert.equal(calls,1);
  f.sql.prepare('UPDATE coach_member_sources SET next_at=? WHERE riot_id<>?').run(now+2*COACH_REFRESH_INTERVAL,riot);
  const before=f.requests().writes;
  assert.equal(await discoverCoachMemberPage(f.db,async()=>{throw Error('unneeded')},history,now+COACH_REFRESH_INTERVAL),'refreshed');assert.equal(calls,2);
  assert.equal(f.requests().writes-before,1,'known-page refresh updates only its schedule, no queue/link writes');assert.equal(f.count('coach_member_queue'),1);
 }finally{f.close()}
});

test('refresh includes a new competitive game once, preserves shared matches and historical truncation',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);f.sql.exec("INSERT INTO monitor_state VALUES('coach_lifetime_case_v1:ready','1')");
  f.sql.prepare("UPDATE coach_member_sources SET puuid='player-0',region='ap',done=1,next_page=41,truncated=1,next_at=?").run(now+COACH_REFRESH_INTERVAL);
  const first=COACH_MEMBER_ACCOUNTS[0].riotId,second=COACH_MEMBER_ACCOUNTS[1].riotId;
  const rows=[{meta:{id:'shared-new',mode:'Competitive',started_at:started}},{meta:{id:'skip-casual',mode:'Unrated',started_at:started}}];
  for(const riot of [first,second]){
   f.sql.prepare('UPDATE coach_member_sources SET next_at=0 WHERE riot_id=?').run(riot);
   assert.equal(await discoverCoachMemberPage(f.db,async()=>{throw Error('unneeded')},async()=>rows,now),'refreshed');
  }
  assert.equal(f.count('coach_member_queue'),1);assert.equal(f.count('coach_member_links'),2);
  assert.equal(f.sql.prepare('SELECT truncated FROM coach_member_sources WHERE riot_id=?').get(first)!.truncated,1);
 }finally{f.close()}
});

test('pausing stops both discovery and detail acquisition without deleting saved progress; re-enable resumes',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);await pauseAllMemberArchive(f.db);let calls=0;
  const no=async()=>{calls++;throw Error('network must stay off')};
  assert.equal(await discoverCoachMemberPage(f.db,no,no,now),'disabled');assert.equal(await fetchNextCoachMemberMatch(f.db,no,now),'disabled');assert.equal(calls,0);assert.equal(f.count('coach_member_sources'),6);
  assert.equal((await coachMemberCoverage(f.db)).enabled,false);
  await enableAllMemberArchive(f.db);assert.equal((await coachMemberCoverage(f.db)).enabled,true);assert.equal(f.count('coach_member_sources'),6);
 }finally{f.close()}
});

test('Phase 5 coverage never exposes an unrelated persisted source or its private identifier',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  f.sql.prepare("INSERT INTO coach_member_sources(riot_id,puuid,region,next_page,done,truncated,next_at) VALUES(?,?,?,?,?,?,?)")
   .run('outsider#private','sensitive-outsider-puuid','ap',2,1,0,0);
  const coverage=await coachMemberCoverage(f.db);
  assert.equal(coverage.people.length,COACH_MEMBER_ACCOUNTS.length);
  assert.ok(coverage.people.every(p=>COACH_MEMBER_ACCOUNTS.some(a=>a.person===p.person)));
  assert.equal(JSON.stringify(coverage).includes('outsider#private'),false);
  assert.equal(JSON.stringify(coverage).includes('sensitive-outsider-puuid'),false);
  const row=f.sql.prepare('SELECT puuid,next_page,done FROM coach_member_sources WHERE riot_id=?')
   .get('outsider#private') as {puuid:string;next_page:number;done:number};
  assert.deepEqual({...row},{puuid:'sensitive-outsider-puuid',next_page:2,done:1});
 }finally{f.close();}
});

test('Phase 5 unlinked out-of-cohort legacy row cannot consume a Henrik detail slot',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  const permitted=COACH_MEMBER_ACCOUNTS[0].riotId;
  f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)")
   .run('out-of-cohort-newer','ap','outsider#private','private-puuid',Date.parse(started)+1000);
  f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)")
   .run('cohort-legacy','ap',permitted,'player-0',Date.parse(started));
  let calls=0;
  assert.equal(await fetchNextCoachMemberMatch(f.db,async(region,id)=>{
   calls++;assert.equal(region,'ap');assert.equal(id,'cohort-legacy');
   return makeMatch(id);
  },now),'saved');
  assert.equal(calls,1,'only the opted-in cohort may consume the shared request slot');
  assert.equal((f.sql.prepare("SELECT status FROM coach_member_queue WHERE match_id='out-of-cohort-newer'").get() as {status:string}).status,'pending');
  assert.equal(await fetchNextCoachMemberMatch(f.db,async()=>{
   calls++;throw Error('unrelated source must never be fetched');
  },now),'idle');
  assert.equal(calls,1);
 }finally{f.close();}
});

test('Phase 5 legacy schema upgrade never rewrites an unrelated completed queue row',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'complete',1,0)")
   .run('external-complete','ap','outsider#private','private-key',Date.parse(started)+1000);
  f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'complete',1,0)")
   .run('cohort-complete','ap',COACH_MEMBER_ACCOUNTS[0].riotId,'player-0',Date.parse(started));
  let calls=0;
  assert.equal(await fetchNextCoachMemberMatch(f.db,async(_region,id)=>{
   calls++;assert.equal(id,'cohort-complete');return makeMatch(id);
  },now),'saved','authorized stale complete row is still repaired');
  assert.equal(calls,1);
  const external=f.sql.prepare("SELECT status,attempts,next_at FROM coach_member_queue WHERE match_id='external-complete'").get() as {status:string;attempts:number;next_at:number};
  assert.deepEqual({...external},{status:'complete',attempts:1,next_at:0},'external queue state is immutable to cohort migration');
  assert.equal(await fetchNextCoachMemberMatch(f.db,async()=>{
   calls++;throw Error('never query outside cohort');
  },now),'idle');
  assert.equal(calls,1);
 }finally{f.close();}
});

test('Phase 5 archive detail retry switches from a failing original to a verified linked peer',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  const original=COACH_MEMBER_ACCOUNTS[0].riotId,peer=COACH_MEMBER_ACCOUNTS[3].riotId,id='archive-retry-peer';
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?').run('player-0','ap',original);
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?').run('peer-verified','eu',peer);
  f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)")
   .run(id,'ap',original,'player-0',Date.parse(started));
  for(const riot of [original,peer])f.sql.prepare('INSERT INTO coach_member_links VALUES(?,?)').run(riot,id);
  const regions:string[]=[];
  const detail=async(region:string,matchId:string)=>{
   regions.push(region);
   return region==='ap'?makeMatch('wrong-match'):makeMatch(matchId,'peer-verified');
  };
  assert.equal(await fetchNextCoachMemberMatch(f.db,detail,now),'deferred',
   'first detail attempt still prefers the verified original');
  assert.equal(await fetchNextCoachMemberMatch(f.db,detail,now+14*60_000),'idle',
   'the original cooldown remains in force');
  assert.equal(await fetchNextCoachMemberMatch(f.db,detail,now+15*60_000),'saved',
   'the retry uses the independently verified shared member');
  assert.deepEqual(regions,['ap','eu'],'one detail request per existing slot');
  const q=f.sql.prepare("SELECT status,attempts,source_riot_id,source_puuid FROM coach_member_queue WHERE match_id=?").get(id) as any;
  assert.equal(q.status,'complete');assert.equal(q.attempts,2);
  assert.equal(q.source_riot_id,original);assert.equal(q.source_puuid,'player-0',
   'retry never rewrites the original attribution');
 }finally{f.close();}
});
test('Phase 5 archive retry never selects an unregistered or unlinked peer',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  const original=COACH_MEMBER_ACCOUNTS[0].riotId,id='archive-no-peer';
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?').run('player-0','ap',original);
  f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)")
   .run(id,'ap',original,'player-0',Date.parse(started));
  f.sql.prepare('INSERT INTO coach_member_links VALUES(?,?)').run(original,id);
  f.sql.prepare("INSERT INTO coach_member_sources(riot_id,puuid,region) VALUES(?,?,?)").run('outsider#private','outsider-puuid','eu');
  f.sql.prepare('INSERT INTO coach_member_links VALUES(?,?)').run('outsider#private',id);
  const regions:string[]=[];
  const detail=async(region:string,matchId:string)=>{
   regions.push(region);return regions.length===1?makeMatch('mismatched'):makeMatch(matchId);
  };
  assert.equal(await fetchNextCoachMemberMatch(f.db,detail,now),'deferred');
  assert.equal(await fetchNextCoachMemberMatch(f.db,detail,now+15*60_000),'saved');
  assert.deepEqual(regions,['ap','ap'],'unregistered linked source is not used for a fallback');
 }finally{f.close();}
});

test('Phase 5 detail 404 from original leaves a verified peer retry while another member continues',async()=>{
 const f=setup();try{
  await enableAllMemberArchive(f.db);
  const original=COACH_MEMBER_ACCOUNTS[0].riotId,peer=COACH_MEMBER_ACCOUNTS[3].riotId,independent=COACH_MEMBER_ACCOUNTS[1].riotId;
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?').run('player-0','ap',original);
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?').run('peer-verified','eu',peer);
  f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?').run('independent-verified','ap',independent);
  const base=Date.parse(started);
  f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)")
   .run('shared-regional-404','ap',original,'player-0',base+1000);
  for(const riot of [original,peer])f.sql.prepare('INSERT INTO coach_member_links VALUES(?,?)').run(riot,'shared-regional-404');
  f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)")
   .run('independent-match','ap',independent,'independent-verified',base);
  f.sql.prepare('INSERT INTO coach_member_links VALUES(?,?)').run(independent,'independent-match');
  const requests:string[]=[];
  const detail=async(region:string,id:string)=>{
   requests.push(region+':'+id);
   if(region==='ap'&&id==='shared-regional-404')throw Error('Match API HTTP 404');
   const match=makeMatch(id,region==='eu'?'peer-verified':'independent-verified');
   if(id==='shared-regional-404')match.metadata.started_at=new Date(base+1000).toISOString();
   return match;
  };
  assert.equal(await fetchNextCoachMemberMatch(f.db,detail,now),'deferred');
  const retry=f.sql.prepare("SELECT status,attempts,next_at,source_riot_id FROM coach_member_queue WHERE match_id='shared-regional-404'").get() as any;
  assert.equal(retry.status,'pending');assert.equal(retry.attempts,1);assert.equal(retry.next_at,now+15*60_000);
  assert.equal(retry.source_riot_id,original);
  assert.equal(await fetchNextCoachMemberMatch(f.db,detail,now),'saved',
   'a missing original must not block the independently verified member');
  assert.equal(await fetchNextCoachMemberMatch(f.db,detail,now+15*60_000),'saved',
   'the next eligible slot recovers through the linked peer');
  assert.deepEqual(requests,['ap:shared-regional-404','ap:independent-match','eu:shared-regional-404']);
  assert.equal((f.sql.prepare("SELECT attempts FROM coach_member_queue WHERE match_id='shared-regional-404'").get() as any).attempts,2);
 }finally{f.close();}
});
test('Phase 5 detail 404 remains terminal without an independently verified registered link',async()=>{
 for(const peer of ['unlinked','unregistered','unresolved']){
  const f=setup();try{
   await enableAllMemberArchive(f.db);
   const original=COACH_MEMBER_ACCOUNTS[0].riotId,id='single-404';
   f.sql.prepare('UPDATE coach_member_sources SET puuid=?,region=? WHERE riot_id=?').run('player-0','ap',original);
   f.sql.prepare("INSERT INTO coach_member_queue VALUES(?,?,?,?,?,'pending',0,0)")
    .run(id,'ap',original,'player-0',Date.parse(started));
   f.sql.prepare('INSERT INTO coach_member_links VALUES(?,?)').run(original,id);
   if(peer==='unregistered'){
    f.sql.prepare('INSERT INTO coach_member_sources(riot_id,puuid,region) VALUES(?,?,?)')
     .run('outsider#private','private-puuid','eu');
    f.sql.prepare('INSERT INTO coach_member_links VALUES(?,?)').run('outsider#private',id);
   }
   if(peer==='unresolved'){
    f.sql.prepare('INSERT INTO coach_member_links VALUES(?,?)').run(COACH_MEMBER_ACCOUNTS[3].riotId,id);
   }
   let calls=0;
   assert.equal(await fetchNextCoachMemberMatch(f.db,async()=>{calls++;throw Error('Match API HTTP 404')},now),'unavailable');
   assert.equal((f.sql.prepare("SELECT status FROM coach_member_queue WHERE match_id=?").get(id) as any).status,'unavailable');
   assert.equal(await fetchNextCoachMemberMatch(f.db,async()=>{calls++;throw Error('no retry')},now+30*60_000),'idle');
   assert.equal(calls,1);
  }finally{f.close();}
 }
});
