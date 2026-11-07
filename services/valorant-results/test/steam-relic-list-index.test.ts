import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {STEAM_RELIC_ORDER_INDEX_SQL} from '../src/steam-rewards.ts';
import {STEAM_RELIC_LIST_SQL} from '../src/steam-relic-eligibility.ts';

test('Steam relic catalog orders rare first then recent via a covering expression seek, preserving all receipts',()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE kp_steam_events(id TEXT PRIMARY KEY,guild TEXT,user TEXT,title TEXT,percent REAL,app INTEGER,amount INTEGER,at INTEGER);
 CREATE TABLE kp_steam_daily(guild TEXT NOT NULL,user TEXT NOT NULL,day TEXT NOT NULL,amount INTEGER,PRIMARY KEY(guild,user,day));
 CREATE INDEX kp_steam_history ON kp_steam_events(guild,user,at DESC);`);
 const add=sql.prepare('INSERT INTO kp_steam_events VALUES(?,?,?,?,?,?,?,?)');
 for(let i=0;i<1500;i++){
  const percent=[0.1,5,18,25,40,90][i%6]!;
  add.run('receipt'+i,i%4===0?'other':'g',i%5===0?'other':'u','achievement'+i,percent,100,100,i);
 }
 sql.prepare('INSERT INTO kp_steam_daily VALUES(?,?,?,?)').run('g','u','2026-11-08',4000);
 const args=['2026-11-08','g','u'];
 const before=sql.prepare(STEAM_RELIC_LIST_SQL).all(...args);
 assert.equal(before.length,100);
 sql.exec(STEAM_RELIC_ORDER_INDEX_SQL);
 const after=sql.prepare(STEAM_RELIC_LIST_SQL).all(...args);
 assert.deepEqual(after.map(r=>r.id),before.map(r=>r.id));
 assert.ok(after.every(r=>r.earnedToday===4000));
 const plan=sql.prepare('EXPLAIN QUERY PLAN '+STEAM_RELIC_LIST_SQL).all(...args).map(x=>String(x.detail)).join(' | ');
 assert.match(plan,/SEARCH e USING INDEX kp_steam_relic_list_order/);
 assert.doesNotMatch(plan,/USE TEMP B-TREE FOR ORDER BY/);
 // The index is additive: no receipt, KP amount or sort rule is changed.
 assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM kp_steam_events').get() as {n:number}).n,1500);
 sql.close();
});
