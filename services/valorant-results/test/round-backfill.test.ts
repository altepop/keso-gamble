import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
import {backfillVdkRoundEvents,resumeVdkRoundBackfill,ROUND_BACKFILL_SWITCH} from '../src/round-backfill.ts';
import type {Match} from '../src/results.ts';

const start=Date.parse('2026-11-12T05:00:00Z'),end=start+1200000,now=Date.parse('2026-11-16T12:00:00Z');
function match(id='match-one'):Match{
 return {
  metadata:{match_id:id,is_completed:true,started_at:new Date(start).toISOString(),game_length_in_ms:1200000,queue:{id:'competitive'}},
  players:Array.from({length:10},(_,i)=>({puuid:i===0?'vdk-puuid':'p'+i,team_id:i<5?'Blue':'Red'})),
  teams:[{team_id:'Blue',won:false,rounds:{won:10}},{team_id:'Red',won:true,rounds:{won:13}}],
  rounds:[{id:1,winning_team:'Blue'}],
  kills:[{round:1,time_in_round_in_ms:1800,killer:{puuid:'vdk-puuid'},victim:{puuid:'p5'}}]
 };
}
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE tracked_players(riot_id TEXT PRIMARY KEY,puuid TEXT,region TEXT,since INTEGER);
 CREATE TABLE monitor_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE valorant_match_rosters(match_id TEXT PRIMARY KEY,ended_at INTEGER,map TEXT,act_name TEXT,teams_json TEXT,players_json TEXT,recorded_at INTEGER);
 CREATE TABLE kp_events(id TEXT);
 CREATE TABLE notifications(id TEXT);`);
 sql.exec(readFileSync(new NodeURL('../migrations/0007_competitive_round_events.sql',import.meta.url),'utf8'));
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Dolly#SDGs','vdk-puuid','ap',0);
 sql.prepare('INSERT INTO valorant_match_rosters VALUES(?,?,?,?,?,?,?)').run('match-one',end,'Corrode','e11a6','[]',JSON.stringify([{puuid:'vdk-puuid',name:'Dolly',tag:'SDGs'}]),now);
 const db={prepare:(query:string)=>{
   const prepare=(args:unknown[])=>({
     first:async()=>sql.prepare(query).get(...args as never[])??null,
     run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args as never[]).changes)}})
   });
   return {bind:(...args:unknown[])=>prepare(args),...prepare([])};
 }} as unknown as D1Database;
 const enable=()=>sql.prepare('INSERT INTO monitor_state VALUES(?,?)').run(ROUND_BACKFILL_SWITCH,'Dolly#SDGs');
 const count=(name:string)=>Number((sql.prepare('SELECT COUNT(*) AS n FROM '+name).get() as {n:number}).n);
 return {sql,db,enable,count,close:()=>sql.close()};
}
test('off by default: no Henrik requests and no KP/notification writes',async()=>{
 const f=fixture();try{
  assert.equal((await backfillVdkRoundEvents(f.db,async()=>{throw Error('must not fetch')},now)).status,'disabled');
  assert.equal(f.count('valorant_match_round_events'),0);
  assert.equal(f.count('kp_events'),0);
  assert.equal(f.count('notifications'),0);
 }finally{f.close()}
});
test('opt in: backfills only known VDK match and completes without duplicates',async()=>{
 const f=fixture();try{
  f.enable();let requests=0;
  const fetch=async(region:string,id:string)=>{requests++;assert.equal(region,'ap');assert.equal(id,'match-one');return match(id)};
  assert.equal((await backfillVdkRoundEvents(f.db,fetch,now)).status,'saved');
  assert.equal((await backfillVdkRoundEvents(f.db,fetch,now)).status,'complete');
  // Historic compatibility pass, then the one-shot final retry scan, before
  // the switch is sealed. Neither pass should call Henrik for complete rows.
  assert.equal((await backfillVdkRoundEvents(f.db,fetch,now)).status,'complete');
  assert.equal((await backfillVdkRoundEvents(f.db,fetch,now)).status,'complete');
  assert.equal((await backfillVdkRoundEvents(f.db,fetch,now)).status,'disabled');
  assert.equal(requests,1);
  assert.equal(f.count('valorant_match_round_events'),1);
  assert.equal(f.count('kp_events'),0);assert.equal(f.count('notifications'),0);
 }finally{f.close()}
});
test('404 and absent round data are marked unavailable instead of granting anything',async()=>{
 const f=fixture();try{
  f.enable();
  assert.equal((await backfillVdkRoundEvents(f.db,async():Promise<Match>=>{throw Error('Match API HTTP 404')},now)).status,'unavailable');
  assert.equal((await backfillVdkRoundEvents(f.db,async()=>match(),now)).status,'complete');
  assert.equal(f.count('valorant_match_round_events'),0);
 }finally{f.close()}
});
test('invalid replay identity and API 429 are deferred, never written',async()=>{
 const f=fixture();try{
  f.enable();
  assert.equal((await backfillVdkRoundEvents(f.db,async()=>match('other-match'),now)).status,'deferred');
  assert.equal((await backfillVdkRoundEvents(f.db,async()=>match('match-one'),now+60_000)).status,'deferred');
  assert.equal(f.count('valorant_match_round_events'),0);
 }finally{f.close()}
});

test('already saved partial archive is fetched again and repaired without duplicate rows',async()=>{
 const f=fixture();try{
  f.enable();
  const partial=match();delete partial.kills;
  f.sql.prepare('INSERT INTO valorant_match_round_events VALUES(?,?,?,?)')
    .run('match-one',JSON.stringify([{r:1,winner:'Blue'}]),null,now-3600000);
  let requests=0;
  const fetch=async()=>{requests++;return match()};
  assert.equal((await backfillVdkRoundEvents(f.db,fetch,now)).status,'saved');
  assert.equal(requests,1);
  const stored=f.sql.prepare('SELECT rounds_json,kills_json FROM valorant_match_round_events WHERE match_id=?')
    .get('match-one') as {rounds_json:string;kills_json:string};
  assert.equal(JSON.parse(stored.rounds_json)[0].winner,'Blue','existing observed rounds preserved');
  assert.equal(JSON.parse(stored.kills_json).length,1,'missing kill array is filled');
  assert.equal(f.count('valorant_match_round_events'),1);
  assert.equal((await backfillVdkRoundEvents(f.db,fetch,now)).status,'complete');
  assert.equal(requests,1);
 }finally{f.close()}
});
test('unrecoverable partial kill timelines are identified and not refetched forever',async()=>{
 const f=fixture();try{
  f.enable();
  const partial=match();delete partial.kills;
  let requests=0;
  const fetch=async()=>{requests++;return partial};
  assert.equal((await backfillVdkRoundEvents(f.db,fetch,now)).status,'saved');
  const archive=f.sql.prepare('SELECT rounds_json,kills_json FROM valorant_match_round_events').get() as
    {rounds_json:string;kills_json:string|null};
  assert.ok(archive.rounds_json);
  assert.equal(archive.kills_json,null);
  const flag=f.sql.prepare("SELECT value FROM monitor_state WHERE key='coach_round_backfill:unavailable:match-one'")
   .get() as {value:string};
  assert.equal(flag.value,'missing_kills');
  assert.equal((await backfillVdkRoundEvents(f.db,fetch,now)).status,'complete');
  assert.equal(requests,1,'partial unsupported upstream data is not polled indefinitely');
 }finally{f.close()}
});

test('historically complete opt-in repairs old partial rows once but never fetches new matches',async()=>{
 const f=fixture();try{
  f.sql.prepare('INSERT INTO monitor_state VALUES(?,?)').run(ROUND_BACKFILL_SWITCH,'complete');
  const before=match();delete before.kills;
  f.sql.prepare('INSERT INTO valorant_match_round_events VALUES(?,?,?,?)')
   .run('match-one',JSON.stringify([{r:1,winner:'Blue'}]),null,now-86400000);
  let fetched=0;
  const fetch=async()=>{fetched++;return match()};
  assert.equal((await backfillVdkRoundEvents(f.db,fetch,now)).status,'saved');
  assert.equal((await backfillVdkRoundEvents(f.db,fetch,now)).status,'complete');
  assert.equal((await backfillVdkRoundEvents(f.db,fetch,now)).status,'complete');
  assert.equal((await backfillVdkRoundEvents(f.db,fetch,now)).status,'disabled');
  assert.equal(fetched,1);
  const switchRow=f.sql.prepare('SELECT value FROM monitor_state WHERE key=?')
    .get(ROUND_BACKFILL_SWITCH) as {value:string};
  assert.equal(switchRow.value,'rechecked','the one-shot scan is sealed after old partial records are repaired');
  assert.equal(f.count('valorant_match_round_events'),1);
 }finally{f.close()}
});
test('old completed opt-in does not fetch unarchived matches',async()=>{
 const f=fixture();try{
  f.sql.prepare('INSERT INTO monitor_state VALUES(?,?)').run(ROUND_BACKFILL_SWITCH,'complete');
  let fetched=0;
  assert.equal((await backfillVdkRoundEvents(f.db,async()=>{fetched++;return match()},now)).status,'complete');
  assert.equal(fetched,0);
  assert.equal((f.sql.prepare('SELECT value FROM monitor_state WHERE key=?')
    .get(ROUND_BACKFILL_SWITCH) as {value:string}).value,'repaired');
 }finally{f.close()}
});

test('historical alias is not skipped when current tracked PUUID differs',async()=>{
 const f=fixture();try{
  f.enable();
  // Previously this caused "complete" while the archived match remained absent.
  f.sql.prepare("UPDATE tracked_players SET puuid=? WHERE riot_id='Dolly#SDGs'")
    .run('different-current-puuid');
  let fetched=0;
  const r=await backfillVdkRoundEvents(f.db,async(region,id)=>{
    fetched++;
    assert.equal(region,'ap');
    assert.equal(id,'match-one');
    return match(id);
  },now);
  assert.equal(r.status,'saved');
  assert.equal(fetched,1);
  assert.equal(f.count('valorant_match_round_events'),1);
  assert.equal(f.count('kp_events'),0);
  assert.equal(f.count('notifications'),0);
 }finally{f.close()}
});

test('resume requires a previously opted-in completion; never starts a fresh task',async()=>{
 const f=fixture();try{
  assert.equal(await resumeVdkRoundBackfill(f.db),'not_opted_in');
  assert.equal(f.count('monitor_state'),0);
  f.sql.prepare('INSERT INTO monitor_state VALUES(?,?)')
    .run(ROUND_BACKFILL_SWITCH,'unrelated');
  assert.equal(await resumeVdkRoundBackfill(f.db),'not_opted_in');
  assert.equal((f.sql.prepare('SELECT value FROM monitor_state WHERE key=?')
    .get(ROUND_BACKFILL_SWITCH) as {value:string}).value,'unrelated');
  f.sql.prepare("UPDATE monitor_state SET value='repaired' WHERE key=?")
    .run(ROUND_BACKFILL_SWITCH);
  assert.equal(await resumeVdkRoundBackfill(f.db),'resumed');
  assert.equal(await resumeVdkRoundBackfill(f.db),'already_running');
  assert.equal((await backfillVdkRoundEvents(f.db,async()=>match(),now)).status,'saved');
  assert.equal(f.count('kp_events'),0);
  assert.equal(f.count('notifications'),0);
 }finally{f.close()}
});

test('previously authorized missing-kills record receives one final retry and clears stale unavailable marker',async()=>{
 const f=fixture();try{
  f.sql.prepare('INSERT INTO monitor_state VALUES(?,?)').run(ROUND_BACKFILL_SWITCH,'repaired');
  f.sql.prepare('INSERT INTO monitor_state VALUES(?,?)')
   .run('coach_round_backfill:unavailable:match-one','missing_kills');
  f.sql.prepare('INSERT INTO valorant_match_round_events VALUES(?,?,?,?)')
   .run('match-one',JSON.stringify([{r:1,winner:'Blue'}]),null,now-1000000);
  let fetchCount=0;
  assert.equal((await backfillVdkRoundEvents(f.db,async()=>{fetchCount++;return match()},now)).status,'saved');
  assert.equal(fetchCount,1);
  const record=f.sql.prepare('SELECT rounds_json,kills_json FROM valorant_match_round_events').get() as
   {rounds_json:string;kills_json:string};
  assert.equal(JSON.parse(record.kills_json).length,1);
  assert.equal(JSON.parse(record.rounds_json)[0].winner,'Blue','existing rounds unchanged');
  assert.equal((f.sql.prepare("SELECT COUNT(*) AS n FROM monitor_state WHERE key='coach_round_backfill:unavailable:match-one'").get() as {n:number}).n,0);
  assert.equal((await backfillVdkRoundEvents(f.db,async()=>{throw Error('no second fetch')},now)).status,'complete');
  assert.equal((f.sql.prepare('SELECT value FROM monitor_state WHERE key=?')
   .get(ROUND_BACKFILL_SWITCH) as {value:string}).value,'rechecked');
  assert.equal((await backfillVdkRoundEvents(f.db,async()=>{throw Error('disabled')},now)).status,'disabled');
  assert.equal(f.count('kp_events'),0);
  assert.equal(f.count('notifications'),0);
 }finally{f.close()}
});

test('one-time retry stops even when Henrik still omits kills',async()=>{
 const f=fixture();try{
  f.sql.prepare('INSERT INTO monitor_state VALUES(?,?)').run(ROUND_BACKFILL_SWITCH,'repaired');
  f.sql.prepare('INSERT INTO monitor_state VALUES(?,?)')
   .run('coach_round_backfill:unavailable:match-one','missing_kills');
  f.sql.prepare('INSERT INTO valorant_match_round_events VALUES(?,?,?,?)')
   .run('match-one',JSON.stringify([{r:1,winner:'Blue'}]),null,now-1000000);
  let fetchCount=0;
  const incomplete=match();delete incomplete.kills;
  assert.equal((await backfillVdkRoundEvents(f.db,async()=>{fetchCount++;return incomplete},now)).status,'unavailable');
  assert.equal((await backfillVdkRoundEvents(f.db,async()=>{fetchCount++;return match()},now)).status,'complete');
  assert.equal(fetchCount,1,'retry_once marker prevents unbounded re-fetches');
  assert.equal((await backfillVdkRoundEvents(f.db,async()=>{throw Error('disabled')},now)).status,'disabled');
  const flag=f.sql.prepare("SELECT value FROM monitor_state WHERE key='coach_round_backfill:unavailable:match-one'")
   .get() as {value:string};
  assert.equal(flag.value,'missing_kills');
  assert.equal(f.count('kp_events'),0);
  assert.equal(f.count('notifications'),0);
 }finally{f.close()}
});

test('post-complete retry never revives old 404 or a wholly absent archive',async()=>{
 const f=fixture();try{
  f.sql.prepare('INSERT INTO monitor_state VALUES(?,?)').run(ROUND_BACKFILL_SWITCH,'repaired');
  f.sql.prepare('INSERT INTO monitor_state VALUES(?,?)')
   .run('coach_round_backfill:unavailable:match-one','404');
  f.sql.prepare('INSERT INTO valorant_match_round_events VALUES(?,?,?,?)')
   .run('match-one',JSON.stringify([{r:1,winner:'Blue'}]),null,now-1000000);
  assert.equal((await backfillVdkRoundEvents(f.db,async()=>{throw Error('must not fetch')},now)).status,'complete');
  assert.equal(f.count('valorant_match_round_events'),1);
  assert.equal((await backfillVdkRoundEvents(f.db,async()=>{throw Error('must not fetch')},now)).status,'disabled');
 }finally{f.close()}
});


test('overlapping Cron invocations cannot fetch the same one-shot missing-kills record twice',async()=>{
 const f=fixture();try{
  f.sql.prepare('INSERT INTO monitor_state VALUES(?,?)').run(ROUND_BACKFILL_SWITCH,'repaired');
  f.sql.prepare('INSERT INTO monitor_state VALUES(?,?)')
   .run('coach_round_backfill:unavailable:match-one','missing_kills');
  f.sql.prepare('INSERT INTO valorant_match_round_events VALUES(?,?,?,?)')
   .run('match-one',JSON.stringify([{r:1,winner:'Blue'}]),null,now-1000000);
  let entered!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve});
  const gate=new Promise<void>(resolve=>{release=resolve});
  let calls=0;
  const fetch=async()=>{calls++;entered();await gate;return match()};
  const first=backfillVdkRoundEvents(f.db,fetch,now);
  await started;
  const second=await backfillVdkRoundEvents(f.db,fetch,now);
  release();
  assert.equal(second.status,'complete');
  assert.equal((await first).status,'saved');
  assert.equal(calls,1,'parallel Cron ticks must not double-fetch Henrik');
  assert.equal((f.sql.prepare("SELECT COUNT(*) AS n FROM monitor_state WHERE key='coach_round_backfill:retry_once:match-one'")
   .get() as {n:number}).n,1);
  assert.equal(f.count('kp_events'),0);
  assert.equal(f.count('notifications'),0);
 }finally{f.close()}
});
