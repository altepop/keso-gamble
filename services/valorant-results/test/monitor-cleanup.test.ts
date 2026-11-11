import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {cleanupMonitorData,MONITOR_CLEANUP_INTERVAL_MS as PERIOD,MONITOR_CLEANUP_KEY} from '../src/monitor-cleanup.ts';

function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE tracked_players(riot_id TEXT PRIMARY KEY);
 CREATE TABLE death_unrated_sessions(riot_id TEXT NOT NULL,match_id TEXT NOT NULL, PRIMARY KEY(riot_id,match_id));
 CREATE TABLE discord_command_receipts(interaction_id TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
 CREATE TABLE monitor_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
 const queries:string[]=[];
 let failDeath=false;
 // Each wrapper is a different Cloudflare isolate with the same durable D1.
 const binding=()=>({prepare:(q:string)=>({
  bind:(...args:unknown[])=>({
   first:async()=>{queries.push(q);return sql.prepare(q).get(...args as never[]);},
   run:async()=>{queries.push(q);if(failDeath&&q.startsWith('DELETE FROM death_unrated_sessions'))throw Error('D1 outage');
    return sql.prepare(q).run(...args as never[]);}
  }),
 })} as unknown as D1Database);
 const counts=()=>queries.filter(q=>q.startsWith('DELETE FROM')).length;
 const marker=()=>sql.prepare('SELECT value FROM monitor_state WHERE key=?').get(MONITOR_CLEANUP_KEY) as {value:string}|undefined;
 return {sql,DB:binding(),newIsolate:binding,queries,counts,marker,failDeath:(v:boolean)=>{failDeath=v;}};
}
test('one 15-minute cleanup window is shared across 20 fresh Worker isolates',async()=>{
 const f=fixture();f.sql.prepare('INSERT INTO tracked_players VALUES(?)').run('keep');
 f.sql.prepare('INSERT INTO tracked_players VALUES(?)').run('gone');
 f.sql.prepare('INSERT INTO death_unrated_sessions VALUES(?,?)').run('gone','old');
 f.sql.prepare('INSERT INTO discord_command_receipts VALUES(?,?)').run('expired',100);
 f.sql.prepare('INSERT INTO discord_command_receipts VALUES(?,?)').run('new',900_000);
 await cleanupMonitorData(f.DB,['keep'],200);
 assert.equal(f.counts(),3);
 assert.equal((f.sql.prepare('SELECT COUNT(*) AS n FROM tracked_players').get() as {n:number}).n,1);
 assert.equal((f.sql.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').get() as {n:number}).n,0);
 assert.equal((f.sql.prepare('SELECT COUNT(*) AS n FROM discord_command_receipts').get() as {n:number}).n,1);
 assert.ok(f.marker(),'successful cleanup is durably recorded');
 for(let n=1;n<=14;n++)await cleanupMonitorData(f.newIsolate(),['keep'],200+n*60_000);
 assert.equal(f.counts(),3,'there must be no more DELETEs even after each isolate is recycled');
 // Roster change is visible immediately to another isolate, not only after TTL.
 f.sql.prepare('INSERT INTO tracked_players VALUES(?)').run('another');
 await cleanupMonitorData(f.newIsolate(),['another','keep'],200+14*60_000+100);
 assert.equal(f.counts(),5,'two immediate roster sweeps, no redundant receipt cleanup');
 await cleanupMonitorData(f.newIsolate(),['another','keep'],200+PERIOD+5);
 assert.equal(f.counts(),6,'receipt sweep is independent from roster sweep');
 f.sql.close();
});
test('D1 errors are not marked successful and retry on the next cron',async()=>{
 const f=fixture();f.sql.prepare('INSERT INTO tracked_players VALUES(?)').run('keep');
 f.failDeath(true);
 await assert.rejects(cleanupMonitorData(f.DB,['keep'],100),/D1 outage/);
 assert.equal(f.marker(),undefined,'no completion marker may be written after partial failure');
 f.failDeath(false);
 await cleanupMonitorData(f.newIsolate(),['keep'],101);
 assert.equal(f.counts(),5,'failed roster cleanup is repeated, then receipt sweep runs');
 assert.ok(f.marker());
 f.sql.close();
});
test('an empty roster cleans stale members and other D1 databases remain independent',async()=>{
 const one=fixture();one.sql.prepare('INSERT INTO tracked_players VALUES(?)').run('stale');
 one.sql.prepare('INSERT INTO death_unrated_sessions VALUES(?,?)').run('stale','old');
 await cleanupMonitorData(one.DB,[],99);
 assert.equal((one.sql.prepare('SELECT COUNT(*) AS n FROM tracked_players').get() as {n:number}).n,0);
 assert.equal((one.sql.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').get() as {n:number}).n,0);
 const two=fixture();await cleanupMonitorData(two.DB,['keep'],99);assert.equal(two.counts(),3);
 one.sql.close();two.sql.close();
});
test('invalid marker or backward clock recovers without silently omitting cleanup',async()=>{
 const f=fixture();
 f.sql.prepare('INSERT INTO monitor_state VALUES(?,?)').run(MONITOR_CLEANUP_KEY,'not json');
 await cleanupMonitorData(f.DB,['keep'],PERIOD*2);
 assert.equal(f.counts(),3);
 await cleanupMonitorData(f.newIsolate(),['keep'],PERIOD);
 assert.equal(f.counts(),6,'rewinding clock must trigger fresh cleanup');
 f.sql.close();
});
