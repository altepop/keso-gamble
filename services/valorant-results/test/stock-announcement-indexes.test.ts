import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {STOCK_ANNOUNCEMENT_LAST_INDEX_SQL,STOCK_ANNOUNCEMENT_DAY_INDEX_SQL} from '../src/stock-market.ts';

const MAX_AT='SELECT MAX(at) AS last FROM stock_announcements WHERE guild=? AND symbol=?';
const DAY_COUNT='SELECT COUNT(*) AS n FROM stock_announcements WHERE guild=? AND at>=?';

test('stock alerts keep exact cooldown and per-day count while reading indexed slices',()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE stock_announcements(guild TEXT NOT NULL,symbol TEXT NOT NULL,slot INTEGER NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(guild,symbol,slot))');
 const insert=sql.prepare('INSERT INTO stock_announcements VALUES(?,?,?,?)');
 for(let i=0;i<1200;i++){
  insert.run('guild','keso',i,i*1800000);
  insert.run('guild','riso',i,i*1800000+1);
  insert.run('other','keso',i,i*1800000+2);
 }
 const cutoff=1198*1800000;
 const oldLatest=sql.prepare(MAX_AT).get('guild','keso');
 const oldCount=sql.prepare(DAY_COUNT).get('guild',cutoff);
 sql.exec(STOCK_ANNOUNCEMENT_LAST_INDEX_SQL);
 sql.exec(STOCK_ANNOUNCEMENT_DAY_INDEX_SQL);
 assert.deepEqual(sql.prepare(MAX_AT).get('guild','keso'),oldLatest);
 assert.deepEqual(sql.prepare(DAY_COUNT).get('guild',cutoff),oldCount);
 assert.equal((sql.prepare(MAX_AT).get('guild','keso') as {last:number}).last,1199*1800000);
 assert.equal((sql.prepare(DAY_COUNT).get('guild',cutoff) as {n:number}).n,4);
 const explain=(query:string,...args:unknown[])=>sql.prepare('EXPLAIN QUERY PLAN '+query).all(...args as never[]).map(x=>String(x.detail)).join(' | ');
 const lastPlan=explain(MAX_AT,'guild','keso');
 const dayPlan=explain(DAY_COUNT,'guild',cutoff);
 assert.match(lastPlan,/stock_announcements_latest/);
 assert.match(dayPlan,/stock_announcements_day/);
 assert.doesNotMatch(lastPlan,/SCAN stock_announcements/);
 assert.doesNotMatch(dayPlan,/SCAN stock_announcements/);
 // All other guilds and symbols retain their own independent cooldowns.
 assert.equal((sql.prepare(MAX_AT).get('other','keso') as {last:number}).last,1199*1800000+2);
 sql.close();
});
