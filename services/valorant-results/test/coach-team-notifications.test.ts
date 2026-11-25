import test from 'node:test';
import assert from 'node:assert/strict';
import {selfFixture} from './coach-self.fixture.ts';
import {kpApi} from '../src/kp-api.ts';
import {coachNoticeAllowed} from '../src/coach-team-notifications.ts';
const call=(f:Awaited<ReturnType<typeof selfFixture>>,path:string,body?:unknown,user=0,origin='https://altepop.github.io')=>
 kpApi(new Request('https://worker/api/kp/coach/team/'+path,{method:body===undefined?'GET':'POST',
  headers:{Origin:origin,Authorization:'Bearer '+f.tokens[user]},
  ...(body===undefined?{}:{body:JSON.stringify(body)})}),f.env,f.mapping);
const join=(version:number,joined=true)=>({expectedVersion:version,joined,shareStatus:false,shareMetrics:false});
const change=(version:number,enabled:boolean)=>({expectedVersion:version,enabled});
test('Phase3-E: no notification consent on GET; explicitly off until user joins',async()=>{
 const f=await selfFixture();try{
  const from=f.queries.length;assert.equal((await call(f,'notification')).status,404);
  assert.ok(!f.queries.slice(from).some(x=>/INSERT INTO coach_team_notice_preferences/i.test(x)));
  await call(f,'consent',join(0));
  const got=await call(f,'notification'),d=await got.json() as any;
  assert.equal(got.status,200);assert.equal(d.settings.enabled,false);
  assert.equal(d.settings.version,0);assert.equal(d.deliveryReady,false);
  assert.equal(d.preview.mentions,'なし');
  assert.equal(d.preview.mode,'送信しないプレビュー');
  assert.deepEqual((f.sql.prepare('SELECT * FROM coach_team_notice_preferences').all() as any[]),[]);
  assert.deepEqual((f.sql.prepare('SELECT * FROM coach_team_notice_channels').all() as any[]),[]);
 }finally{f.close();}
});
test('Phase3-E: CAS, opt-out and join-version reset; never resubscribe silently',async()=>{
 const f=await selfFixture();try{
  await call(f,'consent',join(0));
  assert.equal((await call(f,'notification',change(0,true))).status,200);
  assert.equal((await call(f,'notification',change(0,false))).status,409);
  let d=await (await call(f,'notification')).json() as any;
  assert.equal(d.settings.enabled,true);assert.equal(d.settings.version,1);assert.equal(d.deliveryReady,false);
  assert.equal((await call(f,'notification',change(1,false))).status,200);
  d=await (await call(f,'notification')).json() as any;assert.equal(d.settings.enabled,false);
  await call(f,'notification',change(2,true));
  await call(f,'consent',join(1,false));
  assert.equal((await call(f,'notification')).status,404);
  await call(f,'consent',join(2,true));
  d=await (await call(f,'notification')).json() as any;assert.equal(d.settings.enabled,false);
  assert.equal((await call(f,'notification',change(3,true))).status,200);
  assert.equal((await (await call(f,'notification')).json() as any).settings.enabled,true);
 }finally{f.close();}
});
test('Phase3-E: no attacker identity fields, no unverified origin, no credential, no private data',async()=>{
 const f=await selfFixture();try{
  await call(f,'consent',join(0));
  for(const payload of [{enabled:true,expectedVersion:0,channelId:'123456789012345678'},
   {enabled:true,expectedVersion:0,user:'other'},{enabled:1,expectedVersion:0},
   {enabled:true,expectedVersion:-1},{enabled:false},{enabled:'yes',expectedVersion:0}]){
   assert.equal((await call(f,'notification',payload)).status,400,JSON.stringify(payload));
  }
  assert.equal((await call(f,'notification',change(0,true),0,'https://evil.invalid')).status,403);
  const denied=await kpApi(new Request('https://worker/api/kp/coach/team/notification',{
   headers:{Origin:'https://altepop.github.io'}}),f.env,f.mapping);
  assert.equal(denied.status,401);
  let d=await (await call(f,'notification')).json() as any;
  assert.doesNotMatch(JSON.stringify(d),/private-puuid|owner_user|subject_id|guild_id|channel_id|match_id|personal_notes|goal_id/);
  assert.equal((f.sql.prepare('SELECT COUNT(*) AS n FROM coach_team_notice_preferences').get() as any).n,0);
 }finally{f.close();}
});
test('Phase3-E: transport gate denies unless opt-in, fresh consent, admin channel and rate gates',()=>{
 const base={enabled:true,consentVersion:3,currentConsentVersion:3,joined:true,
  shareStatus:true,channelEnabled:true,channelId:'123456789012345678',
  adminConfigured:true,event:'task' as const,recentlyDelivered:false};
 assert.equal(coachNoticeAllowed(base),true);
 for(const delta of [{enabled:false},{joined:false},{consentVersion:2},
  {shareStatus:false,event:'status' as const},{channelEnabled:false},
  {channelId:'invalid'},{adminConfigured:false},{recentlyDelivered:true}]){
  assert.equal(coachNoticeAllowed({...base,...delta}),false,JSON.stringify(delta));
 }
 assert.equal(coachNoticeAllowed({...base,shareStatus:false,event:'task'}),true);
});
