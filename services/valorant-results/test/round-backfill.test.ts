import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
import {backfillVdkRoundEvents,ROUND_BACKFILL_SWITCH} from '../src/round-backfill.ts';
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
