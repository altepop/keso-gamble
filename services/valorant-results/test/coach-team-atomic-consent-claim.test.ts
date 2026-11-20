import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {claimCoachOutboxWithFreshConsent} from '../src/coach-team-atomic-consent-claim.ts';
const guild='123456789012345678',owner='234567890123456789',channel='345678901234567890';
const input=()=>({
 guild,eventKey:'coach-roster-v1:task:1',event:'task' as const,revision:1,
 expectedSubjects:['member-1'],now:1_000_000,adminProofVerified:true
});
function setup(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec([
 'CREATE TABLE coach_team_notice_outbox(guild TEXT,team_id TEXT,event_key TEXT,event_type TEXT,revision INTEGER,state TEXT,attempts INTEGER,next_attempt_at INTEGER,claimed_until INTEGER,updated_at INTEGER,PRIMARY KEY(guild,team_id,event_key));',
 'CREATE TABLE coach_team_notice_channels(guild TEXT,team_id TEXT,channel_id TEXT,enabled INTEGER,version INTEGER,configured_by TEXT);',
 'CREATE TABLE coach_team_consents(guild TEXT,team_id TEXT,subject_id TEXT,owner_user TEXT,joined INTEGER,share_status INTEGER,version INTEGER);',
 'CREATE TABLE coach_team_notice_preferences(guild TEXT,team_id TEXT,subject_id TEXT,owner_user TEXT,enabled INTEGER,consent_version INTEGER);'
 ].join('\n'));
 sqlite.prepare('INSERT INTO coach_team_notice_outbox VALUES(?,?,?,?,?,?,?,?,?,?)')
  .run(guild,'coach-roster-v1','coach-roster-v1:task:1','task',1,'pending',0,999_999,0,999_999);
 sqlite.prepare('INSERT INTO coach_team_notice_channels VALUES(?,?,?,?,?,?)')
  .run(guild,'coach-roster-v1',channel,1,1,owner);
 sqlite.prepare('INSERT INTO coach_team_consents VALUES(?,?,?,?,?,?,?)')
  .run(guild,'coach-roster-v1','member-1',owner,1,1,2);
 sqlite.prepare('INSERT INTO coach_team_notice_preferences VALUES(?,?,?,?,?,?)')
  .run(guild,'coach-roster-v1','member-1',owner,1,2);
 const db={prepare(sql:string){return {bind(...params:(string|number)[]){
  return {async first<T>(){return (sqlite.prepare(sql).get(...params) as T|undefined)??null;}};
 }};}} as unknown as D1Database;
 return {sqlite,db};
}
test('one SQL statement admits only one of two competing due claims',async()=>{
 const {sqlite,db}=setup();
 try{
  const results=await Promise.all([
   claimCoachOutboxWithFreshConsent(db,input()),
   claimCoachOutboxWithFreshConsent(db,input())
  ]);
  assert.deepEqual(results.map(r=>r?.attempts??null).sort(),[1,null].sort());
  const r=sqlite.prepare('SELECT state,attempts FROM coach_team_notice_outbox').get() as {state:string;attempts:number};
  assert.equal(r.state,'claimed');
  assert.equal(r.attempts,1);
 }finally{sqlite.close();}
});
test('consent revoked, stale version, channel disabled and extra member prevent claim',async()=>{
 const changes=[
  "UPDATE coach_team_consents SET joined=0",
  "UPDATE coach_team_notice_preferences SET enabled=0",
  "UPDATE coach_team_notice_preferences SET consent_version=1",
  "UPDATE coach_team_notice_channels SET enabled=0",
  "INSERT INTO coach_team_consents VALUES('123456789012345678','coach-roster-v1','member-2','234567890123456789',1,1,2)"
 ];
 for(const sql of changes){
  const {sqlite,db}=setup();
  try{
   sqlite.exec(sql);
   assert.equal(await claimCoachOutboxWithFreshConsent(db,input()),null,sql);
   assert.equal((sqlite.prepare('SELECT attempts FROM coach_team_notice_outbox').get() as {attempts:number}).attempts,0);
  }finally{sqlite.close();}
 }
});
test('status notices reject absent status consent and client-like proof flags',async()=>{
 const {sqlite,db}=setup();
 try{
  sqlite.exec("UPDATE coach_team_notice_outbox SET event_type='status',event_key='coach-roster-v1:status:1'");
  sqlite.exec('UPDATE coach_team_consents SET share_status=0');
  const status={...input(),event:'status' as const,eventKey:'coach-roster-v1:status:1'};
  assert.equal(await claimCoachOutboxWithFreshConsent(db,status),null);
  assert.equal(await claimCoachOutboxWithFreshConsent(db,{...input(),adminProofVerified:false}),null);
 }finally{sqlite.close();}
});
