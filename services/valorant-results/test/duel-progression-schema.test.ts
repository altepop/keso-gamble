import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {DUEL_PROGRESSION_DDL,ensureDuelProgressionTables} from '../src/duel-progression-schema.ts';

test('PvE and PvP maintain separate per-game progress rows and indexed history',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  for(const sql of DUEL_PROGRESSION_DDL)db.exec(sql);
  const write=db.prepare('INSERT INTO kp_duel_mode_skill(guild,user,mode,game,points,updated_at) VALUES (?,?,?,?,?,?)');
  write.run('g','alice','pve','othello',100,1);
  write.run('g','alice','pvp','othello',5,2);
  write.run('g','alice','pve','poker',7,3);
  const rows=db.prepare('SELECT mode,game,points FROM kp_duel_mode_skill ORDER BY mode,game').all();
  assert.equal(rows.length,3);
  assert.deepEqual(rows.map(x=>x.points),[100,7,5]);
  assert.throws(()=>write.run('g','alice','pvp','othello',80,4),/UNIQUE|constraint/i);
  const indexes=db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'kp_duel_progress_%'").all();
  assert.equal(indexes.length,2);
 }finally{db.close();}
});
test('a verified duel/user can receive at most one receipt in any mode and game',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  for(const sql of DUEL_PROGRESSION_DDL)db.exec(sql);
  const write=db.prepare('INSERT INTO kp_duel_progress_receipts(guild,match_id,user,mode,game,opponent,outcome,verified_version,occurred_at) VALUES(?,?,?,?,?,?,?,?,?)');
  const pvp=['g','match1','alice','pvp','othello','bob','win',2,123] as const;
  write.run(...pvp);
  assert.throws(()=>write.run(...pvp),/UNIQUE|constraint/i);
  assert.throws(()=>write.run('g','match2','alice','pvp','othello','alice','win',2,123),/CHECK|constraint/i);
  assert.throws(()=>write.run('g','match3','alice','pve','othello','bob','win',2,123),/CHECK|constraint/i);
  write.run('g','match4','alice','pve','othello',null,'draw',2,123);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_progress_receipts').get()?.n,2);
 }finally{db.close();}
});
test('additive DDL initializes once for a DB handle and stays retryable',async()=>{
 const db=new DatabaseSync(':memory:');let calls=0;
 const env={DB:{prepare(sql:string){return {run:async()=>{calls++;db.exec(sql);},bind:(...args:unknown[])=>({first:async()=>db.prepare(sql).get(...args as [])})};}}};
 try{
  await Promise.all([ensureDuelProgressionTables(env as never),ensureDuelProgressionTables(env as never)]);
  await ensureDuelProgressionTables(env as never);
  assert.equal(calls,DUEL_PROGRESSION_DDL.length);
 }finally{db.close();}
});
