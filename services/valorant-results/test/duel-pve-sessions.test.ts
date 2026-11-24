import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {serverPveOperation,ensureServerPveTables,DUEL_PVE_SESSION_DDL} from '../src/duel-pve-sessions.ts';
import {DUEL_PROGRESSION_GAMES} from '../src/duel-progression.ts';
import {duelDailyChallenge} from '../src/duel-daily-challenge.ts';

function fixture(){
 const db=new DatabaseSync(':memory:');
 let batches=0;
 const prepare=(sql:string)=>{
  const stmt=db.prepare(sql);
  const wrap=(args:unknown[])=>({
   run:async()=>stmt.run(...args as []),
   first:async()=>stmt.get(...args as [])
  });
  return {...wrap([]),bind:(...args:unknown[])=>wrap(args)};
 };
 const env={DB:{
  prepare,
  batch:async(statements:Array<{run:()=>Promise<unknown>}>)=>{
   batches++;db.exec('BEGIN');
   try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result;}
   catch(e){db.exec('ROLLBACK');throw e;}
  }
 }};
 return {db,env:env as never,batches:()=>batches};
}
const first:{[key:string]:Record<string,unknown>}={
 othello:{cell:19},gomoku:{cell:112},connect4:{cell:3},
 hitblow:{guess:'9876'},bluffdice:{choice:'bid',count:1,face:1},poker:{cells:[]},trio:{cell:0}
};
test('seven authenticated server modes persist CPU decision but only expose public states',async()=>{
 const {db,env}=fixture();
 try{
  for(const game of DUEL_PROGRESSION_GAMES){
   // Each mode is owned by its own authenticated user in this fixture;
   // keeping all six sessions under one user would correctly hit the cap of 3.
   const user='alice-'+game;
   const req=randomUUID();
   const one=await serverPveOperation(env,'guild',user,{action:'start',requestId:req,game,level:'normal'});
   assert.equal(one.game,game);
   assert.equal(one.turn,'human');
   assert.equal(Object.hasOwn(one,'secret'),false);
   const before=db.prepare('SELECT * FROM kp_duel_pve_sessions WHERE id=?').get(one.id) as Record<string,unknown>;
   assert.equal(before?.version,0);
   const done=await serverPveOperation(env,'guild',user,{action:'move',session:one.id,requestId:randomUUID(),version:0,...first[game],winner:'human',kp:12345});
   assert.equal(done.version,1);
   assert.equal(Object.hasOwn(done,'secret'),false);
   assert.equal(Object.hasOwn(done,'kp'),false);
   const saved=db.prepare('SELECT * FROM kp_duel_pve_sessions WHERE id=?').get(one.id) as Record<string,unknown>;
   assert.equal(saved?.version,1);
   assert.equal(saved?.game,game);
   const secret=db.prepare('SELECT data FROM kp_duel_pve_secrets WHERE id=?').get(one.id) as {data:string|null};
   assert.ok(secret);
   assert.ok(!secret.data||!JSON.stringify(done).includes('privateB'));
  }
 }finally{db.close();}
});
test('identical start or move request cannot mint a second session or turn',async()=>{
 const {db,env}=fixture();
 try{
  const requestId=randomUUID();
  const one=await serverPveOperation(env,'g','alice',{action:'start',game:'othello',level:'easy',requestId});
  const twice=await serverPveOperation(env,'g','alice',{action:'start',game:'othello',level:'easy',requestId});
  assert.equal(one.id,twice.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_pve_sessions').get()?.n,1);
  const moveId=randomUUID();
  const firstMove=await serverPveOperation(env,'g','alice',{action:'move',session:one.id,version:0,requestId:moveId,cell:19});
  const replay=await serverPveOperation(env,'g','alice',{action:'move',session:one.id,version:0,requestId:moveId,cell:19});
  assert.equal(replay.version,firstMove.version);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_pve_actions').get()?.n,1);
  await assert.rejects(()=>serverPveOperation(env,'g','alice',{action:'move',session:one.id,version:0,requestId:randomUUID(),cell:19}));
  await assert.rejects(()=>serverPveOperation(env,'g','bob',{action:'get',session:one.id}));
  await assert.rejects(()=>serverPveOperation(env,'g','bob',{action:'move',session:one.id,version:0,requestId:randomUUID(),cell:19}));
  await assert.rejects(()=>serverPveOperation(env,'g','alice',{action:'start',requestId,game:'poker',level:'easy'}));
 }finally{db.close();}
});
test('illegal action rolls back without mutating board or saving private data',async()=>{
 const {db,env}=fixture();
 try{
  const one=await serverPveOperation(env,'g','alice',{action:'start',game:'poker',level:'normal',requestId:randomUUID()});
  const before=db.prepare('SELECT data FROM kp_duel_pve_secrets WHERE id=?').get(one.id);
  await assert.rejects(()=>serverPveOperation(env,'g','alice',{action:'move',session:one.id,version:0,requestId:randomUUID(),cells:[0,0]}));
  assert.deepEqual(db.prepare('SELECT data FROM kp_duel_pve_secrets WHERE id=?').get(one.id),before);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_pve_actions').get()?.n,0);
  assert.equal(db.prepare('SELECT version FROM kp_duel_pve_sessions WHERE id=?').get(one.id)?.version,0);
 }finally{db.close();}
});
test('D1 trigger rejects stale versions and keeps the old snapshot untouched',async()=>{
 const {db,env}=fixture();
 try{
  await ensureServerPveTables(env);
  const one=await serverPveOperation(env,'g','alice',{action:'start',game:'connect4',level:'normal',requestId:randomUUID()});
  assert.throws(()=>db.prepare(`INSERT INTO kp_duel_pve_actions
   (id,guild,user,session_id,expected_version,at,board,turn,winner,human_moves,cpu_moves)
   VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(),'g','alice',one.id,100,123,'fake','finished','human',1,0),/version conflict/i);
  assert.equal(db.prepare('SELECT version FROM kp_duel_pve_sessions WHERE id=?').get(one.id)?.version,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_pve_actions').get()?.n,0);
 }finally{db.close();}
});
test('active-session cap limits unbounded D1 cost while preserving idempotent retries',async()=>{
 const {db,env}=fixture();
 try{
  const requests=Array.from({length:4},()=>randomUUID());
  for(let i=0;i<3;i++)await serverPveOperation(env,'g','alice',{action:'start',game:'gomoku',level:'easy',requestId:requests[i]});
  await assert.rejects(()=>serverPveOperation(env,'g','alice',{action:'start',game:'gomoku',level:'easy',requestId:requests[3]}));
  const one=await serverPveOperation(env,'g','alice',{action:'start',game:'gomoku',level:'easy',requestId:requests[0]});
  assert.equal(one.version,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_pve_sessions').get()?.n,3);
 }finally{db.close();}
});
test('schema has dedicated secrets and immutable action identity',()=>{
 assert.ok(DUEL_PVE_SESSION_DDL.some(sql=>sql.includes('kp_duel_pve_secrets')));
 assert.ok(DUEL_PVE_SESSION_DDL.some(sql=>sql.includes('PRIMARY KEY')&&sql.includes('kp_duel_pve_actions')));
});

test('Phase 11 daily challenge starts server-selected six-mode CPU battle without bonus KP',async()=>{
 const {db,env}=fixture();
 try{
  const preview=duelDailyChallenge(Date.now());
  assert.equal(preview.bonusKp,0);
  const req=randomUUID();
  const one=await serverPveOperation(env,'guild','alice',{action:'daily',requestId:req,game:'invalid',level:'invalid'});
  assert.equal(one.game,preview.game);
  assert.equal(one.level,preview.level);
  assert.equal(Object.hasOwn(one,'secret'),false);
  const replay=await serverPveOperation(env,'guild','alice',{action:'daily',requestId:req});
  assert.equal(one.id,replay.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_pve_sessions').get()?.n,1);
  assert.equal(Object.hasOwn(one,'bonusKp'),false);
 }finally{db.close();}
});

test('new daily/custom starts use one scoped post-batch readback, preserve exact snapshot and failure boundaries',async()=>{
 const {db,env}=fixture();
 try{
  await ensureServerPveTables(env);
  const target=env as unknown as {DB:{prepare:(sql:string)=>unknown}};
  const original=target.DB.prepare;
  const reads:string[]=[];
  target.DB.prepare=(sql:string)=>{
   if(/^SELECT\s/.test(sql.trim()))reads.push(sql);
   return original(sql);
  };
  for(const action of ['start','daily']){
   const requestId=randomUUID(),user='alice-'+action;
   const one=await serverPveOperation(env,'g',user,{action,requestId,game:'trio',level:'easy'});
   const query=reads.filter(s=>s.includes('AS secret_id'));
   assert.equal(query.length,2,'new start has one miss probe and one post-batch readback');
   assert.match(query[0],/s\.guild=\? AND s\.user=\? AND s\.request_id=\?/);
   assert.equal(reads.filter(s=>s.includes('SELECT id FROM kp_duel_pve_sessions WHERE guild=')).length,0);
   assert.equal(reads.filter(s=>s.includes('WHERE s.id=? AND s.guild=? AND s.user=?')).length,0);
   const old=db.prepare('SELECT id FROM kp_duel_pve_sessions WHERE guild=? AND user=? AND request_id=?').get('g',user,requestId) as {id:string};
   assert.equal(old.id,one.id);
   const current=await serverPveOperation(env,'g',user,{action:'get',session:old.id});
   assert.deepEqual(one,current);
   assert.equal(Object.hasOwn(one,'secret_id'),false);
   reads.length=0;
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_pve_daily_entries').get()?.n,1);
  db.exec("CREATE TRIGGER fixture_skip_secret BEFORE INSERT ON kp_duel_pve_secrets BEGIN SELECT RAISE(IGNORE); END");
  await assert.rejects(()=>serverPveOperation(env,'g','orphan',{action:'start',requestId:randomUUID(),game:'trio',level:'easy'}),/保存を確認できません/);
 }finally{db.close();}
});

test('start/daily replay uses one SELECT and preserves validation precedence and ownership',async()=>{
 const {db,env,batches}=fixture();
 try{
  const target=env as unknown as {DB:{prepare:(sql:string)=>unknown}};
  const prepare=target.DB.prepare;
  const reads:string[]=[];
  for(const action of ['start','daily']){
   const requestId=randomUUID(),user='replay-'+action;
   const input={action,requestId,game:'trio',level:'easy'};
   const original=await serverPveOperation(env,'g',user,input);
   const snapshot=await serverPveOperation(env,'g',user,{action:'get',session:original.id});
   const before=batches();
   target.DB.prepare=(sql:string)=>{if(/^SELECT\s/.test(sql.trim()))reads.push(sql);return prepare(sql);};
   reads.length=0;
   const replay=await serverPveOperation(env,'g',user,input);
   assert.deepEqual(replay,snapshot);
   assert.equal(reads.length,1);
   assert.match(reads[0],/s\.guild=\? AND s\.user=\? AND s\.request_id=\?/);
   assert.equal(batches(),before);
   assert.equal(Object.hasOwn(replay,'secret_id'),false);
   if(action==='start'){
    await assert.rejects(()=>serverPveOperation(env,'g',user,{...input,game:'othello'}),/操作IDの再利用/);
    await assert.rejects(()=>serverPveOperation(env,'g',user,{...input,level:'strong'}),/操作IDの再利用/);
   }
   db.prepare('DELETE FROM kp_duel_pve_secrets WHERE id=?').run(original.id);
   await assert.rejects(()=>serverPveOperation(env,'g',user,input),/CPU戦が見つかりません/);
   if(action==='start')await assert.rejects(()=>serverPveOperation(env,'g',user,{...input,level:'strong'}),/操作IDの再利用/);
   const other=await serverPveOperation(env,'g','other-'+user,input);
   const foreign=await serverPveOperation(env,'foreign',user,input);
   assert.notEqual(other.id,original.id);
   assert.notEqual(foreign.id,original.id);
   assert.notEqual(other.id,foreign.id);
   target.DB.prepare=prepare;
  }
 }finally{db.close();}
});
