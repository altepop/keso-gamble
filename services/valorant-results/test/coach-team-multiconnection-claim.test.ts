// Phase 3-E2: two independent SQLite connections, NOT a Cloudflare D1 concurrency certification.
// This suite is isolated and never sends Discord messages or connects to production D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {claimCoachOutboxWithFreshConsent} from '../src/coach-team-atomic-consent-claim.ts';
import {verifyCoachClaimStillConsented} from '../src/coach-team-postclaim-guard.ts';

const guild='123456789012345678';
const owner='234567890123456789';
const roster='coach-roster-v1';
const eventKey='coach-roster-v1:task:1';
const base=()=>({guild,eventKey,event:'task' as const,revision:1,expectedSubjects:['member-1'],now:1000000,adminProofVerified:true});
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'coach-e2-concurrency-'));
 const file=join(dir,'isolated.sqlite');
 const a=new DatabaseSync(file);
 a.exec([
  'CREATE TABLE coach_team_notice_outbox(guild TEXT,team_id TEXT,event_key TEXT,event_type TEXT,revision INTEGER,state TEXT,attempts INTEGER,next_attempt_at INTEGER,claimed_until INTEGER,updated_at INTEGER,PRIMARY KEY(guild,team_id,event_key));',
  'CREATE TABLE coach_team_notice_channels(guild TEXT,team_id TEXT,channel_id TEXT,enabled INTEGER,version INTEGER,configured_by TEXT);',
  'CREATE TABLE coach_team_consents(guild TEXT,team_id TEXT,subject_id TEXT,owner_user TEXT,joined INTEGER,share_status INTEGER,version INTEGER);',
  'CREATE TABLE coach_team_notice_preferences(guild TEXT,team_id TEXT,subject_id TEXT,owner_user TEXT,enabled INTEGER,consent_version INTEGER);'
 ].join('\n'));
 a.prepare('INSERT INTO coach_team_notice_outbox VALUES(?,?,?,?,?,?,?,?,?,?)').run(guild,roster,eventKey,'task',1,'pending',0,999999,0,999999);
 a.prepare('INSERT INTO coach_team_notice_channels VALUES(?,?,?,?,?,?)').run(guild,roster,'345678901234567890',1,1,owner);
 a.prepare('INSERT INTO coach_team_consents VALUES(?,?,?,?,?,?,?)').run(guild,roster,'member-1',owner,1,1,2);
 a.prepare('INSERT INTO coach_team_notice_preferences VALUES(?,?,?,?,?,?)').run(guild,roster,'member-1',owner,1,2);
 const b=new DatabaseSync(file);
 function adapter(sqlite:DatabaseSync){
  return {prepare(sql:string){return {bind(...args:(string|number)[]){return {
   async first<T>(){return (sqlite.prepare(sql).get(...args) as T|undefined)??null;}
  };}};}} as unknown as D1Database;
 }
 return {a,b,dbA:adapter(a),dbB:adapter(b),close(){b.close();a.close();rmSync(dir,{recursive:true,force:true});}};
}
test('independent database connections must not obtain the same unexpired lease',async()=>{
 const f=fixture();
 try{
  const claims=await Promise.all([
   claimCoachOutboxWithFreshConsent(f.dbA,base()),
   claimCoachOutboxWithFreshConsent(f.dbB,base())
  ]);
  assert.equal(claims.filter(Boolean).length,1);
  assert.equal(claims.find(Boolean)?.attempts,1);
  const row=f.b.prepare('SELECT state,attempts FROM coach_team_notice_outbox').get() as {state:string;attempts:number};
  assert.equal(row.state,'claimed');
  assert.equal(row.attempts,1);
 }finally{f.close();}
});
test('another connection revoking consent after claim invalidates the postclaim read',async()=>{
 const f=fixture();
 try{
  const claim=await claimCoachOutboxWithFreshConsent(f.dbA,base());
  assert.ok(claim);
  const check={...base(),now:base().now+1,attempts:claim.attempts,claimedUntil:claim.claimedUntil};
  assert.equal(await verifyCoachClaimStillConsented(f.dbB,check),true);
  f.a.exec('UPDATE coach_team_notice_preferences SET enabled=0');
  assert.equal(await verifyCoachClaimStillConsented(f.dbB,check),false);
  assert.equal(await verifyCoachClaimStillConsented(f.dbA,check),false);
 }finally{f.close();}
});
test('expired lease is unavailable even before another connection reclaims it',async()=>{
 const f=fixture();
 try{
  const claim=await claimCoachOutboxWithFreshConsent(f.dbA,base());
  assert.ok(claim);
  assert.equal(await verifyCoachClaimStillConsented(f.dbB,{
   ...base(),now:claim.claimedUntil,attempts:claim.attempts,claimedUntil:claim.claimedUntil
  }),false);
 }finally{f.close();}
});

test('independent connections fail closed after each class of postclaim authorization change',async()=>{
 const revocations=[
  {name:'membership revoked',sql:'UPDATE coach_team_consents SET joined=0'},
  {name:'consent version changed',sql:'UPDATE coach_team_consents SET version=version+1'},
  {name:'notice preference removed',sql:'DELETE FROM coach_team_notice_preferences'},
  {name:'channel disabled',sql:'UPDATE coach_team_notice_channels SET enabled=0'},
  {name:'channel configuration invalidated',sql:"UPDATE coach_team_notice_channels SET channel_id='invalid'"},
  {name:'unanticipated member joined',sql:"INSERT INTO coach_team_consents VALUES('123456789012345678','coach-roster-v1','member-2','234567890123456789',1,1,1)"},
  {name:'lease cancelled',sql:"UPDATE coach_team_notice_outbox SET state='cancelled'"},
  {name:'lease identity changed',sql:'UPDATE coach_team_notice_outbox SET claimed_until=claimed_until+1'}
 ];
 for(const mutation of revocations){
  const f=fixture();
  try{
   const claim=await claimCoachOutboxWithFreshConsent(f.dbA,base());
   assert.ok(claim,mutation.name);
   const check={...base(),now:base().now+1,attempts:claim.attempts,claimedUntil:claim.claimedUntil};
   assert.equal(await verifyCoachClaimStillConsented(f.dbB,check),true,mutation.name);
   f.a.exec(mutation.sql);
   assert.equal(await verifyCoachClaimStillConsented(f.dbB,check),false,mutation.name);
  }finally{f.close();}
 }
});
test('a reclaimed lease invalidates the previous claimant on another connection',async()=>{
 const f=fixture();
 try{
  const first=await claimCoachOutboxWithFreshConsent(f.dbA,base());
  assert.ok(first);
  const nextNow=first.claimedUntil;
  const replacement=await claimCoachOutboxWithFreshConsent(f.dbB,{...base(),now:nextNow});
  assert.ok(replacement);
  assert.equal(replacement.attempts,first.attempts+1);
  assert.equal(await verifyCoachClaimStillConsented(f.dbA,{
   ...base(),now:nextNow,attempts:first.attempts,claimedUntil:first.claimedUntil
  }),false);
  assert.equal(await verifyCoachClaimStillConsented(f.dbA,{
   ...base(),now:nextNow+1,attempts:replacement.attempts,claimedUntil:replacement.claimedUntil
  }),true);
 }finally{f.close();}
});
