import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {allowedSpectator,isEligibleMainSpectator,readSpectatorMatch,SPECTATOR_STATUS_LIST_SQL} from '../src/duel-spectator-live.ts';
import type {BoardDuel} from '../src/board-duels.ts';
import type {KpMapping,KpEnv} from '../src/kp.ts';
const guild='606131625084059674',a='111111111111111111',b='222222222222222222';
const viewer='333333333333333333',id='11111111-2222-4333-8444-555555555555';
const now=Date.now();
const match:BoardDuel={id,guild,user_a:a,user_b:b,game:'othello',stake:100,status:'active',
 board:'.'.repeat(64),black_user:a,turn_user:a,winner:null,version:2,
 created_at:now-60000,updated_at:now-1000,deadline_at:now+60000};
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'Fixture#1',discordUserId:a}]};
function environment(registered:boolean,found:BoardDuel|null=match):KpEnv{
 const DB={
  prepare(sql:string){
   return {bind(...params:unknown[]){
    return {first:async()=>{
      if(sql.includes("board_duel_schema_version"))return {value:'2'};
      if(sql.includes("FROM kp_participants"))return registered?{user:viewer}:null;
      if(sql.includes("FROM kp_wallets w"))return registered?{'1':1}:null;
      if(sql.includes("FROM kp_board_duels WHERE guild"))return found;
      return null;
    }};
   },first:async()=>sql.includes("board_duel_schema_version")?{value:'2'}:null,run:async()=>({success:true})};
  },
  batch:async(statements:unknown[])=>statements.map(()=>({success:true})),
 } as unknown as D1Database;
 return {DB};
}
test('main-account observation needs server registry and real wallet',async()=>{
 assert.equal(await isEligibleMainSpectator(environment(true),mapping,viewer),true);
 assert.equal(await isEligibleMainSpectator(environment(false),mapping,viewer),false);
 assert.equal(await isEligibleMainSpectator(environment(true),mapping,'not-an-id'),false);
});
test('active same-guild public snapshots require no opponent approval',async()=>{
 const result=await readSpectatorMatch(environment(true),mapping,viewer,id,null);
 assert.equal(result.kind,'snapshot');
 if(result.kind==='snapshot'){
  assert.equal(result.snapshot.id,id);
  assert.equal(result.snapshot.publicState&&typeof result.snapshot.publicState==='object',true);
  assert.equal('private_hand' in result.snapshot,false);
 }
 await assert.rejects(readSpectatorMatch(environment(false),mapping,viewer,id,null),/spectator_unavailable/);
 await assert.rejects(readSpectatorMatch(environment(true),mapping,viewer,'bad',null),/spectator_unavailable/);
});
test('stale, cancelled or other-guild match is hidden; finished expires after one hour',()=>{
 assert.equal(allowedSpectator(viewer,guild,match,now),true);
 assert.equal(allowedSpectator(viewer,guild,{...match,guild:b},now),false);
 assert.equal(allowedSpectator(viewer,guild,{...match,status:'pending'},now),false);
 assert.equal(allowedSpectator(viewer,guild,{...match,status:'cancelled'},now),false);
 assert.equal(allowedSpectator(viewer,guild,{...match,status:'finished',updated_at:now-3600000},now),true);
 assert.equal(allowedSpectator(viewer,guild,{...match,status:'finished',updated_at:now-3600001},now),false);
});

test('P12 bounded status-union gives identical newest 25 spectator rooms with index-backed access',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE kp_board_duels(
   id TEXT,guild TEXT,game TEXT,status TEXT,user_a TEXT,user_b TEXT,
   version INTEGER,updated_at INTEGER,private_hand TEXT);
   CREATE INDEX kp_board_duels_retention ON kp_board_duels(guild,status,updated_at)`);
  const ins=db.prepare('INSERT INTO kp_board_duels VALUES(?,?,?,?,?,?,?,?,?)');
  const at=Date.parse('2026-11-24T00:00:00Z'),hour=60*60_000;
  for(let i=0;i<100;i++){
   const status=i%2===0?'active':'finished';
   ins.run('room'+String(i).padStart(3,'0'),guild,'othello',status,a,b,
    1,at-i*1000,'hidden');
  }
  ins.run('stale',guild,'othello','finished',a,b,1,at-hour-1,'hidden');
  ins.run('pending',guild,'othello','pending',a,b,1,at+1000,'hidden');
  ins.run('foreign','555555555555555555','othello','active',a,b,1,at+2000,'hidden');
  const oldSql=`SELECT id,guild,game,status,user_a,user_b,version,updated_at
   FROM kp_board_duels WHERE guild=? AND
   (status='active' OR (status='finished' AND updated_at>=?))
   ORDER BY updated_at DESC LIMIT 25`;
  const original=db.prepare(oldSql).all(guild,at-hour);
  const optimized=db.prepare(SPECTATOR_STATUS_LIST_SQL).all(guild,guild,at-hour);
  assert.deepEqual(optimized,original);
  assert.equal(optimized.length,25);
  assert.ok(optimized.every(r=>r.guild===guild&&(r.status==='active'||r.status==='finished')));
  assert.doesNotMatch(JSON.stringify(optimized),/hidden|foreign|pending|stale/);
  assert.doesNotMatch(SPECTATOR_STATUS_LIST_SQL,/private_hand|stake|secret|wallet|JOIN/i);
  const plan=db.prepare('EXPLAIN QUERY PLAN '+SPECTATOR_STATUS_LIST_SQL).all(guild,guild,at-hour);
  const explanations=plan.map(r=>String(r.detail)).join(' ');
  assert.match(explanations,/kp_board_duels_retention/);
  assert.match(explanations,/SEARCH kp_board_duels/);
 }finally{db.close();}
});
test('P12 spectator list includes recent finished at the exact one-hour cutoff and excludes older',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE kp_board_duels(id TEXT,guild TEXT,game TEXT,status TEXT,user_a TEXT,user_b TEXT,version INTEGER,updated_at INTEGER);CREATE INDEX kp_board_duels_retention ON kp_board_duels(guild,status,updated_at)');
  const cutoff=Date.parse('2026-11-24T00:00:00Z');
  const i=db.prepare('INSERT INTO kp_board_duels VALUES(?,?,?,?,?,?,?,?)');
  i.run('boundary',guild,'gomoku','finished',a,b,1,cutoff);
  i.run('older',guild,'gomoku','finished',a,b,1,cutoff-1);
  i.run('active',guild,'gomoku','active',a,b,1,cutoff-100);
  assert.deepEqual(
   db.prepare(SPECTATOR_STATUS_LIST_SQL).all(guild,guild,cutoff).map(r=>r.id),
   ['boundary','active']);
 }finally{db.close();}
});
