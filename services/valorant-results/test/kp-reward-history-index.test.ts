import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {kpMatchRewardHistoryIndex} from '../src/kp.ts';

test('VALORANT claim history uses member/latest index while retaining penalties and ordering',()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE kp_events(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,match TEXT NOT NULL,mode TEXT NOT NULL,amount INTEGER NOT NULL,at INTEGER NOT NULL)');
 sql.exec('CREATE TABLE kp_ledger(id TEXT PRIMARY KEY,delta INTEGER NOT NULL)');
 const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
 const insert=sql.prepare('INSERT INTO kp_events VALUES(?,?,?,?,?,?,?)');
 for(let i=0;i<1200;i++){
  const user=i%2?two:one;
  insert.run('event:'+i,guild,user,'match:'+i,'competitive',900,i*1000);
 }
 sql.prepare('INSERT INTO kp_ledger VALUES(?,?)').run('penalty:event:1198',-1100);
 sql.exec(kpMatchRewardHistoryIndex);
 const query="SELECT e.id,e.match,e.mode,e.amount+COALESCE((SELECT delta FROM kp_ledger WHERE id='penalty:'||e.id),0) AS amount,e.at FROM kp_events e WHERE e.guild=? AND e.user=? ORDER BY e.at DESC,e.id LIMIT 100";
 const plan=sql.prepare('EXPLAIN QUERY PLAN '+query).all(guild,one).map(r=>String(r.detail)).join(' | ');
 assert.match(plan,/kp_events_member_latest/);
 assert.doesNotMatch(plan,/USE TEMP B-TREE/);
 const rows=sql.prepare(query).all(guild,one) as Array<{id:string;amount:number;at:number}>;
 assert.equal(rows.length,100);
 assert.equal(rows[0].id,'event:1198');
 assert.equal(rows[0].amount,-200);
 assert.ok(rows.slice(1).every(r=>r.amount===900));
 assert.ok(rows.every((r,i)=>i===0||rows[i-1].at>=r.at));
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM kp_events').get()!.n,1200);
 sql.close();
});
