import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {summarizeCoachRounds,readCoachRoundReport,invalidateCoachRoundReport} from '../src/coach-round-analysis.ts';

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
 return {match_id,map,ended_at:1794666339000,players_json:JSON.stringify(players),
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
 assert.equal(report.archivedMatches,2);
 assert.equal(report.usableMatches,1,'only fully observed match is evaluated');
 assert.equal(report.overall.matches,1);
 assert.equal(report.overall.winnerKnown,1);
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
  sql.exec(`CREATE TABLE valorant_match_rosters(match_id TEXT PRIMARY KEY,map TEXT,ended_at INTEGER,players_json TEXT,teams_json TEXT);
   CREATE TABLE valorant_match_round_events(match_id TEXT PRIMARY KEY,rounds_json TEXT,kills_json TEXT);\n   CREATE TABLE monitor_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  const row=fixture('a','Corrode','Fade','Clove',[{r:0,winner:'Blue'}],
    [{r:0,t:300,killer:'p0',victim:'p5'}]);
  sql.prepare('INSERT INTO valorant_match_rosters VALUES(?,?,?,?,?)').run(row.match_id,row.map,1000,row.players_json,null);
  sql.prepare('INSERT INTO valorant_match_round_events VALUES(?,?,?)').run(row.match_id,row.rounds_json,row.kills_json);
  let writes=0,reads=0;
  const db={prepare:(query:string)=>({
   all:async()=>{reads++;return {results:sql.prepare(query).all()}},
   first:async()=>{reads++;return sql.prepare(query).get()??null;},
   run:async()=>{writes++;throw Error('read-only violated');}
  })} as unknown as D1Database;
  const report=await readCoachRoundReport(db);
  assert.equal(report.totalVdkRosterMatches,1);
  assert.deepEqual(report.backfill,{status:'disabled',complete:1,partial:0,missing:0,unavailable:0,pending:0});
  assert.equal(report.archivedMatches,1);
  assert.equal(report.overall.firstKillWinPct,100);
  assert.equal((await readCoachRoundReport(db)).overall.firstKillWinPct,100);
  assert.equal(reads,2,'subsequent requests within the five-minute cache should not rescan D1');
  assert.equal(writes,0);
 }finally{sql.close()}
});

test('per-player opening rounds distinguish a fast loss, a fast reply and an FK conversion',()=>{
 const match=fixture('team','Corrode','Fade','Clove',[
  {r:0,winner:'Red'}, {r:1,winner:'Blue'}, {r:2,winner:'Blue'},
  {r:3,winner:null}
 ],[
  {r:0,t:1000,killer:'p2',victim:'p5'},
  {r:0,t:1200,killer:'p6',victim:'p2'}, // Ishihara gets traded in 0.2s.
  {r:1,t:1000,killer:'p5',victim:'p1'}, // Abema initial death.
  {r:1,t:1400,killer:'p0',victim:'p5'}, // VDK eliminates FK killer in 0.4s.
  {r:2,t:1000,killer:'p1',victim:'p7'}, // Abema opening converted.
  {r:2,t:1200,killer:'p8',victim:'p1'},
  {r:2,t:1400,killer:'p8',victim:'p1'}, // Clove may self-revive.
  {r:3,t:1000,killer:'p0',victim:'p8'} // Unknown winner is not a loss.
 ]);
 const report=summarizeCoachRounds([match]);
 const vdk=report.individual.find(p=>p.player==='VDK')!;
 const abema=report.individual.find(p=>p.player==='Abema')!;
 const ishihara=report.individual.find(p=>p.player==='石原')!;
 assert.equal(vdk.firstKills,1);
 assert.equal(vdk.firstDeaths,0);
 assert.equal(vdk.firstKillWinPct,null,'unknown winner is not an FK loss');
 assert.equal(abema.firstKills,1);
 assert.equal(abema.firstDeaths,1);
 assert.equal(abema.firstDeathWins,1);
 assert.equal(abema.firstDeathLosses,0);
 assert.equal(abema.firstDeathRecoveryPct,100);
 assert.equal(abema.firstDeathKillerEliminatedWithin5s,1);
 assert.equal(abema.openingKillerDiedWithin5s,1,'revive does not double-count');
 assert.equal(abema.firstKillWins,1);
 assert.equal(abema.firstKillWinPct,100);
 assert.equal(ishihara.firstKills,1);
 assert.equal(ishihara.firstDeaths,0);
 assert.equal(ishihara.firstKillLosses,1);
 assert.equal(ishihara.openingKillerDiedWithin5s,1);
 assert.equal(report.individualMapAgent.find(p=>p.player==='VDK')?.agent,'Fade');
 assert.equal(JSON.stringify(report).includes('p1'),false,'no raw PUUIDs in response');
});
test('a support player absent from a match, and missing kill timelines, are not called zero FK rate',()=>{
 const a=fixture('one','Abyss','Omen','Gekko',[{r:0,winner:'Blue'}],
  [{r:0,t:1000,killer:'p5',victim:'p1'}]);
 const b={...fixture('two','Lotus','Skye','Clove',[{r:0,winner:'Blue'}],[]),kills_json:null};
 const report=summarizeCoachRounds([a,b]);
 const vdk=report.individual.find(p=>p.player==='VDK')!;
 assert.equal(report.archivedMatches,2);
 assert.equal(report.usableMatches,1);
 assert.equal(vdk.matches,1);
 assert.equal(vdk.rounds,1);
 assert.equal(vdk.observedOpeningRounds,1);
 assert.equal(vdk.firstKills,0);
 assert.equal(vdk.firstKillPerObservedRoundPct,0);
 const skye=report.individualMapAgent.find(p=>p.map==='Lotus'&&p.player==='VDK');
 assert.equal(skye,undefined,'partial-only map is excluded from performance rankings');
 assert.equal(report.killDataMissing,1);
 const corrupt=fixture('three','Abyss','Omen','Gekko',[{r:0,winner:'Blue'}],
  [{r:0,t:1000,killer:'p5',victim:'unknown'}]);
 const report2=summarizeCoachRounds([corrupt]);
 assert.equal(report2.individual.length,0,'corrupt kill stream is excluded, not counted as zero deaths');
 assert.equal(report2.archivedMatches,1);
 assert.equal(report2.usableMatches,0);
 assert.equal(report2.killDataMissing,1);
});

test('backfill progress separates complete, partial, absent and source-unavailable matches',async()=>{
 const sql=new DatabaseSync(':memory:');
 try{
  sql.exec(`CREATE TABLE valorant_match_rosters(match_id TEXT PRIMARY KEY,map TEXT,ended_at INTEGER,players_json TEXT,teams_json TEXT);
   CREATE TABLE valorant_match_round_events(match_id TEXT PRIMARY KEY,rounds_json TEXT,kills_json TEXT);
   CREATE TABLE monitor_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  const r1=fixture('complete','Corrode','Fade','Clove',[{r:0,winner:'Blue'}],
   [{r:0,t:1000,killer:'p2',victim:'p7'}]);
  const r2=fixture('partial','Lotus','Skye','Clove',[{r:0,winner:'Blue'}],[]);
  const r3=fixture('absent','Abyss','Omen','Gekko',[{r:0,winner:'Blue'}],[]);
  for(const [i,r] of [r1,r2,r3].entries()){
   sql.prepare('INSERT INTO valorant_match_rosters VALUES(?,?,?,?,?)')
    .run(r.match_id,r.map,1000+i,r.players_json,null);
  }
  sql.prepare('INSERT INTO valorant_match_round_events VALUES(?,?,?)')
   .run(r1.match_id,r1.rounds_json,r1.kills_json);
  sql.prepare('INSERT INTO valorant_match_round_events VALUES(?,?,?)')
   .run(r2.match_id,r2.rounds_json,null);
  sql.prepare('INSERT INTO monitor_state VALUES(?,?)').run('coach_round_backfill:enabled','Dolly#SDGs');
  sql.prepare('INSERT INTO monitor_state VALUES(?,?)')
   .run('coach_round_backfill:unavailable:partial','missing_kills');
  let reads=0;
  const db={prepare:(query:string)=>({
    all:async()=>{reads++;return {results:sql.prepare(query).all()}},
    first:async()=>{reads++;return sql.prepare(query).get()??null;}
  })} as unknown as D1Database;
  const report=await readCoachRoundReport(db);
  assert.equal(report.totalVdkRosterMatches,3);
  assert.equal(report.backfill.status,'running');
  assert.equal(report.backfill.complete,1);
  assert.equal(report.backfill.partial,1);
  assert.equal(report.backfill.missing,1);
  assert.equal(report.backfill.unavailable,1);
  assert.equal(report.backfill.pending,1);
  assert.equal(reads,2,'one archive read and one expanded count query');
  assert.equal(report.overall.ourFirstKills,1,'partial does not fabricate opening kills');
  assert.equal(report.overall.matches,1,'partial is excluded from denominators');
  assert.equal(report.archivedMatches,2);
  assert.equal(report.usableMatches,1);
 }finally{sql.close()}
});

