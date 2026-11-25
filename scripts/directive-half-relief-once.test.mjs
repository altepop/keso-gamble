import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {CUTOFF,SNAPSHOT,APPLY,VERIFY,planRefunds,runOnce} from './directive-retro-refund-once.mjs';
const H=3600000,T=CUTOFF-100*H,N=CUTOFF+H;
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE kp_directives(id TEXT PRIMARY KEY,guild TEXT,issuer TEXT,target TEXT,task TEXT,cost INTEGER,status TEXT,at INTEGER);
 CREATE TABLE kp_accounts(guild TEXT,user TEXT,riot TEXT,puuid TEXT,linked_at INTEGER);
 CREATE TABLE tracked_players(riot_id TEXT PRIMARY KEY,puuid TEXT,since INTEGER);
 CREATE TABLE kp_ledger(id TEXT PRIMARY KEY,guild TEXT,user TEXT,delta INTEGER,kind TEXT,at INTEGER);
 CREATE TABLE kp_wallets(guild TEXT,user TEXT,balance INTEGER,version INTEGER,PRIMARY KEY(guild,user));
 CREATE TRIGGER kp_ledger_apply AFTER INSERT ON kp_ledger BEGIN UPDATE kp_wallets SET balance=balance+NEW.delta,version=version+1 WHERE guild=NEW.guild AND user=NEW.user;SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'KP wallet missing') END;END;
 CREATE TABLE kp_directive_completions(directive_id TEXT PRIMARY KEY,match_id TEXT,ended_at INTEGER);
 CREATE TABLE kp_directive_transfers(directive_id TEXT PRIMARY KEY);
 CREATE TABLE notifications(riot_id TEXT,match_id TEXT,ended_at INTEGER,mode TEXT,PRIMARY KEY(riot_id,match_id));
 CREATE TABLE kp_events(id TEXT PRIMARY KEY,guild TEXT,user TEXT,puuid TEXT,match TEXT,mode TEXT,at INTEGER,UNIQUE(guild,match,puuid));
 CREATE TABLE coach_member_queue(match_id TEXT PRIMARY KEY,started_at INTEGER);
 CREATE TABLE valorant_match_rosters(match_id TEXT PRIMARY KEY,ended_at INTEGER,players_json TEXT);
 CREATE TABLE death_unrated_sessions(riot_id TEXT,match_id TEXT,session_id TEXT,cancelled_at INTEGER,armed_at INTEGER);
 CREATE TABLE monitor_state(key TEXT PRIMARY KEY,value TEXT);
 INSERT INTO kp_wallets VALUES('g','issuer0001',1000000,0);`);
 const q=(sql,...p)=>db.prepare(sql).run(...p);
 function add(id,{task='competitive',status='completed',cost=38001,elapsed=49,exact=false,archive=true,receipt=true,missing=false,prior=false,solo=false}={}){
  const user='target'+id,riot='riot'+id,puuid='p'+id,match='match'+id,end=T+elapsed*H;
  q('INSERT INTO kp_directives VALUES(?,?,?,?,?,?,?,?)',id,'g','issuer0001',user,task,cost,status,T);
  q('INSERT INTO kp_ledger VALUES(?,?,?,?,?,?)','op:'+id,'g','issuer0001',-cost,'game',T);
  q('INSERT INTO kp_accounts VALUES(?,?,?,?,?)','g',user,riot,puuid,T-H);
  q('INSERT INTO tracked_players VALUES(?,?,?)',riot,puuid,T-H);
  q('INSERT INTO notifications VALUES(?,?,?,?)',riot,match,end,task.includes('competitive')?'competitive':'unrated');
  if(receipt)q('INSERT INTO kp_events VALUES(?,?,?,?,?,?,?)','event'+id,'g',user,puuid,match,task.includes('competitive')?'competitive':'unrated',end+1000);
  if(archive){q('INSERT INTO coach_member_queue VALUES(?,?)',match,end-1800000);const p=Array.from({length:10},(_,i)=>({puuid:i===0?puuid:'other'+i,team_id:i<5?'a':'b',party_id:solo?'solo'+i:'party'}));q('INSERT INTO valorant_match_rosters VALUES(?,?,?)',match,end,JSON.stringify(p));}
  if(exact)q('INSERT INTO kp_directive_completions VALUES(?,?,?)',id,match,end);
  if(missing)q('INSERT INTO kp_events VALUES(?,?,?,?,?,?,?)','orphan'+id,'g',user,puuid,'missing'+id,'competitive',T+2*H);
  if(prior)q('INSERT INTO kp_ledger VALUES(?,?,?,?,?,?)','directive-refund-1:'+id,'g','issuer0001',Math.floor(cost/2),'directive-refund',T+24*H);
 }
 const query=async(sql,args)=>db.prepare(sql).all(...args);
 return {db,add,query};
}
test('real SQLite: stages, exact receipt, legacy proof, insufficient evidence, no active payout, replay',async()=>{
 const {db,add,query}=fixture();
 try{
  add('full');add('half',{elapsed:24});add('early',{elapsed:23});add('remaining',{prior:true});
  add('exact',{task:'unrated',exact:true,archive:false});add('active',{status:'active'});
  add('missing',{missing:true});add('noarchive',{archive:false});add('noreceipt',{receipt:false});
  add('solo',{task:'solo_competitive',solo:true});add('notsolo',{task:'solo_competitive'});
  add('unrated',{task:'unrated'});add('death',{task:'solo_death_unrated'});
  const before=db.prepare('SELECT balance FROM kp_wallets').get().balance;
  const dry=await runOnce(query,N,false);assert.equal(dry.completed,12);assert.equal(dry.eligible,5);assert.equal(dry.held,6);assert.equal(dry.under24h,1);assert.equal(dry.plannedKP,152004);assert.equal(dry.appliedKP,0);
  const out=await runOnce(query,N,true);assert.equal(out.appliedKP,dry.plannedKP);assert.equal(out.verifiedKP,out.appliedKP);assert.equal(db.prepare('SELECT balance FROM kp_wallets').get().balance-before,out.appliedKP);
  assert.equal((await runOnce(query,N,true)).appliedKP,0);assert.equal(db.prepare("SELECT count(*) n FROM kp_ledger WHERE kind='directive-refund'").get().n,9);
  assert.equal(db.prepare("SELECT count(*) n FROM kp_ledger WHERE id LIKE 'directive-early:%'").get().n,0);
  assert.doesNotMatch(JSON.stringify(out),/issuer0001|targetfull|matchfull/);
 }finally{db.close();}
});
test('changed directive snapshot cannot pay; ledger mismatch is rejected',async()=>{
 const {db,add,query}=fixture();try{add('x');const {plan}=planRefunds(await query(SNAPSHOT,[CUTOFF,N,N]),N);
 db.prepare("UPDATE kp_directives SET cost=cost+1 WHERE id='x'").run();
 assert.equal((await query(APPLY,[JSON.stringify(plan),N,CUTOFF])).length,0);
 assert.ok((await query(VERIFY,[JSON.stringify(plan)])).every(x=>x.delta===null));
 }finally{db.close();}
});

import {runRelief,planRelief,AUDIT_TIME,APPLY_RELIEF} from './directive-half-relief-once.mjs';
test('half relief pays only four prior held rows, deducts earlier payments, is replay-safe',async()=>{
 const {db,add,query}=fixture();
 try{
  add('manual1');add('manual2',{cost:10001});add('coverage',{missing:true});add('nostart',{archive:false,cost:250001});
  for(const id of ['manual1','manual2'])db.prepare('INSERT INTO kp_directive_transfers VALUES(?)').run(id);
  add('early',{elapsed:1});add('already',{prior:true});add('active',{status:'active'});
  const before=db.prepare('SELECT balance FROM kp_wallets').get().balance;
  const dry=await runRelief(query,N,false);assert.equal(dry.eligible,4);assert.equal(dry.plannedKP,168000);
  const actual=await runRelief(query,N,true);assert.equal(actual.appliedKP,168000);assert.equal(actual.verifiedKP,168000);assert.equal(db.prepare('SELECT balance FROM kp_wallets').get().balance-before,168000);
  const replay=await runRelief(query,N,true);assert.equal(replay.appliedKP,0);assert.equal(replay.alreadyRelieved,4);
  assert.equal(db.prepare("SELECT count(*) n FROM kp_ledger WHERE id LIKE 'directive-refund-2:%'").get().n,0);
  assert.equal(db.prepare("SELECT count(*) n FROM kp_ledger WHERE id LIKE 'directive-early:%'").get().n,0);
 }finally{db.close();}
});
test('scope mismatch stops before payout',async()=>{
 const {db,add,query}=fixture();try{add('nostart',{archive:false});await assert.rejects(runRelief(query,N,true),/scope mismatch/);}finally{db.close();}
});
