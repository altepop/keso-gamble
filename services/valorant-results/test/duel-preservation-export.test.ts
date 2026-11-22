import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {duelPreservationExport,DUEL_PRESERVATION_BATCH} from '../src/duel-preservation-export.ts';
const guild='606131625084059674',other='111111111111111111';
test('owner archival snapshot is bounded to the guild, read-only, and omits secret/wallet/user columns',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE kp_duel_pve_sessions(id TEXT,guild TEXT,game TEXT,difficulty TEXT,turn TEXT,winner TEXT,version INTEGER,created_at INTEGER,updated_at INTEGER,secret TEXT);
 CREATE TABLE kp_board_duels(id TEXT,guild TEXT,game TEXT,status TEXT,winner TEXT,version INTEGER,created_at INTEGER,updated_at INTEGER,private_hand TEXT,stake INTEGER);`);
  for(let i=0;i<55;i++){
   db.prepare('INSERT INTO kp_duel_pve_sessions VALUES(?,?,?,?,?,?,?,?,?,?)').run('a'+i,guild,'othello','normal','finished','human',1,i,i,'secret-'+i);
   db.prepare('INSERT INTO kp_board_duels VALUES(?,?,?,?,?,?,?,?,?,?)').run('b'+i,guild,'gomoku','finished','draw',1,i,i,'private-'+i,1000);
  }
  db.prepare('INSERT INTO kp_duel_pve_sessions VALUES(?,?,?,?,?,?,?,?,?,?)').run('foreign',other,'othello','easy','finished','human',1,9999,9999,'foreign-secret');
  const queries:string[]=[];
  const env={DB:{prepare:(sql:string)=>{queries.push(sql);const statement=db.prepare(sql);
   return {bind:(...params:unknown[])=>({all:async()=>({results:statement.all(...params as [])})})};
  }}};
  const result=await duelPreservationExport(env as never,guild,Date.now());
  assert.equal(result.pve.length,DUEL_PRESERVATION_BATCH);
  assert.equal(result.pvp.length,DUEL_PRESERVATION_BATCH);
  assert.equal(result.complete,false);
  assert.equal(result.pve[0].id,'a54');
  assert.equal(result.pvp[0].id,'b54');
  assert.ok(!JSON.stringify(result).includes('foreign'));
  assert.ok(!JSON.stringify(result).includes('secret-'));
  assert.ok(!JSON.stringify(result).includes('private-'));
  assert.ok(!JSON.stringify(result).includes('stake'));
  assert.ok(queries.every(sql=>/^SELECT/i.test(sql.trim())));
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM kp_board_duels').get() as {n:number}).n,55);
 }finally{db.close();}
});
test('invalid guild or clock fails before database reads',async()=>{
 const env={DB:{prepare(){throw Error('must not query');}}};
 await assert.rejects(duelPreservationExport(env as never,'x',Date.now()));
 await assert.rejects(duelPreservationExport(env as never,guild,-1));
});