test('partial match with a known winner cannot bias team or individual denominators',()=>{
 const full=fixture('full','Corrode','Fade','Clove',[
   {r:0,winner:'Red'},{r:1,winner:'Blue'}
 ],[
   {r:0,t:1000,killer:'p5',victim:'p0'},
   {r:1,t:1000,killer:'p0',victim:'p5'}
 ]);
 const partial={...fixture('partial','Lotus','Fade','Clove',
   [{r:0,winner:'Blue'},{r:1,winner:'Blue'},{r:2,winner:'Blue'}],[]),
   kills_json:null};
 const result=summarizeCoachRounds([partial,full]);
 assert.equal(result.archivedMatches,2);
 assert.equal(result.usableMatches,1);
 assert.equal(result.killDataMissing,1);
 assert.equal(result.overall.matches,1);
 assert.equal(result.overall.rounds,2);
 assert.equal(result.overall.winnerKnown,2);
 assert.equal(result.overall.ourRoundWins,1,'three partial winners must not alter win rate');
 assert.equal(result.maps.length,1);
 assert.equal(result.maps[0].map,'Corrode');
 assert.equal(result.individual.find(p=>p.player==='VDK')?.matches,1);
 assert.equal(result.individual.find(p=>p.player==='VDK')?.observedOpeningRounds,2);
 assert.ok(result.individual.every(p=>p.matches===1),'only complete match contributes per-player sample');
});

