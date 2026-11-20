import test from 'node:test';
import assert from 'node:assert/strict';
import {selfFixture} from './coach-self.fixture.ts';
import {kpApi} from '../src/kp-api.ts';
const allowed='https://altepop.github.io';
const request=(f:Awaited<ReturnType<typeof selfFixture>>,path:string,user=0,body?:unknown,origin=allowed)=>{
 const headers={Origin:origin,Authorization:'Bearer '+f.tokens[user]};
 return kpApi(new Request('https://worker/api/kp/coach/team/'+path,{method:body===undefined?'GET':'POST',headers,
  ...(body===undefined?{}:{body:JSON.stringify(body)})}),f.env,f.mapping);
};
const consent=(version:number,shareStatus=false,joined=true)=>({joined,shareStatus:joined&&shareStatus,shareMetrics:false,expectedVersion:version});
const task=(expectedVersion=0,overrides={})=>({expectedVersion,category:'連携',title:'同時にピークするタイミングをそろえます',
 action:'試合前にどの角を一緒に見るか宣言します',measure:'録画で2人が同じ秒にピークしたか確認します',
 periodEnd:'2026-12-31',active:true,reason:'最初の課題を選びます',...overrides});
const state=(challengeVersion:number,expectedVersion=0,overrides={})=>({challengeVersion,expectedVersion,
 state:'実施予定',action:'味方の合図で一緒にピークします',...overrides});
test('Phase3-D: team task is denied without membership, initial reads do not write',async()=>{
 const f=await selfFixture();try{
  const from=f.queries.length;
  assert.equal((await request(f,'pdca')).status,404);
  assert.equal((await request(f,'challenge',0,task())).status,404);
  assert.ok(!f.queries.slice(from).some(x=>/INSERT INTO coach_team_challenges/.test(x)));
  await request(f,'consent',0,consent(0));
  const result=await request(f,'pdca'),json=await result.json() as any;
  assert.equal(result.status,200);
  assert.equal(json.challenge,null);assert.deepEqual(json.history,[]);assert.deepEqual(json.shared,[]);
  assert.equal(json.canEdit,true);
 }finally{f.close();}
});
test('Phase3-D: single task, owner CAS, audit history and no public identities',async()=>{
 const f=await selfFixture();try{
  await request(f,'consent',0,consent(0));
  await request(f,'consent',1,consent(0));
  const created=await request(f,'challenge',0,task()),createdJson=await created.json() as any;
  assert.equal(created.status,200);assert.equal(createdJson.version,1);
  assert.equal((await request(f,'challenge',1,task())).status,409);
  const forbidden=await request(f,'challenge',1,task(1));assert.equal(forbidden.status,404);
  assert.equal((await request(f,'challenge',0,task(0))).status,409);
  const updated=await request(f,'challenge',0,task(1,{category:'守り',title:'守備のリテイクを確認します',reason:'優先課題を更新します'}));
  assert.equal(updated.status,200);
  const data=await (await request(f,'pdca',1)).json() as any;
  assert.equal(data.challenge.version,2);assert.equal(data.challenge.category,'守り');
  assert.equal(data.canEdit,false);assert.deepEqual(data.history.map((r:any)=>r.version),[2,1]);
  assert.equal((f.sql.prepare('SELECT COUNT(*) n FROM coach_team_challenges').get() as any).n,1);
  assert.equal((f.sql.prepare('SELECT COUNT(*) n FROM coach_team_challenge_history').get() as any).n,2);
  assert.doesNotMatch(JSON.stringify(data),/private-puuid|subject_id|author_user|owner_user|100000000000000|personal_notes|match_id|PUUID/);
 }finally{f.close();}
});
test('Phase3-D: explicit status opt-in, owner-only update and revocation suppression',async()=>{
 const f=await selfFixture();try{
  await request(f,'consent',0,consent(0,true));await request(f,'consent',1,consent(0));
  await request(f,'challenge',0,task());
  assert.equal((await request(f,'status',1,state(1))).status,404);
  assert.equal((await request(f,'status',0,state(1))).status,200);
  let read=await (await request(f,'pdca',1)).json() as any;
  assert.equal(read.shared.length,1);assert.equal(read.shared[0].state,'実施予定');
  assert.equal(read.shared[0].action,'味方の合図で一緒にピークします');
  assert.equal((await request(f,'status',0,state(1))).status,409);
  await request(f,'consent',0,consent(1,false));
  read=await (await request(f,'pdca',1)).json() as any;assert.deepEqual(read.shared,[]);
  assert.equal((await request(f,'status',0,state(1,1))).status,404);
  await request(f,'consent',0,consent(2,true));
  const ok=await request(f,'status',0,state(1,1,{state:'本人が試した',action:'録画で確認する予定です'}));
  assert.equal(ok.status,200);
  await request(f,'challenge',0,task(1,{category:'攻め',reason:'別の練習へ変更します'}));
  read=await (await request(f,'pdca',1)).json() as any;assert.equal(read.shared.length,0,'old revision is hidden');
  assert.equal((await request(f,'status',0,state(1,2))).status,409);
 }finally{f.close();}
});
test('Phase3-D: rejects spoofed IDs, invalid state, foreign Origin and unauthenticated reads',async()=>{
 const f=await selfFixture();try{
  await request(f,'consent',0,consent(0,true));
  for(const b of [
   task(0,{guild:'another'}),task(0,{owner:'attacker'}),task(0,{title:' <img src=x onerror=alert(1)>'}),
   task(-1),task(0,{periodEnd:'invalid'}),task(0,{category:'権限変更'}),
   task(0,{title:'a'.repeat(150)}),
  ])assert.equal((await request(f,'challenge',0,b)).status,400,JSON.stringify(b));
  assert.equal((await request(f,'challenge',0,task(), 'https://evil.invalid')).status,403);
  assert.equal((await kpApi(new Request('https://worker/api/kp/coach/team/pdca',{headers:{Origin:allowed}}),f.env,f.mapping)).status,401);
  await request(f,'challenge',0,task());
  for(const b of [state(1,0,{owner:'attacker'}),state(1,0,{state:'管理者'}),state(1,0,{action:'x'.repeat(300)})])
   assert.equal((await request(f,'status',0,b)).status,400);
  assert.equal((f.sql.prepare('SELECT COUNT(*) n FROM coach_team_member_status').get() as any).n,0);
 }finally{f.close();}
});
test('Phase3-D: session ownership changes remove all shared status and task visibility',async()=>{
 const f=await selfFixture();try{
  await request(f,'consent',0,consent(0,true));await request(f,'consent',1,consent(0));
  await request(f,'challenge',0,task());await request(f,'status',0,state(1));
  f.sql.prepare('UPDATE kp_accounts SET riot=? WHERE user=?').run('invalid#mapping',f.mapping.accounts[0].discordUserId);
  assert.equal((await request(f,'pdca',0)).status,404);
  assert.equal((await request(f,'pdca',1)).status,200);
  const after=await (await request(f,'pdca',1)).json() as any;
  assert.equal(after.shared.length,0);
 }finally{f.close();}
});
