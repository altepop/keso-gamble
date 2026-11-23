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
  assert.equal(queries.length,1,'one D1 SELECT for both individually capped mode exports');
  assert.ok(queries.every(sql=>/^SELECT/i.test(sql.trim())));
  assert.match(queries[0],/UNION ALL/);
  assert.doesNotMatch(queries[0],/kp_board_duel_secrets|kp_duel_pve_secrets|private_hand|stake|wallet/);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM kp_board_duels').get() as {n:number}).n,55);
 }finally{db.close();}
});
test('invalid guild or clock fails before database reads',async()=>{
 const env={DB:{prepare(){throw Error('must not query');}}};
 await assert.rejects(duelPreservationExport(env as never,'x',Date.now()));
 await assert.rejects(duelPreservationExport(env as never,guild,-1));
});

test('combined read matches the two original bounded projections for ties, status filters and guild isolation',async()=>{
 const db=new DatabaseSync(':memory:');
 const now=Date.parse('2026-11-24T00:00:00Z');
 try{
  db.exec(`CREATE TABLE kp_duel_pve_sessions(id TEXT,guild TEXT,game TEXT,difficulty TEXT,turn TEXT,winner TEXT,version INTEGER,created_at INTEGER,updated_at INTEGER,private_hand TEXT);
    CREATE TABLE kp_board_duels(id TEXT,guild TEXT,game TEXT,status TEXT,winner TEXT,version INTEGER,created_at INTEGER,updated_at INTEGER,private_hand TEXT);`);
  const pveInsert=db.prepare('INSERT INTO kp_duel_pve_sessions VALUES(?,?,?,?,?,?,?,?,?,?)');
  const pvpInsert=db.prepare('INSERT INTO kp_board_duels VALUES(?,?,?,?,?,?,?,?,?)');
  for(let n=0;n<54;n++){
   const stamp=n%3===0?100:n,kind=n%2===0?'finished':'human';
   pveInsert.run('a'+String(n).padStart(3,'0'),guild,'othello','strong',kind,
    kind==='finished'?'human':null,1,0,stamp,'HIDDEN');
   const status=n%3===0?'cancelled':n%3===1?'finished':'active';
   pvpInsert.run('b'+String(n).padStart(3,'0'),guild,'gomoku',status,
    status==='finished'?'draw':null,1,0,stamp,'HIDDEN');
  }
  pveInsert.run('x',other,'othello','easy','finished','human',1,0,999,'HIDDEN');
  pvpInsert.run('y',other,'gomoku','finished','draw',1,0,999,'HIDDEN');
  const oldPve=db.prepare(`SELECT id,game,difficulty,turn,winner,version,created_at,updated_at
   FROM kp_duel_pve_sessions WHERE guild=? AND turn='finished'
   ORDER BY updated_at DESC,id DESC LIMIT ?`).all(guild,DUEL_PRESERVATION_BATCH) as Array<Record<string,unknown>>;
  const oldPvp=db.prepare(`SELECT id,game,status,winner,version,created_at,updated_at
   FROM kp_board_duels WHERE guild=? AND status IN ('finished','cancelled')
   ORDER BY updated_at DESC,id DESC LIMIT ?`).all(guild,DUEL_PRESERVATION_BATCH) as Array<Record<string,unknown>>;
  let statements=0;
  const env={DB:{prepare:(sql:string)=>{
   statements++;const prepared=db.prepare(sql);
   return {bind:(...values:unknown[])=>({all:async()=>({results:prepared.all(...values as [])})})};
  }}};
  const actual=await duelPreservationExport(env as never,guild,now);
  assert.equal(statements,1);
  assert.deepEqual(actual.pve,oldPve.map(r=>({
   id:r.id,game:r.game,difficulty:r.difficulty,status:r.turn,winner:r.winner,
   version:r.version,createdAt:r.created_at,updatedAt:r.updated_at
  })));
  assert.deepEqual(actual.pvp,oldPvp.map(r=>({
   id:r.id,game:r.game,status:r.status,winner:r.winner,
   version:r.version,createdAt:r.created_at,updatedAt:r.updated_at
  })));
  assert.ok(actual.pve.length<=DUEL_PRESERVATION_BATCH);
  assert.ok(actual.pvp.length<=DUEL_PRESERVATION_BATCH);
  assert.equal(actual.generatedAt,now);
  assert.equal(actual.complete,false);
  assert.doesNotMatch(JSON.stringify(actual),/HIDDEN|private_hand|other|foreign/);
 }finally{db.close();}
});

test('empty modes keep the same public response with a single SELECT',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE kp_duel_pve_sessions(id TEXT,guild TEXT,game TEXT,difficulty TEXT,turn TEXT,winner TEXT,version INTEGER,created_at INTEGER,updated_at INTEGER);CREATE TABLE kp_board_duels(id TEXT,guild TEXT,game TEXT,status TEXT,winner TEXT,version INTEGER,created_at INTEGER,updated_at INTEGER)');
  let queryCount=0;
  const env={DB:{prepare:(sql:string)=>{
   queryCount++;const prepared=db.prepare(sql);
   return {bind:(...args:unknown[])=>({all:async()=>({results:prepared.all(...args as [])})})};
  }}};
  const out=await duelPreservationExport(env as never,guild,123);
  assert.equal(queryCount,1);
  assert.deepEqual(out.pve,[]);
  assert.deepEqual(out.pvp,[]);
  assert.equal(out.complete,false);
 }finally{db.close();}
});
