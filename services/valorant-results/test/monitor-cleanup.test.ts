import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {cleanupMonitorData,MONITOR_CLEANUP_INTERVAL_MS as PERIOD} from '../src/monitor-cleanup.ts';

function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE tracked_players(riot_id TEXT PRIMARY KEY);
 CREATE TABLE death_unrated_sessions(riot_id TEXT NOT NULL,match_id TEXT NOT NULL, PRIMARY KEY(riot_id,match_id));
 CREATE TABLE discord_command_receipts(interaction_id TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);`);
 const queries:string[]=[];
 let failDeath=false;
 const DB={prepare:(q:string)=>({
  bind:(...args:unknown[])=>({run:async()=>{queries.push(q);if(failDeath&&q.startsWith('DELETE FROM death_unrated_sessions'))throw Error('D1 outage');
   return sql.prepare(q).run(...args as never[]);}}),
 })} as unknown as D1Database;
 return {sql,DB,queries,failDeath:(v:boolean)=>{failDeath=v;}};
}
test('D1 housekeeping scans are limited to one per 15 min with immediate roster invalidation',async()=>{
 const f=fixture();f.sql.prepare('INSERT INTO tracked_players VALUES(?)').run('keep');
 f.sql.prepare('INSERT INTO tracked_players VALUES(?)').run('gone');
 f.sql.prepare('INSERT INTO death_unrated_sessions VALUES(?,?)').run('gone','old');
 f.sql.prepare('INSERT INTO discord_command_receipts VALUES(?,?)').run('expired',100);
 f.sql.prepare('INSERT INTO discord_command_receipts VALUES(?,?)').run('new',900_000);
 await cleanupMonitorData(f.DB,['keep'],200);
 assert.equal(f.queries.length,3);
 assert.equal((f.sql.prepare('SELECT COUNT(*) AS n FROM tracked_players').get() as {n:number}).n,1);
 assert.equal((f.sql.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').get() as {n:number}).n,0);
 assert.equal((f.sql.prepare('SELECT COUNT(*) AS n FROM discord_command_receipts').get() as {n:number}).n,1);
 // Quiet one-minute ticks produce no DELETE, despite repeated monitoring.
 for(let n=1;n<=14;n++)await cleanupMonitorData(f.DB,['keep'],200+n*60_000);
 assert.equal(f.queries.length,3);
 // Changing monitored members invalidates the roster cache even during TTL.
 f.sql.prepare('INSERT INTO tracked_players VALUES(?)').run('another');
 await cleanupMonitorData(f.DB,['keep','another'],200+14*60_000+100);
 assert.equal(f.queries.length,5,'two roster sweeps, no redundant receipt sweep');
 await cleanupMonitorData(f.DB,['keep','another'],200+PERIOD+5);
 assert.equal(f.queries.length,6,'receipt sweep runs once when due');
 f.sql.close();
});
test('D1 cleanup does not cache failures and next cron retries safely',async()=>{
 const f=fixture();f.sql.prepare('INSERT INTO tracked_players VALUES(?)').run('keep');
 f.failDeath(true);
 await assert.rejects(cleanupMonitorData(f.DB,['keep'],100),/D1 outage/);
 f.failDeath(false);
 await cleanupMonitorData(f.DB,['keep'],101);
 assert.equal(f.queries.length,5,'failed roster cleanup is retried before receipt sweep');
 f.sql.close();
});
test('empty configuration removes stale roster and handles new DB bindings independently',async()=>{
 const one=fixture();one.sql.prepare('INSERT INTO tracked_players VALUES(?)').run('stale');
 one.sql.prepare('INSERT INTO death_unrated_sessions VALUES(?,?)').run('stale','old');
 await cleanupMonitorData(one.DB,[],99);
 assert.equal((one.sql.prepare('SELECT COUNT(*) AS n FROM tracked_players').get() as {n:number}).n,0);
 assert.equal((one.sql.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').get() as {n:number}).n,0);
 const two=fixture();await cleanupMonitorData(two.DB,['keep'],99);assert.equal(two.queries.length,3);
 one.sql.close();two.sql.close();
});
