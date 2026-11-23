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
function create(db:DatabaseSync,id:string,game:string,level:'easy'|'normal'|'strong'='strong'){
 db.prepare(`INSERT INTO kp_duel_pve_sessions
  (id,guild,user,request_id,game,difficulty,board,turn,winner,version,human_moves,cpu_moves,created_at,updated_at)
  VALUES(?,'g','alice',?,? ,?,'old','human',NULL,0,0,0,1,1)`).run(id,'request-'+id,game,level);
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
   assert.equal(row.points,winner==='human'?16:winner==='draw'?4:0);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM kp_duel_progress_receipts WHERE mode='pve'").get()?.n,7);
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

test('PvE skill rewards vary by server-stored CPU level, preserve stats, and accumulate over 10 games',()=>{
 const db=database();
 try{
  const levels=['easy','normal','strong'] as const;
  const winDelta=[8,12,16],drawDelta=[2,3,4];
  let i=1000;
  for(let level=0;level<levels.length;level++){
   for(let outcome=0;outcome<3;outcome++){
    const id='00000000-0000-4000-8000-'+String(++i).padStart(12,'0');
    create(db,id,'othello',levels[level]);
    finish(db,id,(outcome===0?'human':outcome===1?'cpu':'draw'));
   }
  }
  const skill=db.prepare("SELECT * FROM kp_duel_mode_skill WHERE mode='pve' AND game='othello'").get() as Record<string,number>;
  assert.equal(skill.points,winDelta.reduce((a,b)=>a+b,0)+drawDelta.reduce((a,b)=>a+b,0));
  assert.equal(skill.peak_points,skill.points);
  assert.equal(skill.verified_games,9);
  assert.equal(skill.wins,3);assert.equal(skill.losses,3);assert.equal(skill.draws,3);
  for(let n=0;n<10;n++){
   const id='00000000-0000-4000-8000-'+String(++i).padStart(12,'0');
   create(db,id,'gomoku','normal');finish(db,id,'human');
  }
  const ten=db.prepare("SELECT points,peak_points,verified_games FROM kp_duel_mode_skill WHERE mode='pve' AND game='gomoku'").get() as Record<string,number>;
  assert.deepEqual(ten,{points:120,peak_points:120,verified_games:10});
 }finally{db.close();}
});

test('PvE rollout replaces legacy trigger without replaying existing receipt points',()=>{
 const db=database();
 try{
  const id='00000000-0000-4000-8000-000000004001';
  create(db,id,'trio','strong');finish(db,id,'human');
  assert.equal(db.prepare("SELECT points FROM kp_duel_mode_skill WHERE game='trio'").get()?.points,16);
  // Repeat rollout: replacement is idempotent for already-applied receipts.
  db.exec(DUEL_PVE_PROGRESSION_TRIGGERS[0]);
  db.exec(DUEL_PVE_PROGRESSION_TRIGGERS[1]);
  const saved=db.prepare("SELECT points,verified_games FROM kp_duel_mode_skill WHERE game='trio'").get();
  assert.deepEqual(saved,{points:16,verified_games:1});
  const next='00000000-0000-4000-8000-000000004002';
  create(db,next,'trio','easy');finish(db,next,'human');
  assert.equal(db.prepare("SELECT points FROM kp_duel_mode_skill WHERE game='trio'").get()?.points,24);
 }finally{db.close();}
});
