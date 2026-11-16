import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
import {backfillRecordedVdkMatches,ROSTER_BACKFILL_SWITCH} from '../src/roster-backfill.ts';
import type {Match} from '../src/results.ts';

const start=Date.parse('2026-11-12T05:00:00Z');
const end=start+20*60_000;
function detail(id='match-one'):Match{
 return {metadata:{match_id:id,is_completed:true,started_at:new Date(start).toISOString(),game_length_in_ms:20*60_000,
  queue:{id:'competitive'},map:{name:'Corrode'},season:{short:'V26:A6'}},
  players:Array.from({length:10},(_,i)=>({puuid:'p'+i,team_id:i<5?'red':'blue',
   name:i===3?'Abema':'Other'+i,tag:i===3?'ttv':'JP1',party_id:i<4?'party1':null,
   agent:{name:'Clove'},stats:{kills:i,deaths:4,assists:2,score:100+i}})),
  teams:[{team_id:'red',won:true,rounds:{won:13}},{team_id:'blue',won:false,rounds:{won:8}}]};
}
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE tracked_players(riot_id TEXT PRIMARY KEY,puuid TEXT,region TEXT,since INTEGER);
  CREATE TABLE notifications(riot_id TEXT,match_id TEXT,mode TEXT,ended_at INTEGER);
  CREATE TABLE monitor_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE kp_events(id TEXT);
  CREATE TABLE discord_posts(id TEXT);`);
 sql.exec(readFileSync(new NodeURL('../migrations/0006_competitive_match_rosters.sql',import.meta.url),'utf8'));
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Dolly#SDGs','vdk-puuid','ap',0);
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('mecael#2489','kobayashi-puuid','ap',0);
 sql.prepare('INSERT INTO notifications VALUES(?,?,?,?)').run('Dolly#SDGs','match-one','competitive',end);
 const db={prepare:(statement:string)=>{
   const make=(args:unknown[])=>({
     first:async()=>sql.prepare(statement).get(...args as never[])??null,
     all:async()=>({results:sql.prepare(statement).all(...args as never[])}),
     run:async()=>({meta:{changes:Number(sql.prepare(statement).run(...args as never[]).changes)}}),
   });
   return {...make([]),bind:(...args:unknown[])=>make(args)};
 }} as unknown as D1Database;
 const enable=()=>sql.prepare('INSERT INTO monitor_state(key,value) VALUES(?,?)').run(ROSTER_BACKFILL_SWITCH,'Dolly#SDGs');
 const count=(table:string)=>Number((sql.prepare('SELECT COUNT(*) AS n FROM '+table).get() as {n:number}).n);
 return {sql,db,enable,count,close:()=>sql.close()};
}
const now=Date.parse('2026-11-16T12:00:00Z');
test('disabled by default: never fetches, pays KP, or posts Discord',async()=>{
 const f=fixture();try{
  const x=await backfillRecordedVdkMatches(f.db,async()=>{throw Error('API called')},now);
  assert.equal(x.status,'disabled');
  assert.equal(f.count('valorant_match_rosters'),0);
  assert.equal(f.count('kp_events'),0);
  assert.equal(f.count('discord_posts'),0);
 }finally{f.close();}
});
test('enabled: archives exactly one known match, including silent Abema, without notices or KP',async()=>{
 const f=fixture();try{
  f.enable();let calls=0;
  const fetch=async(region:string,id:string)=>{calls++;assert.equal(region,'ap');assert.equal(id,'match-one');return detail(id)};
  const result=await backfillRecordedVdkMatches(f.db,fetch,now);
  assert.equal(result.status,'saved');assert.equal(calls,1);
  const stored=f.sql.prepare('SELECT players_json FROM valorant_match_rosters').get() as {players_json:string};
  const roster=JSON.parse(stored.players_json);
  assert.equal(roster.length,10);assert.equal(roster[3].name,'Abema');assert.equal(roster[3].tag,'ttv');
  assert.equal(f.count('notifications'),1);assert.equal(f.count('kp_events'),0);assert.equal(f.count('discord_posts'),0);
  assert.equal((await backfillRecordedVdkMatches(f.db,fetch,now)).status,'complete');
  assert.equal(calls,1);
  assert.equal((await backfillRecordedVdkMatches(f.db,fetch,now)).status,'disabled');
 }finally{f.close();}
});
test('404 is marked unavailable, not interpreted as player absence, and never loops',async()=>{
 const f=fixture();try{
  f.enable();let calls=0;
  const fetch=async(_region:string,_id:string):Promise<Match>=>{calls++;throw Error('Match API HTTP 404')};
  assert.equal((await backfillRecordedVdkMatches(f.db,fetch,now)).status,'unavailable');
  assert.equal((await backfillRecordedVdkMatches(f.db,fetch,now)).status,'complete');
  assert.equal(calls,1);assert.equal(f.count('valorant_match_rosters'),0);
 }finally{f.close();}
});
test('API failure defers and preserves the historical notification with no new KP',async()=>{
 const f=fixture();try{
  f.enable();let calls=0;
  const fetch=async(_r:string,_id:string):Promise<Match>=>{calls++;throw Error('Match API HTTP 429')};
  assert.equal((await backfillRecordedVdkMatches(f.db,fetch,now)).status,'deferred');
  assert.equal((await backfillRecordedVdkMatches(f.db,fetch,now+60_000)).status,'deferred');
  assert.equal(calls,1);
  assert.equal(f.count('notifications'),1);assert.equal(f.count('kp_events'),0);
 }finally{f.close();}
});
test('mismatched match ID or timing is never archived',async()=>{
 const f=fixture();try{
  f.enable();
  assert.equal((await backfillRecordedVdkMatches(f.db,async()=>detail('wrong'),now)).status,'deferred');
  assert.equal(f.count('valorant_match_rosters'),0);
 }finally{f.close();}
});

