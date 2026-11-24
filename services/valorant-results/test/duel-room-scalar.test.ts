import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {BOARD_DUEL_ROOM_SQL} from '../src/board-duels.ts';

const legacy=`SELECT d.*,
   CASE WHEN d.black_user=? THEN json_extract(s.data,'$.privateA')
        ELSE json_extract(s.data,'$.privateB') END AS private_hand
   FROM kp_board_duels d LEFT JOIN kp_board_duel_secrets s ON s.guild=d.guild AND s.id=d.id
   WHERE d.guild=? AND d.id=? AND (d.user_a=? OR d.user_b=?)`;
test('room scalar projection preserves all columns, both private hands and participant/guild boundaries',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE kp_board_duels(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user_a TEXT NOT NULL,user_b TEXT NOT NULL,
   game TEXT NOT NULL CHECK(game IN ('othello','gomoku','connect4','hitblow','bluffdice','poker','trio')),
   stake INTEGER NOT NULL CHECK(stake BETWEEN 100 AND 100000),status TEXT NOT NULL CHECK(status IN ('pending','active','finished','cancelled')),
   board TEXT NOT NULL,black_user TEXT,turn_user TEXT,winner TEXT,version INTEGER NOT NULL DEFAULT 0,
   created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,CHECK(user_a!=user_b));
   CREATE TABLE kp_board_duel_secrets(id TEXT PRIMARY KEY,guild TEXT NOT NULL,data TEXT NOT NULL);
   CREATE INDEX kp_board_duels_a ON kp_board_duels(guild,user_a,updated_at DESC);
   CREATE INDEX kp_board_duels_b ON kp_board_duels(guild,user_b,updated_at DESC);
   CREATE INDEX kp_board_duels_expiry ON kp_board_duels(guild,status,deadline_at);
   CREATE INDEX kp_board_duels_retention ON kp_board_duels(guild,status,updated_at);`);
  const put=db.prepare('INSERT INTO kp_board_duels VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const secret=db.prepare('INSERT INTO kp_board_duel_secrets VALUES(?,?,?)');
  const prev=db.prepare(legacy),next=db.prepare(BOARD_DUEL_ROOM_SQL);
  for(let i=0;i<1000;i++){
   const g=i<900?'g':'other',a=i<800||i>=900?'alice':'bob',id='d'+i;
   put.run(id,g,a,'opponent',i%2?'poker':'trio',100,'active','{}',a,a,null,1,i,i,i+10000);
   if(i%3)secret.run(id,g,JSON.stringify({privateA:'A'+id,privateB:'B'+id}));
   for(const u of [a,'opponent','outsider']){
    const args=[u,g,id,u,u] as const;
    const rows=next.all(...args);
    assert.deepEqual(rows,prev.all(...args));
    if(u==='outsider')assert.equal(rows.length,0);
    else assert.equal(rows[0].private_hand,i%3?(u===a?'A':'B')+id:null);
   }
   assert.deepEqual(next.all(a,g==='g'?'other':'g',id,a,a),[]);
  }
  db.prepare("UPDATE kp_board_duel_secrets SET guild='other' WHERE id='d1'").run();
  assert.deepEqual(next.all('alice','g','d1','alice','alice'),prev.all('alice','g','d1','alice','alice'));
  assert.equal(next.get('alice','g','d1','alice','alice')?.private_hand,null);
  assert.deepEqual(next.all('alice','g','missing','alice','alice'),[]);
  // Null black_user and absent JSON key follow the legacy CASE and NULL semantics.
  db.prepare("UPDATE kp_board_duels SET black_user=NULL WHERE id='d2'").run();
  db.prepare("UPDATE kp_board_duel_secrets SET data='{}' WHERE id='d2'").run();
  assert.deepEqual(next.all('alice','g','d2','alice','alice'),prev.all('alice','g','d2','alice','alice'));
  assert.equal(next.get('alice','g','d2','alice','alice')?.private_hand,null);
  const plan=db.prepare('EXPLAIN QUERY PLAN '+BOARD_DUEL_ROOM_SQL).all('alice','g','d1','alice','alice').map(r=>String(r.detail)).join(' ');
  assert.match(plan,/SEARCH d USING INDEX sqlite_autoindex_kp_board_duels_1/);
  assert.match(plan,/SEARCH s USING INDEX sqlite_autoindex_kp_board_duel_secrets_1/);
  assert.doesNotMatch(plan,/SCAN [ds]\b/);
 }finally{db.close();}
});