test('first-death round recovery uses only observed winners and preserves all revive events',()=>{
 const data=fixture('fd','Corrode','Fade','Clove',[
  {r:0,winner:'Blue'},{r:1,winner:'Red'},{r:2,winner:null},
  {r:3,winner:'Blue'}
 ],[
  {r:0,t:1000,killer:'p5',victim:'p1'},
  {r:0,t:1100,killer:'p0',victim:'p5'},
  {r:1,t:2000,killer:'p6',victim:'p1'},
  {r:2,t:3000,killer:'p7',victim:'p1'},
  {r:3,t:1000,killer:'p1',victim:'p8'},
  {r:3,t:1200,killer:'p8',victim:'p1'},
  {r:3,t:1400,killer:'p8',victim:'p1'}
 ]);
 const result=summarizeCoachRounds([data]);
 const abema=result.individual.find(x=>x.player==='Abema')!;
 assert.equal(abema.firstDeaths,3);
 assert.equal(abema.firstDeathWins,1);
 assert.equal(abema.firstDeathLosses,1);
 assert.equal(abema.firstDeathRecoveryPct,50,'unknown winner excluded');
 assert.equal(abema.firstKills,1);
 assert.equal(abema.openingKillerDiedWithin5s,1,'revive does not duplicate FK metrics');
 assert.equal(abema.firstDeathKillerEliminatedWithin5s,1);
 assert.equal(result.overall.repeatedVictimRounds,1);
});

test('trusted roster team flags and player KDA/party are counted only for complete archives',()=>{
 const source=fixture('complete','Corrode','Fade','Clove',[{r:0,winner:'Blue'}],
  [{r:0,t:800,killer:'p0',victim:'p5'}]);
 const players=JSON.parse(source.players_json);
 players[0].k=18;players[0].d=11;players[0].a=6;players[0].score=4200;players[0].party_id='p-party';
 players[1].k=20;players[1].d=12;players[1].a=5;players[1].score=4400;players[1].party_id='p-party';
 players[2].k=10;players[2].d=14;players[2].a=9;players[2].score=3600;players[2].party_id=null;
 const row={...source,players_json:JSON.stringify(players),
  teams_json:JSON.stringify([{id:'Blue',won:true,rounds:13},{id:'Red',won:false,rounds:8}])};
 const partial={...row,match_id:'partial',kills_json:null};
 const report=summarizeCoachRounds([row,partial]);
 assert.equal(report.archivedMatches,2);
 assert.equal(report.usableMatches,1);
 assert.equal(report.overall.matchWins,1);
 assert.equal(report.overall.matchLosses,0);
 assert.equal(report.individual.find(x=>x.player==='VDK')?.statsMatches,1);
 assert.equal(report.individual.find(x=>x.player==='VDK')?.averageKills,18);
 assert.equal(report.individual.find(x=>x.player==='VDK')?.averageScore,4200);
 assert.equal(report.individual.find(x=>x.player==='Abema')?.samePartyAsVdk,1);
 assert.equal(report.individual.find(x=>x.player==='石原')?.partyUnknown,1);
 const undetermined={...row,match_id:'bad-teams',teams_json:JSON.stringify([
  {id:'Blue',won:false},{id:'Red',won:false}
 ])};
 const unknown=summarizeCoachRounds([undetermined]);
 assert.equal(unknown.overall.matchWins+unknown.overall.matchLosses,0,
  'absence of winning flag is unknown, never guessed as a loss or draw');
 assert.equal(unknown.overall.matchDraws,0);
 const drawn={...row,match_id:'draw',teams_json:JSON.stringify([
  {id:'Blue',won:false,rounds:14},{id:'Red',won:false,rounds:14}
 ])};
 const draws=summarizeCoachRounds([drawn]);
 assert.equal(draws.overall.matchDraws,1,'equal completed team round scores confirm a draw');
});

