import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {serverPveOperation} from '../src/duel-pve-sessions.ts';
import {duelHistoryRead,ensureDuelDailyHistory} from '../src/duel-history.ts';
import {DUEL_PROGRESSION_DDL} from '../src/duel-progression-schema.ts';
import {DUEL_REWARD_DDL} from '../src/duel-rewards.ts';

function fixture(){
 const db=new DatabaseSync(':memory:');
 const prepare=(sql:string)=>({
  bind(...args:unknown[]){return {first:async()=>db.prepare(sql).get(...args as []),
   all:async()=>({results:db.prepare(sql).all(...args as [])}),
   run:async()=>db.prepare(sql).run(...args as [])};},
  first:async()=>db.prepare(sql).get(),
  all:async()=>({results:db.prepare(sql).all()}),
  run:async()=>db.prepare(sql).run()
 });
 const DB={prepare,batch:async(queries:Array<{run?:()=>Promise<unknown>;all?:()=>Promise<unknown>}>)=>{
  db.exec('BEGIN');
  try{
   const output=[];
   for(const q of queries)output.push(q.all?await q.all():await q.run?.());
   db.exec('COMMIT');return output;
  }catch(e){db.exec('ROLLBACK');throw e;}
 }};
 return {db,env:{DB} as never};
}
test('daily start creates precise same-transaction provenance; a custom game does not',async()=>{
 const {db,env}=fixture();
 try{
  const daily=await serverPveOperation(env,'guild','alice',{action:'daily',requestId:crypto.randomUUID()});
  const custom=await serverPveOperation(env,'guild','alice',{action:'start',game:daily.game,level:daily.level,requestId:crypto.randomUUID()});
  const rows=db.prepare('SELECT session_id,jst_day FROM kp_duel_pve_daily_entries').all() as Array<{session_id:string;jst_day:string}>;
  assert.equal(rows.length,1);
  assert.equal(rows[0].session_id,daily.id);
  assert.match(rows[0].jst_day,/^\d{8}$/);
  const view=await duelHistoryRead(env,'guild','alice');
  assert.equal(view.today.started,1);
  assert.equal(view.sessions.length,2);
  assert.equal(view.sessions.find(x=>x.id===daily.id)?.dailyDay,rows[0].jst_day);
  assert.equal(view.sessions.find(x=>x.id===custom.id)?.dailyDay,null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_progress_receipts').get()?.n,0,
   'starting a challenge cannot create an unverified skill result');
 }finally{db.close();}
});
test('a saved daily requestId replay does not count twice, and other member has no history',async()=>{
 const {db,env}=fixture();
 try{
  const requestId=crypto.randomUUID();
  const first=await serverPveOperation(env,'g','alice',{action:'daily',requestId});
  const retry=await serverPveOperation(env,'g','alice',{action:'daily',requestId});
  assert.equal(retry.id,first.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_pve_daily_entries').get()?.n,1);
  assert.equal((await duelHistoryRead(env,'g','bob')).today.started,0);
  assert.equal((await duelHistoryRead(env,'foreign','alice')).sessions.length,0);
  assert.equal((await duelHistoryRead(env,'g','alice',{mode:'pvp'})).sessions.length,0);
  await assert.rejects(()=>duelHistoryRead(env,'g','alice',{mode:'invalid'}));
  await assert.rejects(()=>duelHistoryRead(env,'g','alice',{game:'unknown'}));
 }finally{db.close();}
});
test('verified historical rows are filtered by mode/game, not invented from completed sessions',async()=>{
 const {db,env}=fixture();
 try{
  const item=await serverPveOperation(env,'g','alice',{action:'start',game:'trio',level:'easy',requestId:crypto.randomUUID()});
  // A pre-existing custom session is not labeled daily solely for matching today's selection.
  for(const sql of DUEL_PROGRESSION_DDL)db.exec(sql);
  for(const sql of DUEL_REWARD_DDL)db.exec(sql);
  db.prepare('INSERT INTO kp_duel_progress_receipts(guild,match_id,user,mode,game,outcome,verified_version,occurred_at,applied_at) VALUES(?,?,?,?,?,?,?,?,?)')
   .run('g',item.id,'alice','pve','trio','win',4,100,100);
  db.prepare('INSERT INTO kp_duel_mode_skill(guild,user,mode,game,verified_games,wins,points,updated_at) VALUES(?,?,?,?,?,?,?,?)')
   .run('g','alice','pve','trio',1,1,1,100);
  const data=await duelHistoryRead(env,'g','alice',{mode:'pve',game:'trio'});
  assert.equal(data.history.length,1);
  assert.equal(data.history[0].dailyDay,null);
  assert.equal(data.skills.find(x=>x.game==='trio')?.wins,1);
  assert.equal((await duelHistoryRead(env,'g','alice',{mode:'pvp',game:'trio'})).history.length,0);
  assert.equal((await duelHistoryRead(env,'g','bob')).history.length,0);
 }finally{db.close();}
});

test('PvP-only history skips the PvE session query and preserves daily/skill outputs',async()=>{
 const {db,env}=fixture();
 try{
  const pve=await serverPveOperation(env,'guild','alice',
   {action:'start',game:'trio',level:'easy',requestId:crypto.randomUUID()});
  const normal=await duelHistoryRead(env,'guild','alice',{mode:'pve'});
  assert.equal(normal.sessions.some(x=>x.id===pve.id),true);
  const database=env as unknown as {DB:{prepare:(sql:string)=>unknown}};
  const original=database.DB.prepare;
  let sessionQueries=0;
  database.DB.prepare=(sql:string)=>{
   if(sql.includes('FROM kp_duel_pve_sessions s')){
    sessionQueries++;
    throw Error('PvP-only history must not read PvE session rows');
   }
   return original(sql);
  };
  const pvp=await duelHistoryRead(env,'guild','alice',{mode:'pvp'});
  assert.equal(sessionQueries,0);
  assert.deepEqual(pvp.sessions,[]);
  assert.equal(pvp.today.started,normal.today.started);
  assert.deepEqual(pvp.skills,normal.skills);
  assert.deepEqual(pvp.collection,normal.collection);
  assert.equal(pvp.filter.mode,'pvp');
 }finally{db.close();}
});

test('PvP receipts omit the daily PvE join without changing receipt values or PvE provenance',async()=>{
 const {db,env}=fixture();
 try{
  const daily=await serverPveOperation(env,'guild','alice',
   {action:'daily',requestId:crypto.randomUUID()});
  for(const sql of DUEL_PROGRESSION_DDL)db.exec(sql);
  for(const sql of DUEL_REWARD_DDL)db.exec(sql);
  const add=db.prepare(`INSERT INTO kp_duel_progress_receipts
   (guild,match_id,user,mode,game,opponent,outcome,verified_version,occurred_at,applied_at)
   VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const matchId=crypto.randomUUID();
  add.run('guild',matchId,'alice','pvp','trio','bob','win',3,200,200);
  add.run('guild',daily.id,'alice','pve',daily.game,null,'loss',2,100,100);
  const all=await duelHistoryRead(env,'guild','alice');
  assert.match(all.history.find(row=>row.id===daily.id)?.dailyDay??'',/^\d{8}$/,
   'real daily PvE receipt retains its recorded daily provenance');
  const database=env as unknown as {DB:{prepare:(sql:string)=>unknown}};
  const basePrepare=database.DB.prepare;
  let receiptStatements=0;
  database.DB.prepare=(sql:string)=>{
   if(sql.includes('FROM kp_duel_progress_receipts r')){
    receiptStatements++;
    assert.doesNotMatch(sql,/JOIN\s+kp_duel_pve_daily_entries/i,
     'PvP-only receipts must not read the PvE daily provenance table');
    assert.match(sql,/NULL AS daily_day/);
   }
   return basePrepare(sql);
  };
  const pvp=await duelHistoryRead(env,'guild','alice',{mode:'pvp',game:'trio'});
  assert.equal(receiptStatements,1);
  assert.equal(pvp.history.length,1);
  assert.deepEqual(pvp.history[0],{
   id:matchId,mode:'pvp',game:'trio',outcome:'win',at:200,dailyDay:null
  });
  assert.deepEqual(pvp.sessions,[]);
  assert.equal(pvp.today.started,all.today.started);
  database.DB.prepare=basePrepare;
  const pve=await duelHistoryRead(env,'guild','alice',{mode:'pve'});
  assert.equal(pve.history.length,1);
  assert.equal(pve.history[0].id,daily.id);
  assert.equal(pve.history[0].dailyDay,all.history.find(row=>row.id===daily.id)?.dailyDay);
 }finally{db.close();}
});

test('receipt filters use indexable equality predicates and keep all/mode/game results',async()=>{
 const {db,env}=fixture();
 try{
  await duelHistoryRead(env,'guild','alice');
  for(const sql of DUEL_PROGRESSION_DDL)db.exec(sql);
  for(const sql of DUEL_REWARD_DDL)db.exec(sql);
  const insert=db.prepare(`INSERT INTO kp_duel_progress_receipts
   (guild,match_id,user,mode,game,opponent,outcome,verified_version,occurred_at,applied_at)
   VALUES (?,?,?,?,?,?,?,?,?,?)`);
  insert.run('guild','m1','alice','pve','trio',null,'win',1,100,100);
  insert.run('guild','m2','alice','pve','othello',null,'loss',1,200,200);
  insert.run('guild','m3','alice','pvp','trio','bob','draw',1,300,300);
  insert.run('guild','m4','other','pvp','trio','bob','win',1,400,400);
  insert.run('elsewhere','m5','alice','pvp','trio','bob','win',1,500,500);
  const database=env as unknown as {DB:{prepare:(sql:string)=>unknown}};
  const original=database.DB.prepare;
  const statements:string[]=[];
  database.DB.prepare=(sql:string)=>{
   if(sql.includes('FROM kp_duel_progress_receipts r')){
    assert.doesNotMatch(sql,/\?\s*=\s*'all'/);
    assert.match(sql,/r.guild=\? AND r.user=\?/);
    statements.push(sql);
   }
   return original(sql);
  };
  const all=await duelHistoryRead(env,'guild','alice');
  const pvp=await duelHistoryRead(env,'guild','alice',{mode:'pvp'});
  const trio=await duelHistoryRead(env,'guild','alice',{game:'trio'});
  const pvpTrio=await duelHistoryRead(env,'guild','alice',{mode:'pvp',game:'trio'});
  const pveOthello=await duelHistoryRead(env,'guild','alice',{mode:'pve',game:'othello'});
  assert.deepEqual(all.history.map(x=>x.id),['m3','m2','m1']);
  assert.deepEqual(pvp.history.map(x=>x.id),['m3']);
  assert.deepEqual(trio.history.map(x=>x.id),['m3','m1']);
  assert.deepEqual(pvpTrio.history.map(x=>x.id),['m3']);
  assert.deepEqual(pveOthello.history.map(x=>x.id),['m2']);
  assert.equal(statements.length,5);
  assert.doesNotMatch(statements[0],/r\.mode=\?|r\.game=\?/);
  assert.match(statements[1],/r\.mode=\?/);
  assert.doesNotMatch(statements[1],/r\.game=\?/);
  assert.match(statements[2],/r\.game=\?/);
  assert.doesNotMatch(statements[2],/r\.mode=\?/);
  assert.match(statements[3],/r\.mode=\?/);
  assert.match(statements[3],/r\.game=\?/);
  assert.equal(pvpTrio.history[0].dailyDay,null);
  assert.deepEqual(all.filter,{mode:'all',game:'all'});
 }finally{db.close();}
});

test('PvE session history uses direct game predicate and preserves scoped session results',async()=>{
 const {db,env}=fixture();
 try{
  const trio=await serverPveOperation(env,'guild','alice',
   {action:'start',game:'trio',level:'easy',requestId:crypto.randomUUID()});
  const othello=await serverPveOperation(env,'guild','alice',
   {action:'start',game:'othello',level:'easy',requestId:crypto.randomUUID()});
  await serverPveOperation(env,'guild','bob',
   {action:'start',game:'trio',level:'easy',requestId:crypto.randomUUID()});
  await serverPveOperation(env,'other-guild','alice',
   {action:'start',game:'trio',level:'easy',requestId:crypto.randomUUID()});
  const database=env as unknown as {DB:{prepare:(sql:string)=>unknown}};
  const original=database.DB.prepare;
  const queries:string[]=[];
  database.DB.prepare=(sql:string)=>{
   if(sql.includes('FROM kp_duel_pve_sessions s')&&sql.includes('LEFT JOIN kp_duel_pve_daily_entries')){
    assert.doesNotMatch(sql,/\?\s*=\s*'all'|\?\s*=\s*'pve'/);
    assert.match(sql,/s.guild=\? AND s.user=\?/);
    queries.push(sql);
   }
   return original(sql);
  };
  const all=await duelHistoryRead(env,'guild','alice');
  const filtered=await duelHistoryRead(env,'guild','alice',{mode:'pve',game:'trio'});
  const pvp=await duelHistoryRead(env,'guild','alice',{mode:'pvp',game:'trio'});
  const other=await duelHistoryRead(env,'guild','bob',{mode:'pve'});
  assert.deepEqual(new Set(all.sessions.map(s=>s.id)),new Set([trio.id,othello.id]));
  assert.deepEqual(filtered.sessions.map(s=>s.id),[trio.id]);
  assert.deepEqual(other.sessions.map(s=>s.id).length,1);
  assert.deepEqual(pvp.sessions,[]);
  assert.equal(queries.length,3,'PvP skips the session query altogether');
  assert.doesNotMatch(queries[0],/s\.game=\?/);
  assert.match(queries[1],/s\.game=\?/);
  assert.doesNotMatch(queries[2],/s\.game=\?/);
  assert.equal(filtered.sessions[0].dailyDay,null);
 }finally{db.close();}
});


test('bounded receipt provenance join preserves newest 20, ties, access boundaries and daily labels',async()=>{
 const {db,env}=fixture();
 try{
  await duelHistoryRead(env,'g','alice');
  for(const sql of DUEL_PROGRESSION_DDL)db.exec(sql);
  for(const sql of DUEL_REWARD_DDL)db.exec(sql);
  const add=db.prepare(`INSERT INTO kp_duel_progress_receipts
   (guild,match_id,user,mode,game,opponent,outcome,verified_version,occurred_at,applied_at)
   VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const addDaily=db.prepare(`INSERT INTO kp_duel_pve_daily_entries
   (guild,user,session_id,jst_day,game,difficulty,created_at) VALUES(?,?,?,?,?,?,?)`);
  for(let i=0;i<75;i++){
   const match='m'+String(i).padStart(3,'0'),mode=i%3===0?'pve':'pvp';
   add.run('g',match,'alice',mode,'trio',mode==='pvp'?'bob':null,'win',1,1000+Math.floor(i/3),1000);
   if(mode==='pve' && i%2===0)
    addDaily.run('g','alice',match,'20261124','trio','easy',1000);
  }
  add.run('g','foreign-user','bob','pve','trio',null,'win',1,9999,9999);
  add.run('other','foreign-guild','alice','pve','trio',null,'win',1,9999,9999);
  add.run('g','not-applied','alice','pve','trio',null,'win',1,9999,null);
  const dbEnv=env as unknown as {DB:{prepare:(sql:string)=>unknown}};
  const original=dbEnv.DB.prepare;
  const statements:string[]=[];
  dbEnv.DB.prepare=(sql:string)=>{
   if(sql.includes('FROM kp_duel_progress_receipts r'))statements.push(sql);
   return original(sql);
  };
  for(const filter of [{},{mode:'pve'},{mode:'pvp'},{game:'trio'},{mode:'pve',game:'trio'}]){
   const view=await duelHistoryRead(env,'g','alice',filter);
   const sql=statements.at(-1)!;
   assert.match(sql,/ORDER BY r\.occurred_at DESC,r\.match_id DESC LIMIT \?/);
   assert.ok(sql.indexOf('LIMIT ?')<sql.indexOf('LEFT JOIN kp_duel_pve_daily_entries') ||
     filter.mode==='pvp','daily join must be applied only after a maximum of 20 receipts');
   const mode=filter.mode ?? 'all',game=filter.game ?? 'all';
   const old=`SELECT r.match_id,r.mode,r.game,r.outcome,r.occurred_at,
     ${mode==='pvp'?'NULL AS daily_day':'d.jst_day AS daily_day'}
     FROM kp_duel_progress_receipts r
     ${mode==='pvp'?'':'LEFT JOIN kp_duel_pve_daily_entries d ON d.guild=r.guild AND d.user=r.user AND d.session_id=r.match_id'}
     WHERE r.guild=? AND r.user=? AND r.applied_at IS NOT NULL
     ${mode==='all'?'':'AND r.mode=?'} ${game==='all'?'':'AND r.game=?'}
     ORDER BY r.occurred_at DESC,r.match_id DESC LIMIT 20`;
   const args=['g','alice',...(mode==='all'?[]:[mode]),...(game==='all'?[]:[game])];
   const expected=db.prepare(old).all(...args).map(row=>({
    id:row.match_id,mode:row.mode,game:row.game,outcome:row.outcome,
    at:row.occurred_at,dailyDay:row.daily_day
   }));
   assert.deepEqual(view.history,expected);
   assert.equal(view.history.length,20);
   assert.ok(view.history.every(x=>x.id!=='foreign-user'&&x.id!=='foreign-guild'&&x.id!=='not-applied'));
  }
  dbEnv.DB.prepare=original;
 }finally{db.close();}
});
