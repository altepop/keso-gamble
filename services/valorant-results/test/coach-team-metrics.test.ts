import test from 'node:test';
import assert from 'node:assert/strict';
import {selfFixture} from './coach-self.fixture.ts';
import {kpApi} from '../src/kp-api.ts';
import {coachAuthorizedPartyMetrics} from '../src/coach-team-metrics.ts';
import {resolveCoachIdentity} from '../src/coach-identity.ts';
import {createKpSession} from '../src/kp.ts';
const payload=(version:number,joined=true,shareMetrics=true,shareStatus=false)=>({expectedVersion:version,joined,shareMetrics,shareStatus});
const hit=(f:any,path:string,user=0,body?:unknown)=>{
 return kpApi(new Request('https://worker/api/kp/coach/team/'+path,{
  method:body===undefined?'GET':'POST',headers:{Origin:'https://altepop.github.io',Authorization:'Bearer '+f.tokens[user]},
  ...(body!==undefined?{body:JSON.stringify(body)}:{})}),f.env,f.mapping);
};
const roster=(f:any,id:string,opts:{party?:boolean;team?:boolean;unknown?:boolean;missing?:boolean;map?:string}={})=>{
 const players=Array.from({length:10},(_,i)=>({
  puuid:i===0?'private-puuid-0-0':i===1?'private-puuid-1-0':i===2?'private-puuid-2-0':'other-secret-'+i,
  team_id:i<5?'Blue':'Red',party_id:i<2?opts.party===false?(i===0?'party-one':'party-two'):'team-party':'other-party',
  agent:'Viper',k:i===0?20:i===1?10:1,d:i===0?10:i===1?5:2,
 }));
 if(opts.team===false)players[1].team_id='Red';
 if(opts.missing)delete (players[0] as any).party_id;
 f.sql.prepare('INSERT INTO valorant_match_rosters(match_id,ended_at,map,act_name,teams_json,players_json,recorded_at) VALUES(?,?,?,?,?,?,?)')
  .run(id,Date.now()-10000,opts.map??'Ascent','act',
   JSON.stringify([{id:'Blue',won:opts.unknown?null:true,rounds:13},{id:'Red',won:opts.unknown?null:false,rounds:8}]),
   JSON.stringify(players),Date.now());
};
test('default deny, viewer must expressly enable metrics and at least one other owner must consent',async()=>{
 const f=await selfFixture();try{
  let q=f.queries.length;
  assert.equal((await hit(f,'metrics')).status,404);
  assert.ok(!f.queries.slice(q).some((x:string)=>x.includes('FROM valorant_match_rosters')));
  await hit(f,'consent',0,payload(0,true,false));
  assert.equal((await hit(f,'metrics')).status,404);
  await hit(f,'consent',0,payload(1));
  q=f.queries.length;assert.equal((await hit(f,'metrics')).status,404);
  assert.ok(!f.queries.slice(q).some((x:string)=>x.includes('FROM valorant_match_rosters')));
  await hit(f,'consent',1,payload(0));
  roster(f,'approved-match');
  const r=await hit(f,'metrics');assert.equal(r.status,200);
  const data=await r.json() as any;assert.equal(data.overall.matches,1);
  assert.equal(data.overall.winRate.value,1);
  assert.equal(data.overall.kd.value,2);
  assert.equal(data.overall.kd.numerator,30);
  assert.equal(data.overall.kd.denominator,15);
  assert.equal(data.maps[0].map,'Ascent');
  assert.equal(data.positionBasedTradeDistance,'評価範囲外');
  assert.deepEqual(data.quality,{eligibleMatches:1});
  assert.equal(data.quality.excludedMatches,undefined);
  assert.equal(data.quality.inspectedMatches,undefined);
  const json=JSON.stringify(data);
  assert.doesNotMatch(json,/private-puuid|other-secret|team-party|approved-match|owner_user|subject_id|match_id|players_json|teams_json|personal_notes|goal_id|agent|Viper|discord/i);
  assert.deepEqual(Object.keys(data).sort(),['maps','note','overall','positionBasedTradeDistance','quality','ruleVersion','scope'].sort());
 }finally{f.close();}
});
test('consent revocation, missing party proof, wrong side and unknown outcomes do not fabricate metrics',async()=>{
 const f=await selfFixture();try{
  await hit(f,'consent',0,payload(0));await hit(f,'consent',1,payload(0));
  roster(f,'party-yes');roster(f,'party-mismatch',{party:false});
  roster(f,'team-mismatch',{team:false});roster(f,'party-missing',{missing:true});
  roster(f,'outcome-unknown',{unknown:true});
  const data=await (await hit(f,'metrics')).json() as any;
  assert.equal(data.overall.matches,2);
  assert.equal(data.overall.unknownOutcomes,1);
  assert.equal(data.overall.winRate.value,1);
  // Excluded candidates can include private solo matches and must never leave the Worker.
  assert.equal(data.quality.excludedMatches,undefined);
  await hit(f,'consent',1,payload(1,false,false));
  const start=f.queries.length;assert.equal((await hit(f,'metrics')).status,404);
  assert.ok(!f.queries.slice(start).some((sql:string)=>sql.includes('FROM valorant_match_rosters')));
 }finally{f.close();}
});
test('status-only consent never authorizes metrics and public totals do not include unconsenting third owner',async()=>{
 const f=await selfFixture();try{
  await hit(f,'consent',0,payload(0));await hit(f,'consent',1,payload(0));
  await hit(f,'consent',2,payload(0,true,false,true));roster(f,'secret-third-participant');
  const result=await (await hit(f,'metrics')).json() as any;
  assert.equal(result.overall.kd.numerator,30);
  assert.equal(result.overall.kd.validPlayerSamples,2);
  assert.ok(!JSON.stringify(result).includes('private-puuid-2'));
 }finally{f.close();}
});
test('revalidation stops a revoked opt-in during an expensive roster fetch',async()=>{
 const f=await selfFixture();try{
  await hit(f,'consent',0,payload(0));await hit(f,'consent',1,payload(0));roster(f,'race-revocation');
  const identity=await resolveCoachIdentity(f.db,f.mapping,f.mapping.accounts[0].discordUserId);
  assert.equal(identity.status,'linked');
  if(identity.status!=='linked')return;
  let changed=false;
  const db={prepare(sql:string){const query=f.db.prepare(sql);if(sql.includes('FROM valorant_match_rosters r')){
   const bind=query.bind.bind(query);
   query.bind=(...args:unknown[])=>{const b=bind(...args as never[]);return {...b,all:async()=>{
    const data=await b.all();
    f.sql.prepare('UPDATE coach_team_consents SET share_metrics=0,version=version+1 WHERE owner_user=?')
      .run(f.mapping.accounts[1].discordUserId);changed=true;return data;
   }} as D1PreparedStatement;};
  }return query;}} as D1Database;
  await assert.rejects(coachAuthorizedPartyMetrics(db,f.mapping,identity,f.mapping.accounts[0].discordUserId),/利用できません/);
  assert.equal(changed,true);
 }finally{f.close();}
});
test('foreign guild, wrong origin, missing KP session and optional D1 conserve never reveal team metrics',async()=>{
 const f=await selfFixture();try{
  await hit(f,'consent',0,payload(0));await hit(f,'consent',1,payload(0));roster(f,'private-foreign');
  const token=await createKpSession(f.env,'200000000000000100',f.mapping.accounts[0].discordUserId);
  for(const opt of [
   {origin:'https://unexpected.invalid',token:f.tokens[0],status:403},
   {origin:'https://altepop.github.io',token:'',status:401},
   {origin:'https://altepop.github.io',token,status:401},
  ]){
   const resp=await kpApi(new Request('https://worker/api/kp/coach/team/metrics',
     {headers:{Origin:opt.origin,...opt.token?{Authorization:'Bearer '+opt.token}:{}}}),f.env,f.mapping);
   assert.equal(resp.status,opt.status);
  }
  f.sql.prepare("INSERT OR REPLACE INTO kp_settings(key,value) VALUES('d1_optional_conserve_utc_day',?)")
   .run(new Date().toISOString().slice(0,10));
  const q=f.queries.length;assert.equal((await hit(f,'metrics')).status,429);
  assert.ok(!f.queries.slice(q).some((x:string)=>x.includes('FROM valorant_match_rosters')));
 }finally{f.close();}
});
test('90-day bound, zero sample and null outcome are honestly represented and no other API methods leak',async()=>{
 const f=await selfFixture();try{
  await hit(f,'consent',0,payload(0));await hit(f,'consent',1,payload(0));
  const empty=await (await hit(f,'metrics')).json() as any;
  assert.equal(empty.overall.matches,0);assert.equal(empty.overall.winRate.value,null);
  assert.equal(empty.overall.kd.value,null);
  roster(f,'stale-old');f.sql.prepare('UPDATE valorant_match_rosters SET ended_at=? WHERE match_id=?').run(Date.now()-100*86400000,'stale-old');
  assert.equal((await (await hit(f,'metrics')).json() as any).overall.matches,0);
  const post=await hit(f,'metrics',0,{});assert.equal(post.status,405);
 }finally{f.close();}
});
