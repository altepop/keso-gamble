import {createKpSession} from '../src/kp.ts';
import test from 'node:test';import assert from 'node:assert/strict';
import {selfFixture} from './coach-self.fixture.ts';import {kpApi} from '../src/kp-api.ts';import {projectCoachSelfReport} from '../src/coach-self-report.ts';
import {recordCompetitiveRoster} from '../src/match-rosters.ts';import {recordCompetitiveRoundEvents} from '../src/round-events.ts';
const request=(path:string,token?:string,origin='https://altepop.github.io')=>new Request('https://worker/api/kp/coach/'+path,{headers:{Origin:origin,...token?{Authorization:'Bearer '+token}:{}}});
function game(id:string,who:number,alsoKobe=false):any{
 return {metadata:{match_id:id,queue:{id:'competitive'},is_completed:true,started_at:'2026-11-19T00:00:00Z',game_length_in_ms:1000000,map:{name:'Ascent'}},
 players:Array.from({length:10},(_,i)=>({puuid:i===0?'private-puuid-'+who+'-0':i===1&&alsoKobe?'private-puuid-0-1':'opponent-'+id+'-'+i,team_id:i<5?'Blue':'Red',
 name:i===0?['Abema','Dolly','h1d3g1g4s','frin','mecael'][who]:i===1&&alsoKobe?'Aquatopia':i===2?'frin':'Other',tag:i===0?['ttv','SDGs','1037','怖すぎ','2489'][who]:i===1&&alsoKobe?'toppy':i===2?'怖すぎ':'private-tag',agent:{name:'Sage'},stats:{kills:i===0?1:0,deaths:i===5?1:0,assists:0,score:100}})),
 teams:[{team_id:'Blue',won:true,rounds:{won:13}},{team_id:'Red',won:false,rounds:{won:8}}],rounds:Array.from({length:21},(_,id)=>({id,winning_team:id<13?'Blue':'Red'})),kills:[{round:0,time_in_round_in_ms:100,killer:{puuid:'private-puuid-'+who+'-0'},victim:{puuid:'opponent-'+id+'-5'}}]};
}
test('me defaults to the authenticated person, deduplicates two Kobe accounts and never exposes named co-players or raw identifiers',async t=>{t.mock.method(globalThis,'fetch',async()=>{throw Error('Unexpected outbound coaching request');});const f=await selfFixture();try{
 for(const m of [game('own',0,true),game('own-solo',0),game('vdk-only',1)]){await recordCompetitiveRoster(f.db,m);await recordCompetitiveRoundEvents(f.db,m);}
 const before=f.queries.length;let r=await kpApi(request('me?person=VDK&user=stolen',f.tokens[0]),f.env,f.mapping);assert.equal(r.status,200);const body=await r.json() as any;
 assert.equal(body.identity.defaultProfile,'神戸');assert.equal(body.report.performance.overall.matches,1);assert.equal(body.report.accounts.length,2);assert.equal(body.report.archivedMatches,2,'a shared match row is counted once');assert.equal(body.report.performance.quality.excluded['multiple-owned-accounts-in-match'],1);assert.equal(body.memberHistory.people.length,2);assert.equal(body.report.performance.teammates,undefined);
 const leaked:string[]=[];const inspect=(v:any,path='')=>{if(typeof v==='string'&&/private-puuid|opponent-|vdk-only|private-tag|frin|藤村|Dolly|VDK/.test(v))leaked.push(path+': '+v);else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v))inspect(x,path+'.'+k);};inspect(body);assert.deepEqual(leaked,[]);assert.ok(!f.queries.slice(before).some(q=>/^(INSERT|UPDATE|DELETE|CREATE).*coach_(profiles|profile_accounts|goals)/is.test(q)),'coaching reads never create profiles or write settings');
 r=await kpApi(request('me',f.tokens[1]),f.env,f.mapping);assert.equal((await r.json() as any).identity.defaultProfile,'VDK');
 }finally{f.close();}});
test('all legacy/private entry points authorize before reading any match rows',async()=>{const f=await selfFixture();try{
 for(const path of ['member?person=神戸','member?person=Abema','member?person=Aquatopia','member?person=unknown','comparison?people=VDK','summary?subject=private']){
  const from=f.queries.length,r=await kpApi(request(path,f.tokens[1]),f.env,f.mapping);assert.equal(r.status,404,path);assert.ok(!f.queries.slice(from).some(q=>q.includes('FROM valorant_match_rosters')),path+' performs no analysis');
 }
 assert.equal((await kpApi(request('rounds',f.tokens[1]),f.env,f.mapping)).status,410);
 assert.deepEqual(await (await kpApi(request('directory',f.tokens[1]),f.env,f.mapping)).json(),{people:[],sharingAvailable:true});
 assert.equal((await kpApi(request('me'),f.env,f.mapping)).status,401);
 assert.equal((await kpApi(request('me',f.tokens[0],'https://evil.invalid'),f.env,f.mapping)).status,403);
 }finally{f.close();}});
test('owner aliases work and a matching Riot name with the wrong PUUID never enters the report',async()=>{const f=await selfFixture();try{
 const m=game('name-reused',0);m.players[0].puuid='wrong-owner';await recordCompetitiveRoster(f.db,m);
 const response=await kpApi(request('member?person=Abema',f.tokens[0]),f.env,f.mapping);assert.equal(response.status,200);const body=await response.json() as any;assert.equal(body.archivedMatches,0);assert.equal(body.performance.overall.matches,0);
 }finally{f.close();}});
test('own status is scoped, and valid participant without a coach link receives no fallback report',async()=>{const f=await selfFixture();try{
 const status=await (await kpApi(request('members/status',f.tokens[2]),f.env,f.mapping)).json() as any;assert.equal(status.memberHistory.people.length,1);assert.equal(status.memberHistory.people[0].person,'石原');
 f.sql.prepare('DELETE FROM coach_profile_accounts WHERE subject_id IN (SELECT subject_id FROM coach_profiles WHERE owner_user=?)').run(f.mapping.accounts[2].discordUserId);
 f.sql.prepare('DELETE FROM coach_profiles WHERE owner_user=?').run(f.mapping.accounts[2].discordUserId);
 const result=await (await kpApi(request('me',f.tokens[2]),f.env,f.mapping)).json() as any;assert.equal(result.identity.status,'unregistered');assert.equal(result.report,null);
 }finally{f.close();}});
test('self projection rejects unknown fields at every depth and retains missing values without fabricating zeros',()=>{
 const projected=projectCoachSelfReport({person:'VDK',profile:'VDK',puuid:'secret',performance:{overall:{kd:null,kills:5,rawSecret:'secret'},timeline:[{kills:0,puuid:'secret',match_id:'secret'}],teammates:[{person:'藤村'}]},fullDiagnosis:{items:[{subject:'VDK',rawSecret:'secret',numerator:null}]},roundContext:{weapons:{knownKills:0,raw:'secret'}}});
 assert.doesNotMatch(JSON.stringify(projected),/secret|藤村|puuid|match_id/);assert.equal(projected.performance.overall.kd,null);assert.equal(projected.performance.timeline[0].kills,0);assert.equal(projected.fullDiagnosis.items[0].numerator,null);
});

test('a session from another guild is rejected before identity or report lookup',async()=>{const f=await selfFixture();try{const token=await createKpSession(f.env,'100000000000000999',f.mapping.accounts[0].discordUserId);const from=f.queries.length;assert.equal((await kpApi(request('me',token),f.env,f.mapping)).status,401);assert.ok(!f.queries.slice(from).some(q=>q.includes('FROM coach_profiles')));}finally{f.close();}});
