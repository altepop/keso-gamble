import assert from 'node:assert/strict';
import test from 'node:test';
import {GUILD_ID,DB_ID,releaseOperation,validateCurrentPolicies,validateReleaseInput}
 from '../scripts/duel-phase9-release.mjs';
const owner={guild:GUILD_ID,repo:'altepop/keso-gamble',ref:'refs/heads/main',actor:'altepop'};
const auth={token:'safe-test-token',account:'a'.repeat(32)};
const policy=startsAt=>[
 {mode:'pve',starts_at:startsAt,daily_cap:null,pair_cap:null,win_bps:1000,loss_bps:0,draw_bps:0},
 {mode:'pvp',starts_at:startsAt,daily_cap:null,pair_cap:4,win_bps:1000,loss_bps:500,draw_bps:500},
];
function mockCloudflare(initial=[],binding=DB_ID){
 let rows=[...initial],schemaExists=initial.length>0;const queries=[];
 async function request(url,options={}){
  if(url.endsWith('/workers/scripts/valorant-results/settings'))
   return {ok:true,json:async()=>({success:true,result:{bindings:[{type:'d1',name:'DB',id:binding}]}})};
  assert.ok(url.includes('/d1/database/'+DB_ID+'/query'));
  const {sql,params}=JSON.parse(options.body);
  if(params.length)assert.equal(params[0],GUILD_ID);
  queries.push(sql);
  let changes=0,results=[];
  if(sql.startsWith('SELECT name FROM sqlite_master'))results=schemaExists?[{name:'kp_duel_reward_policy_v2'}]:[];
  else if(sql.startsWith('SELECT'))results=[...rows];
  else if(sql.startsWith('CREATE TABLE IF NOT EXISTS kp_duel_reward_policy_v2'))schemaExists=true;
  else if(sql.startsWith('INSERT')){
   if(rows.length)throw Error('test_duplicate_insert');
   rows=policy(Number(params[1]));changes=2;
  }else if(sql.startsWith('DELETE')){changes=rows.length;rows=[];}
  else throw Error('unexpected SQL');
  return {ok:true,json:async()=>({success:true,result:[{success:true,results,meta:{changes}}]})};
 }
 return {request,queries,getRows:()=>rows};
}
test('P9 release denies incorrect guild, repository, ref and actor',()=>{
 for(const [key,value] of Object.entries({guild:'000',repo:'other/repo',ref:'refs/heads/feature',actor:'outsider'}))
  assert.throws(()=>validateReleaseInput({...owner,operation:'activate',[key]:value}));
});
test('P9 release on the known live DB installs both modes atomically and verifies start',async()=>{
 const cloudflare=mockCloudflare();let now=1_800_000_000_000;
 const result=await releaseOperation({...owner,...auth,operation:'activate',request:cloudflare.request,
  clock:()=>now,sleep:async ms=>{now+=ms;}});
 assert.deepEqual(result,{state:'enabled',guild:GUILD_ID,startsAt:1_800_000_015_000,modes:['pve','pvp'],verified:true});
 assert.equal(cloudflare.queries.filter(q=>q.startsWith('INSERT')).length,1);
 assert.equal(cloudflare.getRows().length,2);
 assert.equal(validateCurrentPolicies(cloudflare.getRows()),result.startsAt);
});
test('P9 release never overwrites existing policy or changes an unrelated DB',async()=>{
 const now=1_800_000_000_000;
 const cf=mockCloudflare(policy(now));
 await assert.rejects(releaseOperation({...owner,...auth,operation:'activate',request:cf.request,clock:()=>now}),
  /existing_policy_requires_operator_review/);
 assert.equal(cf.queries.filter(q=>q.startsWith('INSERT')).length,0);
 const wrong=mockCloudflare([], '00000000-0000-0000-0000-000000000000');
 await assert.rejects(releaseOperation({...owner,...auth,operation:'activate',request:wrong.request,clock:()=>now}),
  /live_worker_d1_binding_mismatch/);
 assert.equal(wrong.queries.length,0);
});
test('P9 stop affects policy configuration, not rewards or histories',async()=>{
 const cf=mockCloudflare(policy(1_800_000_000_000));
 const result=await releaseOperation({...owner,...auth,operation:'stop',request:cf.request});
 assert.equal(result.state,'disabled');
 assert.equal(cf.getRows().length,0);
 assert.equal(cf.queries.filter(q=>q.startsWith('DELETE')).length,1);
 assert.equal(cf.queries.some(q=>/rolls|receipts|collection|wallet/i.test(q)),false);
});
test('P9 status is read-only and detects malformed preexisting configuration',async()=>{
 const cf=mockCloudflare(policy(1_800_000_000_000));
 const result=await releaseOperation({...owner,...auth,operation:'status',request:cf.request,clock:()=>1_800_000_000_001});
 assert.equal(result.state,'enabled');
 assert.equal(cf.queries.every(q=>q.startsWith('SELECT')),true);
 assert.throws(()=>validateCurrentPolicies([{mode:'pve'}]),/incomplete_policy_configuration/);
});
