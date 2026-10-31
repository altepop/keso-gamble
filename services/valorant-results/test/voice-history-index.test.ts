import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ensureVoiceLedger} from '../src/voice-rewards.ts';
import type {KpEnv} from '../src/kp.ts';

test('voice reward history uses member/date index, preserves latest 100 and all bonus credits',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE kp_ledger(id TEXT PRIMARY KEY,guild TEXT,user TEXT,delta INTEGER,kind TEXT,at INTEGER)');
 class Statement {
  constructor(readonly text:string){}
  run(){sql.exec(this.text);return {meta:{changes:0}};}
 }
 const db={prepare:(text:string)=>new Statement(text),batch:async(queries:Statement[])=>{
  sql.exec('BEGIN');
  try{for(const query of queries)query.run();sql.exec('COMMIT');}
  catch(error){sql.exec('ROLLBACK');throw error;}
 }};
 const env={DB:db} as unknown as KpEnv;
 await ensureVoiceLedger(env);
 await ensureVoiceLedger(env); // Repeated initialization must be harmless.
 const guild='100000000000000100',users=['100000000000000101','100000000000000102'];
 const insert=sql.prepare('INSERT INTO kp_voice_events VALUES(?,?,?,?,?,5,?)');
 for(let i=0;i<720;i++){
  const user=users[i%2],day='2026-10-'+String(1+Math.floor(i/48)).padStart(2,'0');
  insert.run('voice:'+guild+':'+user+':'+day+':'+(i%48+1),guild,user,day,i%48+1,i*1000);
 }
 const q="SELECT e.id,e.day,e.slot,e.amount+COALESCE((SELECT delta FROM kp_ledger WHERE id='bonus:'||e.id),0) AS amount,e.at FROM kp_voice_events e WHERE e.guild=? AND e.user=? ORDER BY e.at DESC LIMIT 100";
 const plan=sql.prepare('EXPLAIN QUERY PLAN '+q).all(guild,users[0]).map(x=>String(x.detail)).join(' | ');
 assert.match(plan,/kp_voice_events_member_latest/);
 assert.doesNotMatch(plan,/USE TEMP B-TREE/);
 const rows=sql.prepare(q).all(guild,users[0]) as Array<{amount:number;at:number}>;
 assert.equal(rows.length,100);
 assert.ok(rows.every(r=>r.amount===15));
 assert.ok(rows.every((r,i)=>i===0||rows[i-1].at>=r.at));
 assert.equal(sql.prepare('SELECT SUM(delta) AS total FROM kp_ledger').get()!.total,720*15);
 sql.close();
});