test('concurrent first opens share two D1 scans and preserve the five-minute cache',async()=>{
 let unblock!:()=>void;
 const gate=new Promise<void>(resolve=>{unblock=resolve;});
 let reads=0;
 const db={prepare:(query:string)=>({
  all:async()=>{reads++;await gate;return {results:[]};},
  first:async()=>{reads++;return {n:0,complete_n:0,missing_n:0,partial_n:0,
   unavailable_n:0,switch_value:null};}
 })} as unknown as D1Database;
 const now=Date.parse('2026-11-23T09:00:00Z');
 const first=readCoachRoundReport(db,now);
 const second=readCoachRoundReport(db,now);
 assert.equal(reads,1,'one pending roster query instead of two');
 unblock();
 const [one,two]=await Promise.all([first,second]);
 assert.equal(reads,2,'one roster scan and one progress scan in total');
 assert.deepEqual(one,two);
 assert.equal((await readCoachRoundReport(db,now+60000)).totalVdkRosterMatches,0);
 assert.equal(reads,2,'warm cache creates no additional scan');
 invalidateCoachRoundReport(db);
 await readCoachRoundReport(db,now+60000);
 assert.equal(reads,4,'explicit invalidation still re-reads both queries');
});

test('failed or invalidated in-flight report cannot block a fresh read or restore stale cache',async()=>{
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 let firstQuery=true,reads=0;
 const db={prepare:()=>({
  all:async()=>{reads++;if(firstQuery){firstQuery=false;await gate;return {results:[]};}
   return {results:[]};},
  first:async()=>{reads++;return {n:0,complete_n:0,missing_n:0,partial_n:0,
   unavailable_n:0,switch_value:null};}
 })} as unknown as D1Database;
 const now=Date.parse('2026-11-23T09:00:00Z');
 const stale=readCoachRoundReport(db,now);
 invalidateCoachRoundReport(db);
 await readCoachRoundReport(db,now+1000);
 assert.equal(reads,3,'fresh call does not join invalidated pending query');
 release();
 await stale;
 assert.equal(reads,4,'stale waiter finishes but does not change the fresh cache');
 await readCoachRoundReport(db,now+2000);
 assert.equal(reads,4,'new cache remains intact');
});

test('fixture query plan separates indexed match joins from per-roster json_each scans',async()=>{
 const {readFileSync}=await import('node:fs');
 const sql=new DatabaseSync(':memory:');
 try{
  sql.exec(readFileSync(new URL('../migrations/0006_competitive_match_rosters.sql',import.meta.url).pathname,'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0007_competitive_round_events.sql',import.meta.url).pathname,'utf8'));
  sql.exec('CREATE TABLE monitor_state(key TEXT PRIMARY KEY,value TEXT)');
  const queries:string[]=[];
  const db={prepare:(query:string)=>{queries.push(query);return {
   all:async()=>({results:sql.prepare(query).all()}),
   first:async()=>sql.prepare(query).get()??null
  }}} as unknown as D1Database;
  await readCoachRoundReport(db);
  assert.equal(queries.length,2,'cache-miss query count stays bounded');
  const plans=queries.map(query=>sql.prepare('EXPLAIN QUERY PLAN '+query).all()
   .map((row:any)=>String(row.detail)).join(' / '));
  assert.match(plans[0],/valorant_match_rosters_recent|SCAN r/);
  assert.match(plans[0],/SEARCH e .*match_id|SEARCH e USING INDEX/);
  assert.match(plans[0],/SCAN p VIRTUAL TABLE/);
  assert.match(plans[1],/SCAN p VIRTUAL TABLE/);
  // Fixture observations are not a production D1 query plan nor billed Rows read.
 }finally{sql.close();}
});
