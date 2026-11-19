import test from 'node:test';import assert from 'node:assert/strict';import {URL as NodeURL} from 'node:url';
import {selfFixture} from './coach-self.fixture.ts';import {kpApi} from '../src/kp-api.ts';import {parseCoachGoal,readCoachGoals,saveCoachGoal,COACH_RANKS,GoalError} from '../src/coach-goals.ts';
const id='12345678-1234-4123-8123-123456789abc';
const body=(extra={})=>({goalId:id,kind:'process',expectedVersion:0,action:'遮蔽へ戻る経路を決めます',steps:['交戦前に確認します'],selfCheck:'最初の3交戦を振り返ります',targetRank:null,targetDate:'2028-02-29',status:'active',...extra});
const input=async(extra={})=>parseCoachGoal(new Request('https://test.invalid',{method:'POST',body:JSON.stringify(body(extra))}));
const subject=(f:Awaited<ReturnType<typeof selfFixture>>,n=0)=>(f.sql.prepare('SELECT subject_id FROM coach_profiles WHERE owner_user=?').get(f.mapping.accounts[n].discordUserId) as {subject_id:string}).subject_id;
const api=(f:Awaited<ReturnType<typeof selfFixture>>,path:string,b?:unknown,n=0,origin='https://altepop.github.io')=>kpApi(new Request(new NodeURL('/api/kp/coach/'+path,'https://test.invalid').href,{method:b===undefined?'GET':'POST',headers:{Origin:origin,Authorization:'Bearer '+f.tokens[n]},...(b!==undefined?{body:JSON.stringify(b)}:{})}),f.env,f.mapping);
test('private goals: create, retry, edit CAS, terminal status, bounded history and active uniqueness',async()=>{const f=await selfFixture();try{
 const s=subject(f),g=f.mapping.guildId,original=await input();
 const created=await saveCoachGoal(f.db,g,s,original,1000);assert.equal(created.created,true);assert.equal(created.goal.version,1);
 assert.equal((await saveCoachGoal(f.db,g,s,original)).created,false);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM coach_goals').get()?.n,1);
 await assert.rejects(saveCoachGoal(f.db,g,s,await input({goalId:'22345678-1234-4123-8123-123456789abc'})),(e:GoalError)=>e.status===409);
 await assert.rejects(saveCoachGoal(f.db,g,s,await input({action:'別の内容'})),(e:GoalError)=>e.status===409);
 const updated=await saveCoachGoal(f.db,g,s,await input({expectedVersion:1,action:'更新します'}),2000);assert.equal(updated.goal.version,2);
 await assert.rejects(saveCoachGoal(f.db,g,s,await input({expectedVersion:1})),(e:GoalError)=>e.status===409);
 assert.equal((await saveCoachGoal(f.db,g,s,original)).goal.action,'更新します','create retry never rewinds edited content');
 const ended=await saveCoachGoal(f.db,g,s,await input({expectedVersion:2,status:'self-achieved'}),3000);assert.equal(ended.goal.status,'self-achieved');
 await assert.rejects(saveCoachGoal(f.db,g,s,await input({expectedVersion:3})),(e:GoalError)=>e.status===409);
 const rank=await input({goalId:'32345678-1234-4123-8123-123456789abc',kind:'rank',action:'',steps:[],selfCheck:'',targetRank:'diamond2'});await saveCoachGoal(f.db,g,s,rank);
 const result=await readCoachGoals(f.db,g,s);assert.equal(result.goals.length,1);assert.equal(result.history.length,1);assert.equal(result.history[0].status,'self-achieved');assert.equal(JSON.stringify(result).includes('create_hash'),false);assert.equal(JSON.stringify(result).includes(s),false);
 for(let i=0;i<25;i++){const goalId=crypto.randomUUID();await saveCoachGoal(f.db,g,s,await input({goalId}),4000+i);await saveCoachGoal(f.db,g,s,await input({goalId,expectedVersion:1,status:'archived'}),4000+i);}
 assert.equal((await readCoachGoals(f.db,g,s)).history.length,20);
 const plan=f.sql.prepare("EXPLAIN QUERY PLAN SELECT goal_id FROM coach_goals WHERE guild=? AND subject_id=? AND status<>'active' ORDER BY updated_at DESC,goal_id LIMIT 20").all(g,s);assert.match(JSON.stringify(plan),/coach_goals_history/);
}finally{f.close();}});
test('goal input validates UTF-8 byte limit, Unicode length, official ranks and real calendar dates',async()=>{
 assert.equal(COACH_RANKS.length,25);await input({action:'あ'.repeat(200)});await input({action:'😀'.repeat(200)});
 for(const extra of [{action:'あ'.repeat(201)},{steps:['a'.repeat(81)]},{steps:['1','2','3','4']},{selfCheck:'a'.repeat(121)},{action:''},{action:'a\nb'},{targetDate:'2026-02-29'},{targetDate:'2026-13-01'},{targetDate:'0'},{targetDate:'1999-01-01'},{kind:'rank',action:'',steps:[],selfCheck:'',targetRank:'unranked'},{kind:'rank',targetRank:'diamond1'},{targetRank:'diamond1'},{owner:'fake'},{subjectId:'fake'},{expectedVersion:-1},{expectedVersion:1.1},{goalId:'123'}])await assert.rejects(input(extra),GoalError,JSON.stringify(extra));
 await assert.rejects(parseCoachGoal(new Request('https://test.invalid',{method:'POST',body:'あ'.repeat(1500)})),(e:GoalError)=>e.status===413);
 await assert.rejects(parseCoachGoal(new Request('https://test.invalid',{method:'POST',body:new Uint8Array([0xff])})),GoalError);
 await assert.rejects(parseCoachGoal(new Request('https://test.invalid',{method:'POST',body:'null'})),GoalError);
});
test('API rejects other owners, forged subject, wrong origin, missing auth and cross-guild; goals never query analytics or wallet ledger',async()=>{const f=await selfFixture();try{
 const before=Number(f.sql.prepare('SELECT COUNT(*) n FROM kp_ledger').get()?.n??0);const start=f.queries.length;
 const r=await api(f,'goals',body());assert.equal(r?.status,200);const saved=await r!.json() as {goal:{goalId:string}};assert.equal(saved.goal.goalId,id);
 const own=await api(f,'goals');assert.equal(((await own!.json()) as {goals:unknown[]}).goals.length,1);
 const other=await api(f,'goals',undefined,1);assert.equal(((await other!.json()) as {goals:unknown[]}).goals.length,0);
 assert.equal((await api(f,'goals',body({expectedVersion:1}),1))?.status,404);
 assert.equal((await api(f,'goals',body({subject_id:subject(f)}),1))?.status,400);
 assert.equal((await api(f,'goals',body(),0,'https://bad.invalid'))?.status,403);
 assert.equal((await kpApi(new Request('https://test.invalid/api/kp/coach/goals',{headers:{Origin:'https://altepop.github.io'}}),f.env,f.mapping))?.status,401);
 assert.equal((await kpApi(new Request('https://test.invalid/api/kp/coach/goals',{headers:{Origin:'https://altepop.github.io',Authorization:'Bearer '+f.tokens[0]}}),f.env,{...f.mapping,guildId:'200000000000000100'}))?.status,401);
 assert.equal(Number(f.sql.prepare('SELECT COUNT(*) n FROM kp_ledger').get()?.n??0),before);
 assert.doesNotMatch(f.queries.slice(start).join('\n'),/FROM match_rosters|FROM round_events|FROM match_positions|INSERT INTO kp_ledger|UPDATE kp_wallets/i);
 // Both known Kobe account aliases resolve to the same person-owned goal table.
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM coach_profile_accounts WHERE subject_id=?').get(subject(f))?.n,2);
}finally{f.close();}});
test('two simultaneous edits cannot overwrite each other and person foreign key is enforced',async()=>{const f=await selfFixture();try{
 const g=f.mapping.guildId,s=subject(f);await saveCoachGoal(f.db,g,s,await input());
 const results=await Promise.allSettled([saveCoachGoal(f.db,g,s,await input({expectedVersion:1,action:'A'})),saveCoachGoal(f.db,g,s,await input({expectedVersion:1,action:'B'}))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 await assert.rejects(saveCoachGoal(f.db,g,'unknown',await input()));
}finally{f.close();}});
test('both kinds coexist, me/status include private goals, account report/export does not, sharing never grants goal access',async()=>{const f=await selfFixture();try{
 await api(f,'goals',body());const r=await api(f,'goals',body({goalId:'32345678-1234-4123-8123-123456789abc',kind:'rank',targetRank:'radiant',action:'',steps:[],selfCheck:''}));assert.equal(r?.status,200);
 for(const path of ['me','members/status']){const envelope=await (await api(f,path))!.json() as {goals:{goals:unknown[]}};assert.equal(envelope.goals.goals.length,2);}
 const account=await (await api(f,'member?person=Aquatopia'))!.json();assert.ok(!Object.hasOwn(account as object,'goals'));
 f.sql.prepare("UPDATE coach_profiles SET visibility='guild-summary' WHERE subject_id=?").run(subject(f));
 const other=await (await api(f,'goals',undefined,1))!.json() as {goals:unknown[]};assert.equal(other.goals.length,0);
 assert.equal((await api(f,'goals',body({expectedVersion:1}),1))?.status,404);
}finally{f.close();}});
