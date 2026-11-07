import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {markDeliveredNotices} from '../src/notification-delivery.ts';

function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE notifications(riot_id TEXT NOT NULL,match_id TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,mode TEXT,outcome TEXT,
  PRIMARY KEY(riot_id,match_id));
 CREATE TABLE death_unrated_sessions(riot_id TEXT NOT NULL,match_id TEXT,
  cancelled_at INTEGER,PRIMARY KEY(riot_id,match_id));`);
 const db={prepare:(query:string)=>({bind:(...args:unknown[])=>({
  run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args as never[]).changes)}})
 })})} as unknown as D1Database;
 return {sql,db};
}
const eligible=`SELECT riot_id FROM notifications WHERE match_id=?
 AND (outcome IS NULL OR outcome!='draw' OR mode!='escalation')
 AND (mode IS NULL OR (mode!='unrated' AND substr(mode,1,6)!='death_')
 OR EXISTS(SELECT 1 FROM death_unrated_sessions s
  WHERE s.riot_id=notifications.riot_id AND s.match_id=notifications.match_id
  AND s.cancelled_at IS NULL)) ORDER BY riot_id`;

test('Discord success acknowledges only recipients actually included in the post',async()=>{
 const {db,sql}=fixture();
 const add=sql.prepare('INSERT INTO notifications VALUES(?,?,?,?,?)');
 add.run('regular','same-match',0,'competitive','win');
 add.run('death','same-match',0,'death_unrated','win');
 add.run('other','another-match',0,'competitive','loss');
 const delivered=sql.prepare(eligible).all('same-match') as Array<{riot_id:string}>;
 assert.deepEqual(delivered.map(r=>r.riot_id),['regular']);
 assert.equal(await markDeliveredNotices(db,'same-match',delivered),1);
 assert.deepEqual(sql.prepare('SELECT riot_id,sent FROM notifications ORDER BY riot_id').all(),
  [{riot_id:'death',sent:0},{riot_id:'other',sent:0},{riot_id:'regular',sent:1}]);
 // A later claim may unlock the held Death-mode notice. It must still be pending.
 sql.prepare('INSERT INTO death_unrated_sessions VALUES(?,?,NULL)').run('death','same-match');
 const recovered=sql.prepare(eligible).all('same-match') as Array<{riot_id:string}>;
 assert.deepEqual(recovered.map(r=>r.riot_id),['death','regular']);
 assert.equal(await markDeliveredNotices(db,'same-match',recovered),1);
 assert.equal(sql.prepare("SELECT sent FROM notifications WHERE riot_id='death'").get()?.sent,1);
 assert.equal(sql.prepare("SELECT sent FROM notifications WHERE riot_id='other'").get()?.sent,0);
});
test('Cannot acknowledge the whole match for an empty or invalid delivery set',async()=>{
 const {db,sql}=fixture();
 sql.prepare('INSERT INTO notifications VALUES(?,?,?,?,?)').run('unposted','m',0,'competitive','win');
 await assert.rejects(markDeliveredNotices(db,'m',[]),/Empty/);
 await assert.rejects(markDeliveredNotices(db,'m',[{riot_id:''}]),/invalid/);
 await assert.rejects(markDeliveredNotices(db,'',[{riot_id:'unposted'}]),/Invalid/);
 assert.equal(sql.prepare("SELECT sent FROM notifications WHERE riot_id='unposted'").get()?.sent,0);
 assert.equal(await markDeliveredNotices(db,'m',[{riot_id:'unposted'},{riot_id:'unposted'}]),1);
 assert.equal(await markDeliveredNotices(db,'m',[{riot_id:'unposted'}]),0,'duplicate send ack idempotent');
});
