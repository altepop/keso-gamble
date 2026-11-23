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
  assert.ok(statements.every(x=>/^SELECT/i.test(x.trim())&&!/\b(?:DELETE|UPDATE|INSERT)\b/i.test(x)));
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM kp_board_duels').get() as {n:number}).n,3);
 }finally{db.close();}
});
test('reject malformed guild and clock instead of querying other tenants',async()=>{
 const env={DB:{prepare:()=>{throw Error('must not query');}}};
 await assert.rejects(duelOperationsAudit(env as never,'',100));
 await assert.rejects(duelOperationsAudit(env as never,'111111111111111111',NaN));
});

test('PvP 30-day threshold detects stale rooms before 90-day PvE threshold',async()=>{
 const now=100*86_400_000;
 const guild='606131625084059674';
 const calls:Array<{sql:string;args:unknown[]}>=[];
 const env={DB:{prepare:(sql:string)=>({bind:(...args:unknown[])=>{
  calls.push({sql,args});
  return {first:async()=>({stale:1,active:0})};
 }})}};
 const result=await duelOperationsAudit(env as never,guild,now);
 assert.equal(result.retentionReviewDays,90);
 assert.equal(result.pvpRetentionReviewDays,30);
 assert.equal(calls.length,2);
 assert.equal(calls[0].args[0],now-90*86_400_000);
 assert.deepEqual(calls[1].args,[guild,now-30*86_400_000,guild]);
 assert.equal(result.deletionAuthorized,false);
});

test('PvP audit uses indexed selective counts with identical status and age semantics',async()=>{
 const guild='606131625084059674';
 const now=100*86_400_000;
 const threshold=now-30*86_400_000;
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE kp_duel_pve_sessions(guild TEXT,turn TEXT,updated_at INTEGER);
 CREATE TABLE kp_board_duels(guild TEXT,status TEXT,updated_at INTEGER);
 CREATE INDEX kp_board_duels_retention ON kp_board_duels(guild,status,updated_at);`);
  const add=db.prepare('INSERT INTO kp_board_duels(guild,status,updated_at) VALUES(?,?,?)');
  for(const [status,age] of [
   ['finished',threshold-1],['cancelled',threshold-1],
   ['finished',threshold],['cancelled',threshold+1],
   ['active',now],['pending',now],['finished',now]
  ] as const)add.run(guild,status,age);
  add.run('222222222222222222','finished',threshold-1);
  const statements:string[]=[];
  const env={DB:{prepare:(sql:string)=>{
   statements.push(sql);
   const stmt=db.prepare(sql);
   return {bind:(...args:unknown[])=>({first:async()=>stmt.get(...args as [])})};
  }}};
  const result=await duelOperationsAudit(env as never,guild,now);
  assert.deepEqual(result.counts,{
   staleFinishedPve:0,staleFinishedPvp:2,activePve:0,activePvp:2
  });
  assert.equal(result.reviewRecommended,true);
  assert.equal(result.deletionAuthorized,false);
  assert.equal(statements.length,2,'no additional D1 round trip');
  const auditSql=statements[1];
  assert.equal((auditSql.match(/SELECT COUNT\(\*\) FROM kp_board_duels/g)||[]).length,2);
  assert.doesNotMatch(auditSql,/SUM\(CASE/);
  const plan=db.prepare('EXPLAIN QUERY PLAN '+auditSql)
   .all(guild,threshold,guild) as Array<{detail:string}>;
  const indexed=plan.filter(row=>row.detail.includes('USING COVERING INDEX kp_board_duels_retention'));
  assert.equal(indexed.length,2,'both aggregates use the pre-existing covering index');
  assert.equal(plan.some(row=>row.detail.includes('SCAN kp_board_duels')),false);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM kp_board_duels').get() as {n:number}).n,8);
 }finally{db.close();}
});
