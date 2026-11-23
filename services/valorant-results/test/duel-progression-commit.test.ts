import {DUEL_REWARD_DDL} from '../src/duel-rewards.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {DUEL_PROGRESSION_DDL} from '../src/duel-progression-schema.ts';
import {DUEL_PVP_FINALIZATION_TRIGGERS,ensureVerifiedPvpProgression} from '../src/duel-progression-commit.ts';
import {DUEL_PROGRESSION_GAMES} from '../src/duel-progression.ts';

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE kp_board_duels(
  id TEXT PRIMARY KEY,guild TEXT NOT NULL,user_a TEXT NOT NULL,user_b TEXT NOT NULL,
  game TEXT NOT NULL,status TEXT NOT NULL,board TEXT NOT NULL,
  turn_user TEXT,winner TEXT,version INTEGER NOT NULL,updated_at INTEGER NOT NULL
 );
 CREATE TABLE kp_board_duel_actions(
  id TEXT PRIMARY KEY,duel_id TEXT NOT NULL,guild TEXT NOT NULL,kind TEXT NOT NULL,
  actor TEXT NOT NULL,version INTEGER NOT NULL,at INTEGER NOT NULL,
  board TEXT,next_turn TEXT,winner TEXT
 );`);
 for(const sql of [...DUEL_PROGRESSION_DDL,...DUEL_PVP_FINALIZATION_TRIGGERS])db.exec(sql);
 return db;
}
function seed(db:DatabaseSync,duelId:string,game:string,version=3){
 db.prepare(`INSERT INTO kp_board_duels
 (id,guild,user_a,user_b,game,status,board,turn_user,winner,version,updated_at)
 VALUES(?,'g','alice','bob',?,'active','before','alice',NULL,?,100)`)
 .run(duelId,game,version);
}
function terminal(db:DatabaseSync,id:string,kind='move',winner='alice',
 opts:{actor?:string;board?:string;version?:number;at?:number;commit?:boolean}={}){
 const row=db.prepare('SELECT * FROM kp_board_duels WHERE id=?').get(id) as Record<string,any>;
 const version=opts.version??Number(row.version),at=opts.at??101;
 const board=opts.board??'after';
 db.exec('BEGIN');
 try{
  db.prepare(`INSERT INTO kp_board_duel_actions
   (id,duel_id,guild,kind,actor,version,at,board,next_turn,winner)
   VALUES(?,?,?,?,?,?,?, ?, NULL, ?)`)
   .run('action-'+id,id,'g',kind,opts.actor??'alice',version,at,board,winner);
  db.prepare(`UPDATE kp_board_duels SET status='finished',board='after',
   winner=?,version=version+1,updated_at=? WHERE id=?`).run(winner,at,id);
  db.exec(opts.commit===false?'ROLLBACK':'COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}
function receiptCount(db:DatabaseSync){
 return Number((db.prepare('SELECT COUNT(*) AS n FROM kp_duel_progress_receipts').get() as {n:number}).n);
}
test('all seven confirmed natural PvP finals record both players exactly once',()=>{
 const db=fixture();
 try{
  for(const [i,game] of DUEL_PROGRESSION_GAMES.entries()){
   const id='00000000-0000-4000-8000-'+String(i+1).padStart(12,'0');
   seed(db,id,game);terminal(db,id,'move',i%2===0?'alice':'draw');
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_progress_receipts WHERE match_id=?').get(id)?.n,2);
  }
  assert.equal(receiptCount(db),14);
  for(const game of DUEL_PROGRESSION_GAMES){
   const skill=db.prepare(`SELECT * FROM kp_duel_mode_skill WHERE guild='g' AND user='alice' AND mode='pvp' AND game=?`).get(game) as Record<string,number>;
   assert.equal(skill.verified_games,1);
   assert.equal(skill.wins+skill.losses+skill.draws,1);
   assert.equal(skill.points,i%2===0?14:4,'verified win/draw scores use the new PvP progression scale');
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM kp_duel_mode_skill WHERE mode='pve'").get()?.n,0);
 }finally{db.close();}
});
test('replayed identical terminal update never doubles receipts or skill',()=>{
 const db=fixture();
 try{
  const id='00000000-0000-4000-8000-000000000111';
  seed(db,id,'othello');terminal(db,id);
  const before=db.prepare('SELECT * FROM kp_duel_mode_skill WHERE user=?').get('alice');
  db.prepare("UPDATE kp_board_duels SET status='finished',version=version+1 WHERE id=?").run(id);
  assert.equal(receiptCount(db),2);
  assert.deepEqual(db.prepare('SELECT * FROM kp_duel_mode_skill WHERE user=?').get('alice'),before);
 }finally{db.close();}
});
test('resign, timeout, nonterminal and actor/board mismatch do not mint progress',()=>{
 const db=fixture();
 try{
  for(const [i,kind] of ['resign','timeout','move','move'].entries()){
   const id='00000000-0000-4000-8000-'+String(i+201).padStart(12,'0');
   seed(db,id,'poker');
   const extra=i===2?{actor:'intruder'}:i===3?{board:'different'}:{};
   terminal(db,id,kind,'alice',extra);
  }
  assert.equal(receiptCount(db),0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_mode_skill').get()?.n,0);
 }finally{db.close();}
});
test('failed or rolled-back move does not preserve completion, KP-adjacent or skill writes',()=>{
 const db=fixture();
 try{
  const id='00000000-0000-4000-8000-000000000333';
  seed(db,id,'gomoku');terminal(db,id,'move','alice',{commit:false});
  assert.equal(receiptCount(db),0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_mode_skill').get()?.n,0);
  assert.equal(db.prepare('SELECT status FROM kp_board_duels WHERE id=?').get(id)?.status,'active');
 }finally{db.close();}
});
test('trigger installation is idempotent for the same server D1 handle',async()=>{
 const db=new DatabaseSync(':memory:');
 let ddlRuns=0;
 try{
  db.exec(`CREATE TABLE kp_board_duels(id TEXT);
   CREATE TABLE kp_board_duel_actions(id TEXT);`);
  const env={DB:{prepare(sql:string){return {run:async()=>{ddlRuns++;db.exec(sql);},bind:(...args:unknown[])=>({first:async()=>db.prepare(sql).get(...args as [])}),sql};},batch:async(statements:Array<{sql:string}>)=>{for(const item of statements){ddlRuns++;db.exec(item.sql);}return [];}}};
  await Promise.all([ensureVerifiedPvpProgression(env as never),ensureVerifiedPvpProgression(env as never)]);
  await ensureVerifiedPvpProgression(env as never);
  assert.equal(ddlRuns,DUEL_PROGRESSION_DDL.length+DUEL_REWARD_DDL.length+DUEL_PVP_FINALIZATION_TRIGGERS.length);
 }finally{db.close();}
});

test('PvP victory, defeat and draw gain 14, 0 and 4 without affecting win/loss counters',()=>{
 const db=fixture();
 try{
  const outcomes=['alice','bob','draw'] as const;
  for(const [n,winner] of outcomes.entries()){
   const id='00000000-0000-4000-8000-'+String(900+n).padStart(12,'0');
   seed(db,id,'trio');terminal(db,id,'move',winner);
  }
  const alice=db.prepare("SELECT * FROM kp_duel_mode_skill WHERE mode='pvp' AND game='trio' AND user='alice'").get() as Record<string,number>;
  const bob=db.prepare("SELECT * FROM kp_duel_mode_skill WHERE mode='pvp' AND game='trio' AND user='bob'").get() as Record<string,number>;
  assert.equal(alice.points,18);assert.equal(bob.points,18);
  assert.equal(alice.peak_points,18);assert.equal(bob.peak_points,18);
  assert.deepEqual([alice.wins,alice.losses,alice.draws,alice.verified_games],[1,1,1,3]);
  assert.deepEqual([bob.wins,bob.losses,bob.draws,bob.verified_games],[1,1,1,3]);
 }finally{db.close();}
});
test('reinstalling PvP progression trigger never replays saved points',()=>{
 const db=fixture();
 try{
  const id='00000000-0000-4000-8000-000000005001';
  seed(db,id,'gomoku');terminal(db,id,'move','alice');
  db.exec(DUEL_PVP_FINALIZATION_TRIGGERS[0]);
  db.exec(DUEL_PVP_FINALIZATION_TRIGGERS[1]);
  assert.equal(db.prepare("SELECT points FROM kp_duel_mode_skill WHERE user='alice' AND game='gomoku'").get()?.points,14);
  const next='00000000-0000-4000-8000-000000005002';
  seed(db,next,'gomoku');terminal(db,next,'move','draw');
  assert.equal(db.prepare("SELECT points FROM kp_duel_mode_skill WHERE user='alice' AND game='gomoku'").get()?.points,18);
  assert.equal(receiptCount(db),4);
 }finally{db.close();}
});
