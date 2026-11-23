import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ensureTrioGameConstraint} from '../src/duel-trio-schema.ts';
import {DUEL_PROGRESSION_DDL} from '../src/duel-progression-schema.ts';
import {DUEL_PVE_SESSION_DDL} from '../src/duel-pve-sessions.ts';

function memoryDb(){
 const sqlite=new DatabaseSync(':memory:');
 const prepare=(sql:string)=>{
  const bound=(args:unknown[])=>({
   run:async()=>sqlite.prepare(sql).run(...args as []),
   first:async()=>sqlite.prepare(sql).get(...args as []),
   all:async()=>({results:sqlite.prepare(sql).all(...args as [])})
  });
  return {...bound([]),bind:(...args:unknown[])=>bound(args)};
 };
 const DB={prepare,batch:async (commands:Array<{run:()=>Promise<unknown>}>)=>{
  sqlite.exec('BEGIN');
  try{const output=[];for(const command of commands)output.push(await command.run());sqlite.exec('COMMIT');return output;}
  catch(error){sqlite.exec('ROLLBACK');throw error;}
 }};
 return {sqlite,DB};
}
test('migration preserves rows, constraints, triggers, indexes and is idempotent',async()=>{
 const {sqlite,DB}=memoryDb();
 try{
  for(const ddl of DUEL_PROGRESSION_DDL)sqlite.exec(ddl.replaceAll("'bluffdice','poker','trio'","'bluffdice','poker'"));
  sqlite.exec("CREATE TRIGGER replay_guard AFTER INSERT ON kp_duel_progress_receipts BEGIN UPDATE kp_duel_mode_skill SET points=points+1 WHERE guild=NEW.guild AND user=NEW.user AND mode=NEW.mode AND game=NEW.game; END");
  sqlite.prepare("INSERT INTO kp_duel_mode_skill(guild,user,mode,game,points,updated_at) VALUES(?,?,?,?,?,?)")
   .run('g','alice','pve','othello',11,1);
  sqlite.prepare("INSERT INTO kp_duel_progress_receipts(guild,match_id,user,mode,game,outcome,verified_version,occurred_at) VALUES(?,?,?,?,?,?,?,?)")
   .run('g','m1','alice','pve','othello','win',1,1);
  await ensureTrioGameConstraint({DB} as never,'kp_duel_mode_skill');
  await ensureTrioGameConstraint({DB} as never,'kp_duel_progress_receipts');
  await ensureTrioGameConstraint({DB} as never,'kp_duel_progress_receipts');
  assert.equal(sqlite.prepare("SELECT points FROM kp_duel_mode_skill WHERE guild='g'").get()?.points,12);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM kp_duel_progress_receipts").get()?.n,1);
  sqlite.prepare("INSERT INTO kp_duel_mode_skill(guild,user,mode,game,updated_at) VALUES(?,?,?,?,?)").run('g','bob','pve','trio',3);
  sqlite.prepare("INSERT INTO kp_duel_progress_receipts(guild,match_id,user,mode,game,outcome,verified_version,occurred_at) VALUES(?,?,?,?,?,?,?,?)")
   .run('g','m2','bob','pve','trio','win',1,3);
  assert.equal(sqlite.prepare("SELECT points FROM kp_duel_mode_skill WHERE user='bob'").get()?.points,1);
  const index=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='kp_duel_progress_recent'").get();
  assert.ok(index);
  const trigger=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='replay_guard'").get();
  assert.ok(trigger);
  assert.throws(()=>sqlite.prepare("INSERT INTO kp_duel_mode_skill(guild,user,mode,game,updated_at) VALUES(?,?,?,?,?)").run('g','bob','pvp','unknown',3));
 }finally{sqlite.close();}
});
test('PvE session migration preserves running game and action trigger',async()=>{
 const {sqlite,DB}=memoryDb();
 try{
  for(const ddl of DUEL_PVE_SESSION_DDL)sqlite.exec(ddl.replaceAll("'bluffdice','poker','trio'","'bluffdice','poker'"));
  sqlite.prepare("INSERT INTO kp_duel_pve_sessions(id,guild,user,request_id,game,difficulty,board,turn,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
   .run('s','g','alice','req','othello','normal','.'.repeat(64),'human',1,1);
  await ensureTrioGameConstraint({DB} as never,'kp_duel_pve_sessions');
  assert.equal(sqlite.prepare("SELECT game FROM kp_duel_pve_sessions WHERE id='s'").get()?.game,'othello');
  sqlite.prepare("INSERT INTO kp_duel_pve_sessions(id,guild,user,request_id,game,difficulty,board,turn,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
   .run('t','g','alice','req2','trio','strong','.........','human',2,2);
  const triggered=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='kp_duel_pve_action_apply'").get();
  assert.ok(triggered);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM kp_duel_pve_sessions").get()?.n,2);
 }finally{sqlite.close();}
});

test('reuses already read board DDL and avoids a duplicate sqlite_master table lookup',async()=>{
 const run=async(reuse:boolean)=>{
  const {sqlite,DB}=memoryDb();
  try{
   for(const ddl of DUEL_PVE_SESSION_DDL)
    sqlite.exec(ddl.replaceAll("'bluffdice','poker','trio'","'bluffdice','poker'"));
   const prior=sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='kp_duel_pve_sessions'")
    .get() as {sql:string};
   assert.ok(prior.sql.includes("'connect4'")&&!prior.sql.includes("'trio'"));
   let tableDefinitionReads=0,indexReads=0,triggerReads=0;
   const tracked={
    prepare(sql:string){
     if(sql.includes("SELECT sql FROM sqlite_master WHERE type='table'"))tableDefinitionReads++;
     if(sql.includes("SELECT name,sql FROM sqlite_master WHERE tbl_name"))indexReads++;
     if(sql.includes("SELECT name,sql FROM sqlite_master WHERE type='trigger'"))triggerReads++;
     return DB.prepare(sql);
    },batch:DB.batch
   };
   await ensureTrioGameConstraint({DB:tracked} as never,'kp_duel_pve_sessions',
    reuse?prior.sql:undefined);
   assert.equal(tableDefinitionReads,reuse?0:1);
   assert.equal(indexReads,1,'index preservation must not be bypassed');
   assert.equal(triggerReads,1,'cross-table trigger preservation must not be bypassed');
   assert.match(String(sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='kp_duel_pve_sessions'").get()?.sql),/'trio'/);
   sqlite.prepare("INSERT INTO kp_duel_pve_sessions(id,guild,user,request_id,game,difficulty,board,turn,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run('s','g','alice','req','trio','easy','.........','human',1,1);
   assert.equal(sqlite.prepare("SELECT game FROM kp_duel_pve_sessions WHERE id='s'").get()?.game,'trio');
  }finally{sqlite.close();}
 };
 await run(false);
 await run(true);
});
