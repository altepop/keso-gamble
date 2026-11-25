import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';

// Same atomic admission predicate used in serverPveOperation; exercise with SQLite.
const legacy=`INSERT OR IGNORE INTO kp_duel_pve_sessions
 (id,guild,user,turn,updated_at) SELECT ?,?,?,'human',?
 WHERE (SELECT COUNT(*) FROM kp_duel_pve_sessions
 WHERE guild=? AND user=? AND turn='human' AND updated_at>?)<3`;
const bounded=`INSERT OR IGNORE INTO kp_duel_pve_sessions
 (id,guild,user,turn,updated_at) SELECT ?,?,?,'human',?
 WHERE (SELECT COUNT(*) FROM (SELECT 1 FROM kp_duel_pve_sessions
 WHERE guild=? AND user=? AND turn='human' AND updated_at>? LIMIT 3))<3`;
function seed(db:DatabaseSync){
 db.exec('CREATE TABLE kp_duel_pve_sessions(id TEXT PRIMARY KEY,guild TEXT,user TEXT,turn TEXT,updated_at INTEGER); CREATE INDEX kp_duel_pve_recent ON kp_duel_pve_sessions(guild,user,updated_at DESC)');
 const add=db.prepare('INSERT INTO kp_duel_pve_sessions VALUES(?,?,?,?,?)');
 for(let i=0;i<40;i++)add.run('old-'+i,'g','alice',i%2===0?'finished':'human',i);
 for(let i=0;i<10;i++)add.run('other-'+i,'different','alice','human',999+i);
 for(let i=0;i<10;i++)add.run('bob-'+i,'g','bob','human',999+i);
}
function attempt(sql:string,active:number,at:number){
 const db=new DatabaseSync(':memory:');try{
  seed(db);
  const insert=db.prepare('INSERT INTO kp_duel_pve_sessions VALUES(?,?,?,?,?)');
  for(let i=0;i<active;i++)insert.run('current-'+i,'g','alice','human',at+i+1);
  const args=['new','g','alice',at+100,'g','alice',at] as const;
  db.prepare(sql).run(...args);
  return {inserted:!!db.prepare("SELECT id FROM kp_duel_pve_sessions WHERE id='new'").get(),
   count:(db.prepare('SELECT count(*) AS n FROM kp_duel_pve_sessions').get() as {n:number}).n};
 }finally{db.close();}
}
test('bounded active-session admission is identical for zero, one, two, three and many qualifying rows',()=>{
 for(const n of [0,1,2,3,4,12]){
  const old=attempt(legacy,n,100);
  const next=attempt(bounded,n,100);
  assert.deepEqual(next,old,'active='+n);
  assert.equal(next.inserted,n<3);
 }
});
test('24h threshold strictness, stale/finished/other guild and other users never block',()=>{
 for(const boundary of [0,20,38,39,40,100]){
  // Seeded older rows may qualify when threshold is at or before 40.
  for(const n of [0,1,2,3]){
   assert.deepEqual(attempt(bounded,n,boundary),attempt(legacy,n,boundary));
  }
 }
});
test('query remains an indexed guild/user lookup and has explicit LIMIT 3 inside count',()=>{
 const db=new DatabaseSync(':memory:');try{
  seed(db);
  const detail=db.prepare("EXPLAIN QUERY PLAN SELECT count(*) FROM (SELECT 1 FROM kp_duel_pve_sessions WHERE guild=? AND user=? AND turn='human' AND updated_at>? LIMIT 3)").all('g','alice',100);
  assert.ok(detail.some(x=>String(x.detail).includes('kp_duel_pve_recent')));
  assert.match(bounded,/LIMIT 3\)\)<3/);
  assert.match(bounded,/COUNT\(\*\)/);
 }finally{db.close();}
});
