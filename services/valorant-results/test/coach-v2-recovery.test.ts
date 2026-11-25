import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
import {recoverVdkV2Kills,verifiedLegacyV2Kills,type LegacyV2} from '../src/coach-v2-recovery.ts';

const start=Date.parse('2026-11-16T12:00:00Z');
const end=start+1200000,now=Date.parse('2026-11-17T00:00:00Z');
const players=Array.from({length:10},(_,i)=>({
 puuid:'uuid'+i,team_id:i<5?'Blue':'Red',name:i===0?'Dolly':'Other',tag:i===0?'SDGs':'x'
}));
const good=():LegacyV2=>({
 metadata:{matchid:'match-one',game_start:start/1000,game_length:1200,queue:'competitive'},
 players:{all_players:players.map(p=>({puuid:p.puuid,team:p.team_id}))},
 kills:[{round:0,kill_time_in_round:3000,killer_puuid:'uuid0',victim_puuid:'uuid5'}]
});
function fixture(authorized=true){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE monitor_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE valorant_match_rosters(match_id TEXT PRIMARY KEY,ended_at INTEGER,map TEXT,act_name TEXT,teams_json TEXT,players_json TEXT,recorded_at INTEGER);
 CREATE TABLE kp_events(id TEXT);
 CREATE TABLE notifications(id TEXT);`);
 sql.exec(readFileSync(new NodeURL('../migrations/0007_competitive_round_events.sql',import.meta.url),'utf8'));
 sql.prepare('INSERT INTO valorant_match_rosters VALUES(?,?,?,?,?,?,?)')
  .run('match-one',end,'Corrode','e11a6','[]',JSON.stringify(players),now);
 sql.prepare('INSERT INTO valorant_match_round_events VALUES(?,?,?,?)')
  .run('match-one',JSON.stringify([{r:0,winner:'Blue'}]),null,now);
 sql.prepare('INSERT INTO monitor_state VALUES(?,?)')
  .run('coach_round_backfill:enabled','rechecked');
 sql.prepare('INSERT INTO monitor_state VALUES(?,?)')
  .run('coach_round_backfill:unavailable:match-one','missing_kills');
 if(authorized)sql.prepare('INSERT INTO monitor_state VALUES(?,?)')
  .run('coach_round_backfill:retry_once:match-one',String(now-600000));
 const db={prepare:(query:string)=>{
   const q=(args:unknown[])=>({
     first:async()=>sql.prepare(query).get(...args as never[])??null,
     run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args as never[]).changes)}})
   });
   return {bind:(...args:unknown[])=>q(args),...q([])};
 }} as unknown as D1Database;
 const count=(name:string)=>Number((sql.prepare('SELECT COUNT(*) AS n FROM '+name).get() as {n:number}).n);
 return {sql,db,count,close:()=>sql.close()};
}
test('v2 response is verified against stored ID, finish time, all roster members and kill events',()=>{
 const f=fixture();try{
  const row={match_id:'match-one',ended_at:end,players_json:JSON.stringify(players)};
  assert.deepEqual(JSON.parse(verifiedLegacyV2Kills(good(),row)!),[
   {r:0,t:3000,killer:'uuid0',victim:'uuid5'}]);
  const wrongId=good();wrongId.metadata!.matchid='other';
  assert.equal(verifiedLegacyV2Kills(wrongId,row),null);
  const wrongPlayer=good();wrongPlayer.players!.all_players![5].puuid='attacker';
  assert.equal(verifiedLegacyV2Kills(wrongPlayer,row),null);
  const wrongTime=good();wrongTime.metadata!.game_start=start/1000+600;
  assert.equal(verifiedLegacyV2Kills(wrongTime,row),null);
  const invalid=good();invalid.kills![0].victim_puuid='unknown';
  assert.equal(verifiedLegacyV2Kills(invalid,row),null);
  const ms=good();ms.metadata!.game_length=1200000;
  assert.ok(verifiedLegacyV2Kills(ms,row),'millisecond game length supported');
 }finally{f.close()}
});
test('one-shot v2 restores missing kills, keeps recorded rounds unchanged and clears obsolete marker',async()=>{
 const f=fixture();try{
  let calls=0;
  assert.equal(await recoverVdkV2Kills(f.db,async id=>{
   assert.equal(id,'match-one');calls++;return good();
  },now),'saved');
  assert.equal(calls,1);
  const row=f.sql.prepare('SELECT rounds_json,kills_json FROM valorant_match_round_events').get() as
   {rounds_json:string;kills_json:string};
  assert.equal(JSON.parse(row.rounds_json)[0].winner,'Blue');
  assert.equal(JSON.parse(row.kills_json).length,1);
  assert.equal((f.sql.prepare("SELECT COUNT(*) AS n FROM monitor_state WHERE key='coach_round_backfill:unavailable:match-one'")
   .get() as {n:number}).n,0);
  assert.equal(await recoverVdkV2Kills(f.db,async()=>{throw Error('must not retry')},now),'complete');
  assert.equal(f.count('kp_events'),0);
  assert.equal(f.count('notifications'),0);
 }finally{f.close()}
});
test('one-shot invalid v2 payload is not saved or retried',async()=>{
 const f=fixture();try{
  let calls=0;const incorrect=good();incorrect.metadata!.matchid='unrelated';
  assert.equal(await recoverVdkV2Kills(f.db,async()=>{calls++;return incorrect},now),'unavailable');
  assert.equal(await recoverVdkV2Kills(f.db,async()=>{calls++;return good()},now),'complete');
  assert.equal(calls,1);
  const row=f.sql.prepare('SELECT kills_json FROM valorant_match_round_events').get() as {kills_json:string|null};
  assert.equal(row.kills_json,null);
  assert.equal(f.count('kp_events'),0);
  assert.equal(f.count('notifications'),0);
 }finally{f.close()}
});
test('v2 fallback never starts without a prior authorized v4 retry',async()=>{
 const f=fixture(false);try{
  assert.equal(await recoverVdkV2Kills(f.db,async()=>{throw Error('no consent')},now),'complete');
  assert.equal(f.count('monitor_state'),2);
 }finally{f.close()}
});
test('overlapping Cron ticks cannot double-call the v2 API',async()=>{
 const f=fixture();try{
  let entered!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve});
  const gate=new Promise<void>(resolve=>{release=resolve});
  let calls=0;
  const api=async()=>{calls++;entered();await gate;return good()};
  const first=recoverVdkV2Kills(f.db,api,now);
  await started;
  assert.equal(await recoverVdkV2Kills(f.db,api,now),'complete');
  release();
  assert.equal(await first,'saved');
  assert.equal(calls,1);
  assert.equal(f.count('kp_events'),0);
  assert.equal(f.count('notifications'),0);
 }finally{f.close()}
});
