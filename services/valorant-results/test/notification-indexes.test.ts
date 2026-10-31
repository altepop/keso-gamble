import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {ensureNotificationReadIndexes} from '../src/notification-indexes.ts';

test('D1 notification queue and racing match scans use indexes without dropping notices',async()=>{
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())
  sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);
 const add=sql.prepare('INSERT INTO notifications(riot_id,match_id,message,ended_at,sent,mode,outcome) VALUES(?,?,?,?,?,?,?)');
 for(let i=0;i<250;i++)add.run('One#JP1','match-'+i,'ok',i,i<245?1:0,'competitive',i%2?'win':'loss');
 let calls=0;
 const db={prepare:(query:string)=>({run:()=>{calls++;sql.exec(query);return {meta:{changes:0}};}}),
  batch:async(items:Array<{run:()=>unknown}>)=>{for(const item of items)item.run();return [];}} as unknown as D1Database;
 await ensureNotificationReadIndexes(db);
 await ensureNotificationReadIndexes(db);
 assert.equal(calls,3,'avoid repeating CREATE INDEX on every poll within an isolate');
 const explain=(q:string,...args:unknown[])=>sql.prepare('EXPLAIN QUERY PLAN '+q).all(...args as never[]).map(x=>String(x.detail)).join('; ');
 const queue='SELECT 1 AS n FROM notifications WHERE sent=0 LIMIT 1';
 const rank='SELECT match_id,outcome,ended_at FROM notifications WHERE riot_id=? AND outcome IN (\'win\',\'loss\') ORDER BY ended_at DESC,match_id DESC LIMIT 40';
 assert.match(explain(queue),/notifications_pending_match/);
 assert.match(explain(rank,'One#JP1'),/notifications_crown_history/);
 assert.doesNotMatch(explain(rank,'One#JP1'),/USE TEMP B-TREE/);
 const members="SELECT * FROM notifications WHERE match_id=? AND (outcome IS NULL OR outcome!='draw' OR mode!='escalation') ORDER BY riot_id";
 assert.match(explain(members,'match-249'),/notifications_match_members/);
 assert.doesNotMatch(explain(members,'match-249'),/USE TEMP B-TREE/);
 assert.equal(sql.prepare(members).all('match-249').length,1);
 const before=sql.prepare('SELECT COUNT(*) AS c FROM notifications').get() as {c:number};
 assert.equal(before.c,250);
 assert.equal((sql.prepare(queue).get() as {n:number}).n,1);
 assert.equal((sql.prepare(rank).all('One#JP1') as Array<{ended_at:number}>)[0].ended_at,249);
});
