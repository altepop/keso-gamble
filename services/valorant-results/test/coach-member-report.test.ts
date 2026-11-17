import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {recordCompetitiveRoster} from '../src/match-rosters.ts';
import {recordCompetitiveRoundEvents} from '../src/round-events.ts';
import {enableAllMemberArchive} from '../src/coach-member-archive.ts';
import {readCoachMemberReport} from '../src/coach-member-report.ts';
import type {Match} from '../src/results.ts';

const now=Date.parse('2026-11-17T08:00:00Z');
function game(id:string,playerName:string,playerTag:string,puuid:string,
  alsoVdk=false):Match{
 const names=Array.from({length:10},(_,i)=>({
  puuid:i===0?puuid:i===1&&alsoVdk?'vdk-id':'other-'+i+'-'+id,
  team_id:i<5?'Blue':'Red',name:i===0?playerName:i===1&&alsoVdk?'Dolly':'other'+i,
  tag:i===0?playerTag:i===1&&alsoVdk?'SDGs':'J',
  agent:{name:'Fade'},stats:{kills:5,deaths:3,assists:2,score:1400}
 }));
 return {metadata:{match_id:id,is_completed:true,
  started_at:'2026-11-12T10:00:00Z',game_length_in_ms:1_200_000,queue:{id:'competitive'}},
  players:names,teams:[{team_id:'Blue',won:true,rounds:{won:13}},
   {team_id:'Red',won:false,rounds:{won:8}}],
  rounds:[{id:0,winning_team:'Blue',attacking_team:'Blue',defending_team:'Red'}],
  kills:[{round:0,time_in_round_in_ms:600,killer:{puuid},victim:{puuid:'other-5-'+id}}]};
}
function setup(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE monitor_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE valorant_match_rosters(match_id TEXT PRIMARY KEY,ended_at INTEGER,map TEXT,
 act_name TEXT,teams_json TEXT,players_json TEXT,recorded_at INTEGER);
 CREATE TABLE valorant_match_round_events(match_id TEXT PRIMARY KEY,rounds_json TEXT,
 kills_json TEXT,recorded_at INTEGER);
 CREATE TABLE coach_member_sources(riot_id TEXT PRIMARY KEY,puuid TEXT,region TEXT,
 next_page INTEGER NOT NULL DEFAULT 1,done INTEGER NOT NULL DEFAULT 0,
 truncated INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE coach_member_queue(match_id TEXT PRIMARY KEY,region TEXT NOT NULL,
 source_riot_id TEXT NOT NULL,source_puuid TEXT NOT NULL,started_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
 next_at INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE coach_member_links(riot_id TEXT NOT NULL,match_id TEXT NOT NULL,PRIMARY KEY(riot_id,match_id));`);
 let writes=0;
 const db={prepare:(text:string)=>{
  const wrap=(args:unknown[])=>({
   first:async()=>sql.prepare(text).get(...args as never[])??null,
   all:async()=>({results:sql.prepare(text).all(...args as never[])}),
   run:async()=>{writes++;return {meta:{changes:Number(sql.prepare(text).run(...args as never[]).changes)}}}
  });return {...wrap([]),bind:(...args:unknown[])=>wrap(args)};
 }} as unknown as D1Database;
 return {sql,db,writes:()=>writes,close:()=>sql.close()};
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
  assert.ok(me.matchTrend.every(x=>x.outcome==='win'&&x.kills===5));
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
