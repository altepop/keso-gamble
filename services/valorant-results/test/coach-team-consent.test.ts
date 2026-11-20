import test from 'node:test';
import assert from 'node:assert/strict';
import {selfFixture} from './coach-self.fixture.ts';
import {kpApi} from '../src/kp-api.ts';
import {createKpSession} from '../src/kp.ts';
import {COACH_TEAM_ID} from '../src/coach-team-consent.ts';
type Fixture=Awaited<ReturnType<typeof selfFixture>>;
const call=(f:Fixture,path:'consent'|'roster'|'metrics',body?:unknown,user=0,origin='https://altepop.github.io')=>
 kpApi(new Request('https://worker/api/kp/coach/team/'+path,{
  method:body===undefined?'GET':'POST',
  headers:{Origin:origin,Authorization:'Bearer '+f.tokens[user]},
  ...(body!==undefined?{body:JSON.stringify(body)}:{})
 }),f.env,f.mapping);
const changes=(expectedVersion:number,extra={})=>({
 expectedVersion,joined:true,shareStatus:false,shareMetrics:false,...extra});
test('team consent defaults OFF and no profile sharing or private records are changed',async()=>{
 const f=await selfFixture();try{
  const start=f.queries.length;const r=await call(f,'consent'),b=await r.json() as any;
  assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(b.settings,{joined:false,shareStatus:false,shareMetrics:false,version:0});
  assert.ok(!f.queries.slice(start).some(sql=>/INSERT INTO coach_team_consents|UPDATE coach_team_consents/.test(sql)));assert.equal((await call(f,'roster')).status,404);
  assert.equal((await call(f,'metrics')).status,404);
  assert.equal((await call(f,'consent',changes(0))).status,200);
  const stored=f.sql.prepare('SELECT guild,team_id,owner_user,version,joined,share_status,share_metrics FROM coach_team_consents').all() as any[];
  assert.equal(stored.length,1);assert.equal(stored[0].team_id,COACH_TEAM_ID);
  assert.equal(stored[0].owner_user,f.mapping.accounts[0].discordUserId);
  assert.equal(stored[0].joined,1);assert.equal(stored[0].share_status,0);assert.equal(stored[0].share_metrics,0);
  assert.equal((f.sql.prepare('SELECT visibility FROM coach_profiles WHERE owner_user=?').get(f.mapping.accounts[0].discordUserId) as any).visibility,'private');
 }finally{f.close();}
});
test('CAS prevents conflicting creates and stale modifications; opt-out revokes exposure',async()=>{
 const f=await selfFixture();try{
  assert.equal((await call(f,'consent',changes(0,{shareStatus:true,shareMetrics:true}))).status,200);
  assert.equal((await call(f,'consent',changes(0,{joined:false}))).status,409);
  assert.equal((await call(f,'consent',changes(1,{shareStatus:true}))).status,200);
  assert.equal((await call(f,'consent',changes(1,{shareStatus:false}))).status,409);
  assert.equal((await call(f,'roster')).status,200);
  const turnedOff=await call(f,'consent',{expectedVersion:2,joined:false,shareStatus:false,shareMetrics:false});
  assert.equal(turnedOff.status,200);assert.equal((await turnedOff.json() as any).settings.version,3);
  assert.equal((await call(f,'roster')).status,404);
  const stored=f.sql.prepare('SELECT joined,share_status,share_metrics,version FROM coach_team_consents').get() as any;
  assert.deepEqual([stored.joined,stored.share_status,stored.share_metrics,stored.version],[0,0,0,3]);
 }finally{f.close();}
});
test('only consented members are visible; multi-account owner is one; no IDs/private data leak',async()=>{
 const f=await selfFixture();try{
  assert.equal((await call(f,'consent',changes(0,{shareStatus:true,shareMetrics:true}))).status,200);
  assert.equal((await call(f,'consent',changes(0,{shareStatus:true}),1)).status,200);
  assert.equal((await call(f,'consent',changes(0,{shareStatus:false}),2)).status,200);
  const res=await call(f,'roster'),payload=await res.json() as any,serialized=JSON.stringify(payload);
  assert.equal(res.status,200);assert.equal(payload.members.length,2);
  assert.equal(payload.participantCount,2);
  assert.equal(payload.members[0].status,'まだ分かりません');
  assert.equal(payload.metricAccess,'評価範囲外');
  assert.doesNotMatch(serialized,/private-puuid|100000000000000|match_id|practice_records|personal_notes|PUUID|owner_user|subject_id|guild/i);
  assert.equal((await call(f,'roster',undefined,3)).status,404);
  // Owner can hide from other members but still remain joined.
  const hidden=await call(f,'consent',changes(1,{shareStatus:false,shareMetrics:true}));
  assert.equal(hidden.status,200);
  const after=await (await call(f,'roster',undefined,1)).json() as any;
  assert.equal(after.members.length,1);
 }finally{f.close();}
});
test('strict body validation, origin and sessions; foreign guild cannot mutate consent',async()=>{
 const f=await selfFixture();try{
  for(const payload of [
   {expectedVersion:0,joined:true,shareStatus:true,shareMetrics:true,ownerId:'another'},
   {expectedVersion:0,joined:true,shareStatus:true,shareMetrics:true,teamId:'arbitrary'},
   {expectedVersion:0,joined:false,shareStatus:true,shareMetrics:false},
   {expectedVersion:0,joined:true,shareStatus:'true',shareMetrics:false},
   {expectedVersion:-1,joined:true,shareStatus:false,shareMetrics:false},
   {expectedVersion:0,joined:true,shareStatus:false},
   []
  ])assert.equal((await call(f,'consent',payload)).status,400,JSON.stringify(payload));
  assert.equal((await call(f,'consent',changes(0),0,'https://evil.example')).status,403);
  const missing=await kpApi(new Request('https://worker/api/kp/coach/team/consent',{headers:{Origin:'https://altepop.github.io'}}),f.env,f.mapping);
  assert.equal(missing.status,401);
  const foreign=await createKpSession(f.env,'200000000000000100',f.mapping.accounts[0].discordUserId);
  const attempted=await kpApi(new Request('https://worker/api/kp/coach/team/consent',{
   method:'POST',headers:{Origin:'https://altepop.github.io',Authorization:'Bearer '+foreign},
   body:JSON.stringify(changes(0))}),f.env,f.mapping);
  assert.equal(attempted.status,401);
  assert.equal((f.sql.prepare('SELECT count(*) n FROM coach_team_consents').get() as any).n,0);
 }finally{f.close();}
});
test('ownership mismatch closes read/write access and never upgrades another member',async()=>{
 const f=await selfFixture();try{
  await call(f,'consent',changes(0,{shareStatus:true}));
  f.sql.prepare('UPDATE kp_accounts SET riot=? WHERE user=?')
    .run('unverified#changed',f.mapping.accounts[0].discordUserId);
  assert.equal((await call(f,'consent')).status,404);
  assert.equal((await call(f,'consent',changes(1,{shareStatus:false}))).status,404);
  assert.equal((await call(f,'roster')).status,404);
  assert.equal((f.sql.prepare('SELECT share_status FROM coach_team_consents').get() as any).share_status,1);
 }finally{f.close();}
});
test('immutable D1 identity and consent fields cannot be rewritten',async()=>{
 const f=await selfFixture();try{
  await call(f,'consent',changes(0));
  assert.throws(()=>f.sql.prepare('UPDATE coach_team_consents SET owner_user=?').run('someone-else'),/owner cannot change/);
  assert.throws(()=>f.sql.prepare('UPDATE coach_team_consents SET team_id=?').run('other-team'),/owner cannot change/);
 }finally{f.close();}
});
