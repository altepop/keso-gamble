import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {claimCoachOutboxWithFreshConsent} from '../src/coach-team-atomic-consent-claim.ts';
import {verifyCoachClaimStillConsented} from '../src/coach-team-postclaim-guard.ts';
const guild='123456789012345678',owner='234567890123456789';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec([
 "CREATE TABLE coach_team_notice_outbox(guild TEXT,team_id TEXT,event_key TEXT,event_type TEXT,revision INTEGER,state TEXT,attempts INTEGER,next_attempt_at INTEGER,claimed_until INTEGER,updated_at INTEGER,PRIMARY KEY(guild,team_id,event_key));",
 "CREATE TABLE coach_team_notice_channels(guild TEXT,team_id TEXT,channel_id TEXT,enabled INTEGER,version INTEGER,configured_by TEXT);",
 "CREATE TABLE coach_team_consents(guild TEXT,team_id TEXT,subject_id TEXT,owner_user TEXT,joined INTEGER,share_status INTEGER,version INTEGER);",
 "CREATE TABLE coach_team_notice_preferences(guild TEXT,team_id TEXT,subject_id TEXT,owner_user TEXT,enabled INTEGER,consent_version INTEGER);"
 ].join('\n'));
 sql.prepare('INSERT INTO coach_team_notice_outbox VALUES(?,?,?,?,?,?,?,?,?,?)').run(guild,'coach-roster-v1','coach-roster-v1:task:1','task',1,'pending',0,999999,0,999999);
 sql.prepare('INSERT INTO coach_team_notice_channels VALUES(?,?,?,?,?,?)').run(guild,'coach-roster-v1','345678901234567890',1,1,owner);
 sql.prepare('INSERT INTO coach_team_consents VALUES(?,?,?,?,?,?,?)').run(guild,'coach-roster-v1','member-1',owner,1,1,2);
 sql.prepare('INSERT INTO coach_team_notice_preferences VALUES(?,?,?,?,?,?)').run(guild,'coach-roster-v1','member-1',owner,1,2);
 const db={prepare(query:string){return {bind(...args:(number|string)[]){
  return {async first<T>(){return sql.prepare(query).get(...args) as T|null;}};
 }};}} as unknown as D1Database;
 const base={guild,event:'task' as const,eventKey:'coach-roster-v1:task:1',revision:1,
  now:1_000_000,expectedSubjects:['member-1'],adminProofVerified:true};
 return {sql,db,base};
}
test('postclaim guard rechecks revocation after a successful atomic claim',async()=>{
 for(const mutation of [
  "UPDATE coach_team_consents SET joined=0",
  "UPDATE coach_team_notice_preferences SET enabled=0",
  "UPDATE coach_team_notice_preferences SET consent_version=1",
  "UPDATE coach_team_notice_channels SET enabled=0",
  "INSERT INTO coach_team_consents VALUES('123456789012345678','coach-roster-v1','member-2','234567890123456789',1,1,2)"
 ]){
  const {sql,db,base}=fixture();
  try{
   const claim=await claimCoachOutboxWithFreshConsent(db,base);
   assert.ok(claim);
   const check={...base,attempts:claim.attempts,claimedUntil:claim.claimedUntil,now:base.now+1};
   assert.equal(await verifyCoachClaimStillConsented(db,check),true);
   sql.exec(mutation);
   assert.equal(await verifyCoachClaimStillConsented(db,check),false,mutation);
  }finally{sql.close();}
 }
});
test('expired or stolen claim cannot pass postclaim guard',async()=>{
 const {sql,db,base}=fixture();
 try{
  const claim=await claimCoachOutboxWithFreshConsent(db,base);
  assert.ok(claim);
  const check={...base,attempts:claim.attempts,claimedUntil:claim.claimedUntil,now:base.now+1};
  assert.equal(await verifyCoachClaimStillConsented(db,{...check,adminProofVerified:false}),false);
  assert.equal(await verifyCoachClaimStillConsented(db,{...check,attempts:claim.attempts+1}),false);
  assert.equal(await verifyCoachClaimStillConsented(db,{...check,claimedUntil:claim.claimedUntil+1}),false);
  assert.equal(await verifyCoachClaimStillConsented(db,{...check,now:claim.claimedUntil}),false);
  sql.exec("UPDATE coach_team_notice_outbox SET state='cancelled'");
  assert.equal(await verifyCoachClaimStillConsented(db,check),false);
 }finally{sql.close();}
});
