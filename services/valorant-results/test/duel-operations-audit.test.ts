import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {duelOperationsAudit} from '../src/duel-operations-audit.ts';
test('Phase12 audit reports guild-only aggregates without modifying D1',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE kp_duel_pve_sessions(guild TEXT,turn TEXT,updated_at INTEGER);
 CREATE TABLE kp_board_duels(guild TEXT,status TEXT,updated_at INTEGER);
 INSERT INTO kp_duel_pve_sessions VALUES('111111111111111111','finished',100),
 ('111111111111111111','human',100),('222222222222222222','finished',100);
 INSERT INTO kp_board_duels VALUES('111111111111111111','finished',100),
 ('111111111111111111','active',100),('222222222222222222','finished',100);`);
  const statements:string[]=[];
  const env={DB:{prepare:(sql:string)=>{
   statements.push(sql);
   const stmt=db.prepare(sql);
   return {bind:(...args:unknown[])=>({first:async()=>stmt.get(...args as [])})};
  }}};
  const out=await duelOperationsAudit(env as never,'111111111111111111',100*86_400_000);
  assert.deepEqual(out.counts,{staleFinishedPve:1,staleFinishedPvp:1,activePve:1,activePvp:1});
  assert.equal(out.reviewRecommended,true);
  assert.equal(out.deletionAuthorized,false);
  assert.equal(statements.length,2);
  assert.ok(statements.every(x=>/^SELECT/i.test(x.trim())&&!/DELETE|UPDATE|INSERT/i.test(x)));
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM kp_board_duels').get() as {n:number}).n,3);
 }finally{db.close();}
});
test('reject malformed guild and clock instead of querying other tenants',async()=>{
 const env={DB:{prepare:()=>{throw Error('must not query');}}};
 await assert.rejects(duelOperationsAudit(env as never,'',100));
 await assert.rejects(duelOperationsAudit(env as never,'111111111111111111',NaN));
});
