import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {DUEL_PVE_SESSION_DDL} from '../src/duel-pve-sessions.ts';
import {DUEL_PROGRESSION_DDL} from '../src/duel-progression-schema.ts';
import {DUEL_PVE_PROGRESSION_TRIGGERS} from '../src/duel-pve-progression.ts';
import {DUEL_PROGRESSION_GAMES} from '../src/duel-progression.ts';
function database(){
 const db=new DatabaseSync(':memory:');
 for(const sql of [...DUEL_PVE_SESSION_DDL,...DUEL_PROGRESSION_DDL,...DUEL_PVE_PROGRESSION_TRIGGERS])db.exec(sql);
 return db;
}
function create(db:DatabaseSync,id:string,game:string){
 db.prepare(`INSERT INTO kp_duel_pve_sessions
  (id,guild,user,request_id,game,difficulty,board,turn,winner,version,human_moves,cpu_moves,created_at,updated_at)
  VALUES(?,'g','alice',? ,?,'strong','old','human',NULL,0,0,0,1,1)`).run(id,'request-'+id,game);
}
function finish(db:DatabaseSync,id:string,winner:'human'|'cpu'|'draw',args:{board?:string;time?:number;version?:number;commit?:boolean}={}){
 const board=args.board??'new',time=args.time??200;
 db.exec('BEGIN');
 try{
  db.prepare(`INSERT INTO kp_duel_pve_actions
   (id,guild,user,session_id,expected_version,at,board,turn,winner,human_moves,cpu_moves)
   VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run('action-'+id,'g','alice',id,args.version??0,time,board,'finished',winner,1,1);
  db.prepare(`UPDATE kp_duel_pve_sessions SET
   board=?,turn='finished',winner=?,human_moves=1,cpu_moves=1,
   version=version+1,updated_at=? WHERE id=?`).run(board,winner,time,id);
  db.exec(args.commit===false?'ROLLBACK':'COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
test('every game records server-certified natural PvE final exactly once',()=>{
 const db=database();
 try{
  for(const [i,game] of DUEL_PROGRESSION_GAMES.entries()){
   const id='00000000-0000-4000-8000-'+String(i+1).padStart(12,'0');
   create(db,id,game);
   const winner=i%3===0?'human':i%3===1?'cpu':'draw';
   finish(db,id,winner);
   const receipt=db.prepare("SELECT * FROM kp_duel_progress_receipts WHERE match_id=? AND mode='pve'").get(id) as Record<string,unknown>;
   assert.equal(receipt.game,game);
   assert.equal(receipt.opponent,null);
   assert.equal(receipt.outcome,winner==='human'?'win':winner==='cpu'?'loss':'draw');
   const row=db.prepare("SELECT * FROM kp_duel_mode_skill WHERE guild='g' AND user='alice' AND mode='pve' AND game=?").get(game) as Record<string,number>;
   assert.equal(row.verified_games,1);
   assert.equal(row.wins+row.losses+row.draws,1);
   assert.equal(row.points,row.wins);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM kp_duel_progress_receipts WHERE mode='pve'").get()?.n,6);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM kp_duel_mode_skill WHERE mode='pvp'").get()?.n,0);
 }finally{db.close();}
});
test('duplicate display updates cannot mint additional receipts',()=>{
 const db=database();
 try{
  const id='00000000-0000-4000-8000-000000000009';
  create(db,id,'poker');finish(db,id,'human');
  db.prepare("UPDATE kp_duel_pve_sessions SET version=version+1 WHERE id=?").run(id);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM kp_duel_progress_receipts").get()?.n,1);
  assert.equal(db.prepare("SELECT verified_games FROM kp_duel_mode_skill WHERE mode='pve'").get()?.verified_games,1);
 }finally{db.close();}
});
test('failed or rolled-back PvE action cannot create progress',()=>{
 const db=database();
 try{
  const id='00000000-0000-4000-8000-000000000010';
  create(db,id,'othello');finish(db,id,'human',{commit:false});
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM kp_duel_progress_receipts").get()?.n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM kp_duel_mode_skill").get()?.n,0);
  assert.equal(db.prepare("SELECT turn FROM kp_duel_pve_sessions WHERE id=?").get(id)?.turn,'human');
 }finally{db.close();}
});
test('manipulated action versions and stale board do not generate PvE progress',()=>{
 const db=database();
 try{
  const id='00000000-0000-4000-8000-000000000011';
  create(db,id,'connect4');
  assert.throws(()=>finish(db,id,'human',{version:5}),/version conflict/i);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_progress_receipts').get()?.n,0);
 }finally{db.close();}
});
