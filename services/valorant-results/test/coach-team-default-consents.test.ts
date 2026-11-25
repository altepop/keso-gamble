import test from 'node:test';
import assert from 'node:assert/strict';
import {selfFixture} from './coach-self.fixture.ts';
import {kpApi} from '../src/kp-api.ts';
import {provisionConfirmedCoachRosterConsents} from '../src/coach-team-default-consents.ts';

const call=(f:Awaited<ReturnType<typeof selfFixture>>,path:string,body?:unknown,user=0)=>
 kpApi(new Request('https://worker/api/kp/coach/team/'+path,{
  method:body===undefined?'GET':'POST',
  headers:{Origin:'https://altepop.github.io',Authorization:'Bearer '+f.tokens[user]},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 }),f.env,f.mapping);
test('verified roster gets initial ON flags and notice consent without enabling delivery',async()=>{
 const f=await selfFixture();try{
  const result=await provisionConfirmedCoachRosterConsents(f.db,f.mapping,10000);
  assert.deepEqual(result,{initialized:5,skipped:0});
  const cs=f.sql.prepare('SELECT joined,share_status,share_metrics,version FROM coach_team_consents ORDER BY subject_id').all() as any[];
  assert.equal(cs.length,5);
  assert.ok(cs.every(c=>c.joined===1&&c.share_status===1&&c.share_metrics===1&&c.version===1));
  const prefs=f.sql.prepare('SELECT enabled,consent_version,version FROM coach_team_notice_preferences').all() as any[];
  assert.equal(prefs.length,5);
  assert.ok(prefs.every(p=>p.enabled===1&&p.consent_version===1&&p.version===1));
  assert.equal((f.sql.prepare('SELECT COUNT(*) n FROM coach_team_notice_channels').get() as any).n,0);
  const own=await (await call(f,'consent')).json() as any;
  assert.deepEqual(own.settings,{joined:true,shareStatus:true,shareMetrics:true,version:1});
  const notice=await (await call(f,'notification')).json() as any;
  assert.equal(notice.settings.enabled,true);
  assert.equal(notice.deliveryReady,false);
  assert.equal(notice.channelConfigured,false);
 }finally{f.close();}
});
test('explicit owner withdrawal stays OFF across repeated scheduled provisioning',async()=>{
 const f=await selfFixture();try{
  await provisionConfirmedCoachRosterConsents(f.db,f.mapping,10000);
  const off=await call(f,'consent',{expectedVersion:1,joined:false,shareStatus:false,shareMetrics:false});
  assert.equal(off.status,200);
  const noticeOff=await call(f,'notification',{expectedVersion:1,enabled:false},1);
  assert.equal(noticeOff.status,200,'another roster member can independently withdraw notices');
  const rerun=await provisionConfirmedCoachRosterConsents(f.db,f.mapping,11000);
  assert.equal(rerun.initialized,0);
  const cons=await (await call(f,'consent')).json() as any;
  assert.deepEqual(cons.settings,{joined:false,shareStatus:false,shareMetrics:false,version:2});
  const other=await (await call(f,'notification',undefined,1)).json() as any;
  assert.equal(other.settings.enabled,false);
  assert.equal(other.settings.version,2);
  assert.equal((await call(f,'roster')).status,404);
  const untouched=await (await call(f,'consent',undefined,2)).json() as any;
  assert.deepEqual(untouched.settings,{joined:true,shareStatus:true,shareMetrics:true,version:1});
 }finally{f.close();}
});
test('preexisting explicit consent and notice OFF records never get auto-upgraded',async()=>{
 const f=await selfFixture();try{
  const owner=f.mapping.accounts[0].discordUserId;
  const id=(f.sql.prepare('SELECT subject_id FROM coach_profiles WHERE owner_user=?').get(owner) as any).subject_id;
  f.sql.prepare('INSERT INTO coach_team_consents VALUES(?,?,?,?,?,?,?,?,?)')
   .run(f.mapping.guildId,'coach-roster-v1',id,owner,0,0,0,3,500);
  f.sql.prepare('INSERT INTO coach_team_notice_preferences VALUES(?,?,?,?,?,?,?,?)')
   .run(f.mapping.guildId,'coach-roster-v1',id,owner,0,3,4,500);
  assert.equal((await provisionConfirmedCoachRosterConsents(f.db,f.mapping)).initialized,4);
  const row=f.sql.prepare('SELECT joined,share_status,share_metrics,version FROM coach_team_consents WHERE owner_user=?').get(owner) as any;
  assert.deepEqual({...row},{joined:0,share_status:0,share_metrics:0,version:3});
  const pref=f.sql.prepare('SELECT enabled,consent_version,version FROM coach_team_notice_preferences WHERE owner_user=?').get(owner) as any;
  assert.deepEqual({...pref},{enabled:0,consent_version:3,version:4});
 }finally{f.close();}
});
test('unlinked registered identity remains fail-closed and cannot be initialized',async()=>{
 const f=await selfFixture();try{
  const owner=f.mapping.accounts[0].discordUserId;
  f.sql.prepare('UPDATE kp_accounts SET riot=? WHERE user=?').run('unverified#changed',owner);
  const result=await provisionConfirmedCoachRosterConsents(f.db,f.mapping);
  assert.equal(result.initialized,4);
  assert.equal(result.skipped,1);
  assert.equal((f.sql.prepare('SELECT COUNT(*) n FROM coach_team_consents WHERE owner_user=?').get(owner) as any).n,0);
  assert.equal((f.sql.prepare('SELECT COUNT(*) n FROM coach_team_notice_channels').get() as any).n,0);
 }finally{f.close();}
});
