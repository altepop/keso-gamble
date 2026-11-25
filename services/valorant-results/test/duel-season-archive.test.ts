import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {shouldArchiveDuelSeason,archivePreviousDuelSeason,listDuelSeasonArchive,ensureDuelSeasonArchive} from '../src/duel-season-archive.ts';
const guild='606131625084059674';
const a='633269291831132161',b='606131625084059675';
function sqliteEnv(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE kp_board_duels(id TEXT,guild TEXT,user_a TEXT,user_b TEXT,winner TEXT,status TEXT,updated_at INTEGER)`);
 const queries:string[]=[];
 const DB={prepare(sql:string){
  queries.push(sql);const stmt=db.prepare(sql);
  return {run:async()=>stmt.run(),bind:(...args:unknown[])=>({
   run:async()=>stmt.run(...args as []),
   first:async()=>stmt.get(...args as []),
   all:async()=>({results:stmt.all(...args as [])}),
  })};
 }};
 return {db,env:{DB} as never,queries};
}
test('archive cron fires exactly at Monday 00:10 JST',()=>{
 const monday=Date.parse('2026-11-22T15:10:00Z');
 assert.equal(shouldArchiveDuelSeason(monday),true);
 assert.equal(shouldArchiveDuelSeason(monday-60000),false);
 assert.equal(shouldArchiveDuelSeason(monday+60000),false);
 assert.equal(shouldArchiveDuelSeason(monday+7*86400000),true);
 assert.equal(shouldArchiveDuelSeason(-1),false);
});
test('immutable archive persists finished weekly rankings once despite retries and cleanup',async()=>{
 const {db,env}=sqliteEnv();
 try{
  const scheduled=Date.parse('2026-11-22T15:10:00Z');
  const when=scheduled-20*60000;
  db.prepare("INSERT INTO kp_board_duels VALUES(?,?,?,?,?,'finished',?)").run('a',guild,a,b,a,when);
  db.prepare("INSERT INTO kp_board_duels VALUES(?,?,?,?,?,'finished',?)").run('b',guild,a,b,'draw',when);
  db.prepare("INSERT INTO kp_board_duels VALUES(?,?,?,?,?,'finished',?)").run('external','606131625084059677',a,b,a,when);
  const saved=await archivePreviousDuelSeason(env,guild,scheduled);
  assert.deepEqual(saved,{status:'archived',seasonId:'2026-11-16',sampledMatches:2});
  assert.equal((await archivePreviousDuelSeason(env,guild,scheduled)).status,'already-archived');
  db.exec('DELETE FROM kp_board_duels');
  const archive=await listDuelSeasonArchive(env,guild);
  assert.equal(archive.seasons.length,1);
  assert.equal(archive.seasons[0].id,'2026-11-16');
  assert.equal(archive.seasons[0].sampledMatches,2);
  assert.equal((archive.seasons[0].rankings as {user:string;wins:number;draws:number}[])[0].user,a);
  assert.equal(archive.completeRestoreBackup,false);
  assert.equal(archive.rewardsGranted,false);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM kp_duel_season_archive').get() as {n:number}).n,1);
 }finally{db.close();}
});
test('archive never invents complete standings if match count reaches the cap',async()=>{
 const {db,env}=sqliteEnv();
 try{
  const scheduled=Date.parse('2026-11-22T15:10:00Z');
  const insert=db.prepare("INSERT INTO kp_board_duels VALUES(?,?,?,?,?,'finished',?)");
  for(let i=0;i<500;i++)insert.run(String(i),guild,a,b,a,scheduled-20*60000);
  const outcome=await archivePreviousDuelSeason(env,guild,scheduled);
  assert.equal(outcome.status,'blocked-partial');
  const stored=await listDuelSeasonArchive(env,guild);
  assert.deepEqual(stored.seasons,[]);
 }finally{db.close();}
});
test('reject invalid owner scope or off-schedule archive before touching DB',async()=>{
 const {db,env,queries}=sqliteEnv();
 try{
  const at=Date.parse('2026-11-22T15:10:00Z');
  await assert.rejects(archivePreviousDuelSeason(env,'invalid',at));
  await assert.rejects(archivePreviousDuelSeason(env,guild,at+60000));
  assert.equal(queries.length,0);
  await assert.rejects(listDuelSeasonArchive(env,'bad'));
  await ensureDuelSeasonArchive(env);
 }finally{db.close();}
});
