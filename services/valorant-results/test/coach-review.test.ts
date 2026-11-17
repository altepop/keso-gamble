import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendReviewRounds,recommendSuccessRounds,coachNotes,detectCoachSignals} from '../src/coach-review.ts';

function match(id:string,map:string,ended_at:number,
 rounds:Array<{r:number;winner:string|null}>,
 kills:Array<{r:number;t:number;killer:string|null;victim:string}>){
 const players=Array.from({length:10},(_,i)=>({
  name:i===0?'Dolly':i===1?'Abema':i===2?'h1d3g1g4s':'anonymous'+i,
  tag:i===0?'SDGs':i===1?'ttv':i===2?'1037':'test',
  team_id:i<5?'Blue':'Red',puuid:'p'+i
 }));
 return {match_id:id,map,ended_at,players_json:JSON.stringify(players),
  rounds_json:JSON.stringify(rounds),kills_json:JSON.stringify(kills)};
}
test('realistic Corrode priority: two enemy deaths before first ally casualty, rapid collapse, near-instant opener loss',()=>{
 const data=match('private-id','Corrode',1794666339000,[
  {r:0,winner:'Red'},{r:19,winner:'Red'},{r:21,winner:'Red'},
  {r:20,winner:'Blue'},{r:22,winner:null}
 ],[
  {r:0,t:2700,killer:'p2',victim:'p5'},
  {r:0,t:18300,killer:'p1',victim:'p6'},
  {r:0,t:20700,killer:'p7',victim:'p1'},
  {r:0,t:32000,killer:'p8',victim:'p0'},
  {r:19,t:13700,killer:'p1',victim:'p6'},
  {r:19,t:17300,killer:'p7',victim:'p3'},
  {r:19,t:22600,killer:'p7',victim:'p0'},
  {r:19,t:23400,killer:'p7',victim:'p2'},
  {r:19,t:24800,killer:'p8',victim:'p1'},
  {r:21,t:6100,killer:'p1',victim:'p6'},
  {r:21,t:6200,killer:'p8',victim:'p1'},
  {r:20,t:2000,killer:'p2',victim:'p5'},
  {r:22,t:2000,killer:'p2',victim:'p5'}
 ]);
 const reviews=recommendReviewRounds([data]);
 assert.equal(reviews.length,3,'won and unknown winner rounds are never flagged');
 const byRound=new Map(reviews.map(x=>[x.round,x]));
 assert.equal(byRound.get(0)?.category,'two_opening_kills_lost');
 assert.equal(byRound.get(0)?.distinctEnemyKillsBeforeAllyDeath,2);
 assert.equal(byRound.get(19)?.category,'rapid_collapse');
 assert.equal(byRound.get(19)?.rapidAllyDeaths,3);
 assert.equal(byRound.get(21)?.category,'opener_eliminated');
 assert.equal(byRound.get(21)?.openerDiedWithin5s,true);
 assert.equal(byRound.get(21)?.firstKiller,'Abema');
 assert.equal(reviews[0].round,0);
 assert.ok(reviews.every(x=>!JSON.stringify(x).includes('private-id')));
 assert.ok(reviews.every(x=>!JSON.stringify(x).includes('anonymous')));
 assert.match(reviews[0].evidence,/ラウンドは敗北/);
});
test('duplicate Clove deaths do not masquerade as three different teammates dying',()=>{
 const data=match('a','Lotus',1794666339000,[{r:5,winner:'Red'}],[
  {r:5,t:1000,killer:'p1',victim:'p5'},
  {r:5,t:2000,killer:'p7',victim:'p1'},
  {r:5,t:3000,killer:'p7',victim:'p1'},
  {r:5,t:4000,killer:'p7',victim:'p1'}
 ]);
 const [review]=recommendReviewRounds([data]);
 assert.equal(review.rapidAllyDeaths,1);
 assert.equal(review.category,'opener_eliminated');
 assert.equal(review.openerDiedWithin5s,true);
});
test('incomplete records and wins never become accusations, cap and ordering are deterministic',()=>{
 const a=match('a','Lotus',1794666339000,[{r:0,winner:'Blue'}],
  [{r:0,t:1000,killer:'p1',victim:'p5'}]);
 const b=match('b','Lotus',1794666339000,[{r:0,winner:'Red'}],[]);
 const c=match('c','Lotus',1794666339000,[{r:0,winner:'Red'}],
  [{r:0,t:1000,killer:'p1',victim:'missing'}]);
 assert.deepEqual(recommendReviewRounds([a,b,c]),[]);
});
test('notes are conservative with small samples, and use exact observed counts',()=>{
 const base={
  archivedMatches:2,totalRowsRead:2,limitReached:false,
  overall:{firstKillWins:8,firstKillLosses:5,firstKillOutcomesKnown:13},
  individual:[{player:'VDK',matches:2,observedOpeningRounds:31,firstKills:0,
   firstDeaths:3,firstKillWins:0,firstKillLosses:0,
   openingKillerDiedWithin5s:0,firstDeathKillerEliminatedWithin5s:0}]
 };
 const insufficient=coachNotes(base);
 assert.ok(insufficient.some(x=>x.subject==='VDK'&&x.kind==='collect'));
 assert.ok(!insufficient.some(x=>x.subject==='VDK'&&x.kind==='review'));
 const ready=coachNotes({...base,archivedMatches:4,
  overall:{firstKillWins:17,firstKillLosses:8,firstKillOutcomesKnown:25},
  individual:[{player:'Abema',matches:4,observedOpeningRounds:50,
    firstKills:9,firstDeaths:7,firstKillWins:4,firstKillLosses:5,
    openingKillerDiedWithin5s:4,firstDeathKillerEliminatedWithin5s:1}]});
 assert.ok(ready.some(x=>x.subject==='チーム'&&x.kind==='review'));
 assert.ok(ready.some(x=>x.subject==='Abema'&&x.title.includes('先制キル直後')));
 assert.ok(ready.some(x=>x.subject==='Abema'&&x.title.includes('先制デス')));
 assert.ok(ready.every(x=>!x.action.includes('戦犯')));
});

