import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PVP_INVITE_FULL_SQL} from '../src/board-duels.ts';
const legacy="SELECT COUNT(*) AS n FROM kp_board_duels WHERE guild=? AND user_a=? AND status='pending' AND deadline_at>?";
test('third pending outgoing invitation is equivalent to legacy count across all cap boundaries',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE kp_board_duels(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user_a TEXT NOT NULL,user_b TEXT NOT NULL,game TEXT NOT NULL CHECK(game IN ('othello','gomoku','connect4','hitblow','bluffdice','poker','trio')),stake INTEGER NOT NULL CHECK(stake BETWEEN 100 AND 100000),status TEXT NOT NULL CHECK(status IN ('pending','active','finished','cancelled')),board TEXT NOT NULL,black_user TEXT,turn_user TEXT,winner TEXT,version INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,CHECK(user_a!=user_b));
   CREATE INDEX kp_board_duels_a ON kp_board_duels(guild,user_a,updated_at DESC);
   CREATE INDEX kp_board_duels_b ON kp_board_duels(guild,user_b,updated_at DESC);
   CREATE INDEX kp_board_duels_expiry ON kp_board_duels(guild,status,deadline_at);
   CREATE INDEX kp_board_duels_retention ON kp_board_duels(guild,status,updated_at);`);
  const insert=db.prepare("INSERT INTO kp_board_duels(id,guild,user_a,user_b,game,stake,status,board,created_at,updated_at,deadline_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
  for(const n of [0,1,2,3,4,100,1000]){
   for(let i=0;i<n;i++)insert.run(n+'-'+i,'g','u'+n,'opponent','trio',100,'pending','{}',0,i,1001);
   insert.run('expired-'+n,'g','u'+n,'opponent','trio',100,'pending','{}',0,0,1000);
   insert.run('finished-'+n,'g','u'+n,'opponent','trio',100,'finished','{}',0,0,1001);
   insert.run('incoming-'+n,'g','opponent','u'+n,'trio',100,'pending','{}',0,0,1001);
   insert.run('foreign-'+n,'other','u'+n,'opponent','trio',100,'pending','{}',0,0,1001);
  }
  for(let i=0;i<1000;i++)insert.run('noise-'+i,i%2?'g':'other','noise','u1000','trio',100,i%3?'pending':'finished','{}',0,i,i%5?1001:1000);
  for(const n of [0,1,2,3,4,100,1000]){
   const old=db.prepare(legacy).get('g','u'+n,1000) as {n:number};
   const current=db.prepare(PVP_INVITE_FULL_SQL).get('g','u'+n,1000);
   assert.equal(old.n,n);
   assert.equal(current?.full===1,old.n>=3);
  }
  assert.match(PVP_INVITE_FULL_SQL,/LIMIT 1 OFFSET 2$/);
 }finally{db.close();}
});
