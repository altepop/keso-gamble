import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {STEAM_RELIC_CAP_USED_SQL} from '../src/relics.ts';

const OLD_SQL=`SELECT COALESCE(SUM(l.delta),0) AS n
 FROM kp_ledger l JOIN kp_steam_events s ON l.id='relic:'||s.id
 WHERE l.guild=? AND l.user=? AND l.kind='relic' AND l.at>=?`;

test('Steam relic daily cap uses indexed per-user ledger + exact Steam receipt PK, never scans all Steam events',()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE kp_ledger(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,
   delta INTEGER NOT NULL,kind TEXT NOT NULL,at INTEGER NOT NULL);
 CREATE INDEX kp_ledger_relic_metrics ON kp_ledger(guild,kind,user,at DESC);
 CREATE TABLE kp_steam_events(id TEXT PRIMARY KEY);`);
 const event=sql.prepare('INSERT INTO kp_steam_events VALUES(?)');
 // Large unrelated historical Steam activity must never be scanned on every relic payout.
 for(let i=0;i<2000;i++)event.run('steam:historical:'+i);
 for(const id of ['steam:a','steam:b','steam:c','other'])event.run(id);
 const ledger=sql.prepare('INSERT INTO kp_ledger VALUES(?,?,?,?,?,?)');
 ledger.run('relic:steam:a','g','u',100,'relic',1000);
 ledger.run('relic:steam:b','g','u',300,'relic',1100);
 ledger.run('relic:other','g','u',80,'relic',1200);
 ledger.run('relic:steam:orphan','g','u',700,'relic',1300);
 ledger.run('other:steam:a','g','u',900,'relic',1400);
 ledger.run('relic:steam:c','g','u',200,'relic',500);
 ledger.run('relic:steam:a2','g','other',300,'relic',1500);
 ledger.run('relic:steam:c2','g2','u',500,'relic',1600);
 ledger.run('relic:steam:a3','g','u',250,'game',1700);
 const params=['g','u',900];
 const get=(q:string)=>sql.prepare(q).get(...params) as {n:number};
 assert.equal(get(OLD_SQL).n,480,'legacy semantics include only events genuinely stored in Steam table');
 assert.equal(get(STEAM_RELIC_CAP_USED_SQL).n,480);
 for(const cutoff of [0,1000,1150,1250,2000]){
  const args=['g','u',cutoff] as const;
  assert.deepEqual(sql.prepare(STEAM_RELIC_CAP_USED_SQL).get(...args),sql.prepare(OLD_SQL).get(...args));
 }
 const plan=sql.prepare('EXPLAIN QUERY PLAN '+STEAM_RELIC_CAP_USED_SQL).all(...params)
  .map(x=>String(x.detail)).join(' | ');
 assert.match(plan,/SEARCH l USING INDEX kp_ledger_relic_metrics/);
 assert.match(plan,/SEARCH s (?:EXISTS )?USING (?:COVERING )?INDEX sqlite_autoindex_kp_steam_events_1/);
 assert.doesNotMatch(plan,/SCAN s/,'never scan all Steam achievements just to check a daily bonus');
 sql.close();
});
