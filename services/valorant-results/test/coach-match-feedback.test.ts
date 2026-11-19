import test from 'node:test';import assert from 'node:assert/strict';
import {coachPerformance} from '../src/coach-performance.ts';
import {coachMatchFeedback} from '../src/coach-match-feedback.ts';
import type {CoachCombatObservation} from '../src/coach-round-contribution.ts';
const start=1700000000000,accounts=[{puuid:'private-self',name:'Fixture',tag:'X'}];
function row(i:number,k:number|null=15,d:number|null=15,damage:number|null=2400,agent='Sage',map='Ascent',won=true,rounds=true,at=start+i*10000){
 return {match_id:'private-game-'+i,ended_at:at,map,rounds_json:null,teams_json:rounds?JSON.stringify([{id:'Blue',rounds:13,won},{id:'Red',rounds:7,won:!won}]):null,
  players_json:JSON.stringify([{puuid:'private-self',team_id:'Blue',agent,k,d,a:5,damageDealt:damage},...Array.from({length:9},(_,j)=>({puuid:'private-peer-'+j,team_id:j<4?'Blue':'Red'}))])};
}
const perf=(rows:ReturnType<typeof row>[])=>coachPerformance(rows,accounts);
const events=(change:Partial<CoachCombatObservation>={}):CoachCombatObservation=>({rounds:20,enemyKills:8,totalDeaths:10,enemyKnownKillerDeaths:10,teammateRetaliations5s:5,tradeKills5s:1,diedAfterKill5s:0,...change});
test('lessons explain meaning, mechanism, a timed exercise and a specific next game action for all selected families',()=>{
 const cases=[{name:'conversion',r:row(3,10,15,2400)},{name:'participation',r:row(3,10,15,1800)},{name:'pressure',r:row(3,15,20)},
  {name:'repeat',r:row(3,20,10)},{name:'timing',r:row(3,15,15,2400,'Sage','Ascent',false)}];
 for(const c of cases){const f=coachMatchFeedback(perf([c.r,row(2),row(1)])).sessions[0];assert.equal(f.topic,c.name);
  assert.ok(f.lesson.meaning);assert.ok(f.lesson.why);assert.ok(f.lesson.alternatives);assert.equal(f.lesson.practice.steps.length,3);assert.ok(f.lesson.practice.minutes>0);assert.ok(f.lesson.nextGame);assert.ok(f.lesson.selfCheck);}
});
test('one stored match teaches a hypothesis without inventing a prior decline or a stable strength',()=>{
 const a=coachMatchFeedback(perf([row(1,10,20)])).sessions[0];assert.equal(a.topic,'pressure');assert.match(a.lesson.meaning,/これだけで以前より悪化したとは決めず/);assert.equal(a.followUp.status,'baseline');
 const b=coachMatchFeedback(perf([row(1,20,10)])).sessions[0];assert.equal(b.topic,'repeat');assert.match(b.lesson.meaning,/上達の証明にはしない/);
});
test('the documented 0.1 per round boundary survives binary floating point representation',()=>{
 const f=coachMatchFeedback(perf([row(3,13,15,1800),row(2),row(1)])).sessions[0];
 assert.equal(f.metrics[0].current!.value,.65);assert.equal(f.metrics[0].baseline!.value,.75);assert.equal(f.topic,'participation');
});
test('verified event observations select post-kill reset or cover, and missing observations never become zero followups',()=>{
 for(const [topic,event] of [['reset',events({diedAfterKill5s:4})],['cover',events({teammateRetaliations5s:1})]] as const){
  const r=coachMatchFeedback(perf([row(1)]),new Map([[start+10000,event]])).sessions[0];assert.equal(r.topic,topic);assert.equal(r.eventVerified,true);assert.match(r.lesson.alternatives,/決めない|確定値ではなく/);
 }
 const r=coachMatchFeedback(perf([row(1)])).sessions[0];assert.equal(r.eventVerified,false);assert.equal(r.topic,'foundation');assert.equal(r.evidence.some(e=>e.includes('5秒')),false);
});
test('feedback for an older game never uses a newer result to choose its exercise or grade its previous assignment',()=>{
 const before=coachMatchFeedback(perf([row(3,10,20),row(2),row(1)])).sessions[0];
 const after=coachMatchFeedback(perf([row(4,50,1),row(3,10,20),row(2),row(1)])).sessions[1];assert.deepEqual(after,before);
});
test('per-game feedback is dated, capped and deduplicated without exposing internal identities',()=>{
 const r=coachMatchFeedback(perf([...Array.from({length:20},(_,i)=>row(i+1)),row(1)]));assert.equal(r.sessions.length,12);assert.equal(r.sessions[0].date,new Date(start+200000).toISOString());assert.equal(r.quality.availableChronologicalMatches,20);
 for(const secret of ['private-self','private-peer','private-game'])assert.equal(JSON.stringify(r).includes(secret),false);
});
test('same-map agent history is preferred to different roles and the current game is excluded',()=>{
 const rows=[row(5,30,5),row(4,1,30,100,'Jett','Lotus'),row(3,15,15),row(2,15,15),row(1,1,30,100,'Jett','Lotus')];
 const s=coachMatchFeedback(perf(rows)).sessions[0];assert.equal(s.scope,'同じマップ・エージェント');assert.equal(s.baselineMatches,2);assert.equal(s.metrics[0].baseline!.numerator,30);assert.equal(s.metrics[0].baseline!.rounds,40);
});
test('missing rates, damage and kill events leave their own denominators unknown without blocking a concrete lesson',()=>{
 const s=coachMatchFeedback(perf([row(1,null,null,null,'Sage','Ascent',true,false)])).sessions[0];assert.equal(s.topic,'foundation');assert.ok(s.lesson.practice.steps.length);assert.equal(s.metrics.every(m=>m.current===null),true);assert.equal(s.eventVerified,false);
});
test('a first match and an empty account offer a concrete starter without fake per-match history',()=>{
 const empty=coachMatchFeedback(perf([]));assert.equal(empty.sessions.length,0);assert.equal(empty.starter!.practice.steps.length,3);assert.match(empty.starter!.alternatives,/個人の弱点診断ではなく/);
 assert.equal(coachMatchFeedback(perf([row(1)])).sessions[0].followUp.status,'baseline');
});
test('undated or tied records never steal an event observation or become an earlier match by accident',()=>{
 const at=start+10000,p=perf([row(1),row(2,15,15,2400,'Sage','Ascent',true,true,at),row(3,15,15,2400,'Sage','Ascent',true,true,0)]);
 const f=coachMatchFeedback(p,new Map([[at,events({diedAfterKill5s:4})]]));assert.equal(f.sessions.length,2);assert.equal(f.quality.undatedExcluded,1);assert.equal(f.quality.ambiguousTimeMatches,2);assert.equal(f.sessions.every(s=>!s.eventVerified&&s.followUp.status==='baseline'&&s.baselineMatches===0),true);
});
test('lower deaths with fewer kills is mixed feedback, never proof that a practice was completed',()=>{
 const s=coachMatchFeedback(perf([row(2,5,10),row(1,10,20)])).sessions[0];assert.equal(s.followUp.status,'mixed');assert.equal(s.followUp.practiceVerified,false);assert.match(s.followUp.text,/前回 1.000 \(20\/20R\) → 今回 0.500 \(10\/20R\)/);assert.match(s.followUp.text,/片方だけで成功としない/);
});
test('a missing or zero event denominator asks for self-check rather than announcing success',()=>{
 const r=coachMatchFeedback(perf([row(2),row(1)]),new Map([[start+10000,events({diedAfterKill5s:4})],[start+20000,events({enemyKills:0,diedAfterKill5s:0})]]));
 assert.equal(r.sessions[0].previousTopic,'reset');assert.equal(r.sessions[0].followUp.status,'self-check');assert.equal(r.sessions[0].followUp.practiceVerified,false);
});

test('the same numbers produce role-specific practice, without pretending to observe position or skill usage',()=>{
 const agents=['Jett','Omen','Sova','Sage'],steps=[];
 for(const agent of agents){
  const p=perf([row(1,10,20,2400,agent)]),s=coachMatchFeedback(p).sessions[0];
  assert.equal(s.topic,'pressure');assert.match(s.lesson.meaning,new RegExp(agent));assert.ok(p.timeline[0].role);assert.match(s.lesson.alternatives,/練習案/);steps.push(s.lesson.practice.steps[2]);
 }
 assert.equal(new Set(steps).size,4);
 assert.match(steps[0],/入る入口/);assert.match(steps[1],/スモーク/);assert.match(steps[2],/索敵/);assert.match(steps[3],/裏・別入口/);
 const unknown=coachMatchFeedback(perf([row(1,10,20,2400,'Unknown')])).sessions[0];assert.equal(unknown.lesson.practice.steps[2].includes('合流条件'),false);
});
