import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {summarizeCoachRounds,readCoachRoundReport} from '../src/coach-round-analysis.ts';

type Round={r:number;winner?:string|null;attack?:string|null;defense?:string|null};
type Kill={r:number;t:number;killer:string|null;victim:string};
function fixture(match_id:string,map:string,vdkAgent:string,abemaAgent:string,
 rounds:Round[],kills:Kill[]){
 const players=Array.from({length:10},(_,i)=>({
  puuid:'p'+i,
  team_id:i<5?'Blue':'Red',
  name:i===0?'Dolly':i===1?'Abema':i===2?'h1d3g1g4s':'member'+i,
  tag:i===0?'SDGs':i===1?'ttv':i===2?'1037':'N',
  agent:i===0?vdkAgent:i===1?abemaAgent:i===2?'Phoenix':'Sova'
 }));
 return {match_id,map,players_json:JSON.stringify(players),
  rounds_json:JSON.stringify(rounds),kills_json:JSON.stringify(kills)};
}
test('separates opening kills, converted rounds, lost advantages and comebacks',()=>{
 const corrode=fixture('c','Corrode','Fade','Clove',[
  {r:0,winner:'Red'},{r:1,winner:'Blue'},{r:2,winner:'Blue'}],[
  {r:0,t:500,killer:'p2',victim:'p5'},
  {r:0,t:600,killer:'p1',victim:'p6'},
  {r:0,t:700,killer:'p7',victim:'p1'},
  {r:0,t:900,killer:'p7',victim:'p1'}, // Clove could revive.
  {r:1,t:500,killer:'p0',victim:'p5'},
  {r:2,t:500,killer:'p6',victim:'p0'}
 ]);
 const report=summarizeCoachRounds([corrode]);
 assert.equal(report.archivedMatches,1);
 assert.equal(report.overall.rounds,3);
 assert.equal(report.overall.ourFirstKills,2);
 assert.equal(report.overall.enemyFirstKills,1);
 assert.equal(report.overall.firstKillWins,1);
 assert.equal(report.overall.firstKillLosses,1);
 assert.equal(report.overall.comebackWins,1);
 assert.equal(report.overall.firstKillWinPct,50);
 assert.equal(report.overall.repeatedVictimRounds,1);
 assert.equal(report.overall.roundsWithSides,0);
 assert.deepEqual(report.trioComparisons.map(r=>r.composition),['Fade + Clove']);
 assert.equal(JSON.stringify(report).includes('p0'),false,'never leak a PUUID');
 assert.equal(JSON.stringify(report).includes('member3'),false,'never leak opponents');
});
test('unknown winners, missing events and unpaired players are not treated as losses',()=>{
 const a=fixture('a','Lotus','Skye','Clove',[
  {r:0,winner:null},{r:1,winner:'Blue',attack:'Blue',defense:'Red'}],[
  {r:0,t:12,killer:'p1',victim:'p8'},
  {r:1,t:300,killer:'p8',victim:'p0'}
 ]);
 const absent={...fixture('missing','Abyss','Omen','Gekko',[{r:0,winner:'Blue'}],[]),kills_json:null};
 const report=summarizeCoachRounds([a,absent]);
 assert.equal(report.overall.matches,2);
 assert.equal(report.overall.winnerKnown,2);
 assert.equal(report.overall.roundsWithFk,2);
 assert.equal(report.overall.firstKillOutcomesKnown,0);
 assert.equal(report.overall.firstKillWinPct,null);
 assert.equal(report.overall.roundsWithSides,1);
 assert.equal(report.killDataMissing,1);
 assert.equal(report.overall.comebackWins,1);
});
test('cannot treat friendly fire or an invalid roster as a team opening kill',()=>{
 const raw=fixture('a','Corrode','Fade','Clove',[{r:0,winner:'Red'}],[
  {r:0,t:50,killer:'p0',victim:'p1'},
  {r:0,t:100,killer:'p5',victim:'p2'}]);
 const broken=fixture('b','Corrode','Fade','Clove',[{r:0,winner:'Blue'}],[]);
 broken.players_json='[{}]';
 const report=summarizeCoachRounds([raw,broken]);
 assert.equal(report.overall.enemyFirstKills,1);
 assert.equal(report.invalidMatches,1);
});
test('D1 report reads only stored archives and counts historical roster candidates',async()=>{
 const sql=new DatabaseSync(':memory:');
 try{
  sql.exec(`CREATE TABLE valorant_match_rosters(match_id TEXT PRIMARY KEY,map TEXT,ended_at INTEGER,players_json TEXT);
   CREATE TABLE valorant_match_round_events(match_id TEXT PRIMARY KEY,rounds_json TEXT,kills_json TEXT);`);
  const row=fixture('a','Corrode','Fade','Clove',[{r:0,winner:'Blue'}],
    [{r:0,t:300,killer:'p0',victim:'p5'}]);
  sql.prepare('INSERT INTO valorant_match_rosters VALUES(?,?,?,?)').run(row.match_id,row.map,1000,row.players_json);
  sql.prepare('INSERT INTO valorant_match_round_events VALUES(?,?,?)').run(row.match_id,row.rounds_json,row.kills_json);
  let writes=0;
  const db={prepare:(query:string)=>({
   all:async()=>({results:sql.prepare(query).all()}),
   first:async()=>sql.prepare(query).get()??null,
   run:async()=>{writes++;throw Error('read-only violated');}
  })} as unknown as D1Database;
  const report=await readCoachRoundReport(db);
  assert.equal(report.totalVdkRosterMatches,1);
  assert.equal(report.archivedMatches,1);
  assert.equal(report.overall.firstKillWinPct,100);
  assert.equal(writes,0);
 }finally{sql.close()}
});