test('signals distinguish strong FK conversion, risky fast re-death, and teammate FD response',()=>{
 const report={overall:{firstKillWins:22,firstKillLosses:8,firstKillOutcomesKnown:30},
  individual:[
   {player:'VDK',matches:8,observedOpeningRounds:160,firstKills:12,firstDeaths:12,
    firstKillWins:10,firstKillLosses:2,firstDeathWins:2,firstDeathLosses:10,
    openingKillerDiedWithin5s:1,firstDeathKillerEliminatedWithin5s:1},
   {player:'Abema',matches:8,observedOpeningRounds:160,firstKills:10,firstDeaths:10,
    firstKillWins:3,firstKillLosses:7,firstDeathWins:1,firstDeathLosses:9,
    openingKillerDiedWithin5s:6,firstDeathKillerEliminatedWithin5s:6}
  ]};
 const signals=detectCoachSignals(report);
 assert.ok(signals.some(s=>s.subject==='チーム'&&s.kind==='strength'));
 assert.ok(signals.some(s=>s.subject==='VDK'&&s.metric==='fk_conversion'&&
  s.kind==='strength'&&s.ratePct===83.3&&s.denominator===12));
 assert.ok(signals.some(s=>s.subject==='VDK'&&s.metric==='fk_survival'&&s.kind==='strength'));
 assert.ok(signals.some(s=>s.subject==='VDK'&&s.metric==='fd_response'&&s.kind==='review'));
 assert.ok(signals.some(s=>s.subject==='Abema'&&s.metric==='fk_conversion'&&s.kind==='review'));
 assert.ok(signals.some(s=>s.subject==='Abema'&&s.metric==='fk_survival'&&s.kind==='review'));
 assert.ok(signals.some(s=>s.subject==='Abema'&&s.metric==='fd_response'&&s.kind==='strength'));
 assert.ok(signals.every(s=>!s.evidence.includes('戦犯')&&!s.action.includes('確定')));
 assert.ok(signals.every(s=>Number.isFinite(s.ratePct??0)));
});

test('signals withhold FK and FD labels when sample or outcomes are insufficient',()=>{
 const p={player:'石原',matches:2,observedOpeningRounds:35,firstKills:8,firstDeaths:10,
  firstKillWins:0,firstKillLosses:0,firstDeathWins:0,firstDeathLosses:0,
  openingKillerDiedWithin5s:8,firstDeathKillerEliminatedWithin5s:0};
 const report={overall:{firstKillWins:1,firstKillLosses:0,firstKillOutcomesKnown:1},individual:[p]};
 const signals=detectCoachSignals(report);
 assert.equal(signals.length,1);
 assert.equal(signals[0].kind,'insufficient');
 assert.equal(signals[0].ratePct,null,'sample completeness is not a skill percentage');
 assert.ok(!signals.some(s=>s.kind==='strength'||s.kind==='review'));
 const enough={...p,matches:5,observedOpeningRounds:120,firstKills:0,firstDeaths:0,
  openingKillerDiedWithin5s:0,firstDeathKillerEliminatedWithin5s:0};
 const neutral=detectCoachSignals({...report,individual:[enough]});
 assert.equal(neutral.length,1);
 assert.equal(neutral[0].kind,'insufficient','zero FK is not evidence of poor support play');
 assert.equal(neutral[0].ratePct,null);
});

test('winning-round examples require verified outcomes, valid rosters and complete kill timelines',()=>{
 const matchRows=match('private-example','Corrode',1794666339000,[
  {r:0,winner:'Blue'},{r:1,winner:'Blue'},{r:2,winner:'Blue'},
  {r:3,winner:'Red'},{r:4,winner:null}
 ],[
  {r:0,t:1000,killer:'p0',victim:'p5'},
  {r:0,t:1200,killer:'p1',victim:'p6'},
  {r:0,t:9000,killer:'p7',victim:'p0'},
  {r:1,t:1000,killer:'p5',victim:'p0'},
  {r:1,t:1200,killer:'p1',victim:'p5'},
  {r:2,t:1000,killer:'p2',victim:'p5'},
  {r:2,t:10000,killer:'p7',victim:'p2'},
  {r:3,t:1000,killer:'p2',victim:'p5'},
  {r:4,t:1000,killer:'p2',victim:'p5'}
 ]);
 const result=recommendSuccessRounds([matchRows]);
 assert.equal(result.length,3);
 const byRound=new Map(result.map(x=>[x.round,x]));
 assert.equal(byRound.get(0)?.category,'early_two_kills_won');
 assert.equal(byRound.get(1)?.category,'enemy_fk_comeback_won');
 assert.equal(byRound.get(1)?.firstKiller,null,'enemy identities are never displayed');
 assert.equal(byRound.get(2)?.category,'fk_survived_won');
 assert.equal(byRound.get(2)?.firstKiller,'石原');
 assert.ok(!JSON.stringify(result).includes('private-example'));
 assert.ok(!JSON.stringify(result).includes('anonymous'));
 const invalid={...matchRows,kills_json:null};
 assert.deepEqual(recommendSuccessRounds([invalid]),[]);
 assert.equal(recommendSuccessRounds([matchRows],2).length,2);
});
