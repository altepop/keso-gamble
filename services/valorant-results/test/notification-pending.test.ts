import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {pendingNotificationMatches,REGULAR_PENDING_SQL,CLAIMED_DEATH_PENDING_SQL} from '../src/notification-pending.ts';
import {ensureNotificationReadIndexes} from '../src/notification-indexes.ts';
test('D1 pending scan uses partial indexes and ignores hundreds of unclaimed deaths',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE notifications(riot_id TEXT NOT NULL,match_id TEXT NOT NULL,ended_at INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0,mode TEXT,outcome TEXT, PRIMARY KEY(riot_id,match_id));
 CREATE TABLE death_unrated_sessions(riot_id TEXT NOT NULL,match_id TEXT NOT NULL,cancelled_at INTEGER,PRIMARY KEY(riot_id,match_id));`);
 const db={prepare:(query:string)=>({
   run:()=>sql.exec(query),
   bind:(...args:unknown[])=>({all:async()=>({results:sql.prepare(query).all(...args as never[])})})
  }),batch:async(q:Array<{run:()=>unknown}>)=>{for(const s of q)s.run();return []}} as unknown as D1Database;
 await ensureNotificationReadIndexes(db);
 const add=sql.prepare('INSERT INTO notifications(riot_id,match_id,ended_at,sent,mode) VALUES(?,?,?,?,?)');
 for(let n=0;n<800;n++)add.run('held'+n,'held'+n,n,0,'death_unrated');
 add.run('normal','same',900,0,'competitive');
 add.run('unclaimed','unclaimed',901,0,'unrated');
 add.run('claimed','same',850,0,'death_unrated');
 add.run('ready','claimed-only',800,0,'unrated');
 assert.deepEqual((await pendingNotificationMatches(db)).map(x=>x.match_id),['same']);
 const plan=(q:string)=>sql.prepare('EXPLAIN QUERY PLAN '+q).all(10).map(x=>String(x.detail)).join(' ');
 assert.match(plan(REGULAR_PENDING_SQL),/notifications_pending_regular/);
 assert.match(plan(CLAIMED_DEATH_PENDING_SQL),/death_sessions_active_notice/);
 sql.prepare('INSERT INTO death_unrated_sessions VALUES(?,?,NULL)').run('claimed','same');
 sql.prepare('INSERT INTO death_unrated_sessions VALUES(?,?,NULL)').run('ready','claimed-only');
 assert.deepEqual((await pendingNotificationMatches(db)).map(x=>[x.match_id,x.ended_at]),[['claimed-only',800],['same',850]]);
 sql.prepare('UPDATE death_unrated_sessions SET cancelled_at=1 WHERE riot_id=?').run('ready');
 assert.deepEqual((await pendingNotificationMatches(db)).map(x=>x.match_id),['same']);
 assert.equal((sql.prepare('SELECT count(*) AS n FROM notifications WHERE sent=0').get() as {n:number}).n,804);
 sql.close();
});

test('orphan Death notifications do not repeatedly trigger Discord backoff or network work each Cron',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE notifications(riot_id TEXT NOT NULL,match_id TEXT NOT NULL,ended_at INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0,mode TEXT,outcome TEXT,PRIMARY KEY(riot_id,match_id));
 CREATE TABLE death_unrated_sessions(riot_id TEXT NOT NULL,match_id TEXT NOT NULL,cancelled_at INTEGER,PRIMARY KEY(riot_id,match_id));`);
 const insert=sql.prepare('INSERT INTO notifications(riot_id,match_id,ended_at,sent,mode) VALUES(?,?,?,?,?)');
 for(let i=0;i<750;i++)insert.run('riot-'+i,'unclaimed-'+i,100+i,0,'death_unrated');
 let scannedState=0;
 const db={prepare:(query:string)=>({
  run:()=>sql.exec(query),
  bind:(...params:unknown[])=>({all:async()=>({results:sql.prepare(query).all(...params as never[])})}),
  first:async()=>{if(query.includes('monitor_state')){scannedState++;throw Error('unnecessary monitor_state access');}return sql.prepare(query).get()??null;},
 }),batch:async(queries:Array<{run:()=>unknown}>)=>{for(const q of queries)q.run();return []}} as unknown as D1Database;
 const {flushNotifications}=await import('../src/index.ts');
 const env={DB:db,DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/test'} as import('../src/index.ts').Env;
 const previous=globalThis.fetch;
 let requests=0;
 globalThis.fetch=(async()=>{requests++;throw Error('no Discord call without claim');}) as typeof fetch;
 try{
  for(let i=0;i<3;i++)await flushNotifications(env,[]);
  assert.equal(scannedState,0,'skip state lookup for permanently unclaimed Death notices');
  assert.equal(requests,0,'no webhook call without claim');
  assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM notifications WHERE sent=0').get() as {n:number}).n,750,'unsent notices are not discarded');
 }finally{globalThis.fetch=previous;sql.close();}
});
