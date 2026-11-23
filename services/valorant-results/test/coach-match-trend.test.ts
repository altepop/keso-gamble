import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCoachMatchTrend} from '../src/coach-match-trend.ts';

const roster=(name='Aquatopia',tag='toppy',puuid='kobe-id')=>[
 {name,tag,puuid,team_id:'Blue',agent:'Sage',k:17,d:8,a:11},
 ...Array.from({length:4},(_,i)=>({name:'mate',tag:String(i),puuid:'ally'+i,team_id:'Blue',agent:'Omen',k:2,d:3,a:4})),
 ...Array.from({length:5},(_,i)=>({name:'opponent',tag:String(i),puuid:'enemy'+i,team_id:'Red',agent:'Jett',k:2,d:3,a:4}))
];
const saved=(name='Aquatopia',tag='toppy',puuid='kobe-id')=>({
 ended_at:Date.parse('2026-11-17T10:00:00.000Z'),map:'Ascent',
 players_json:JSON.stringify(roster(name,tag,puuid)),
 teams_json:JSON.stringify([{id:'Blue',won:true,rounds:13},{id:'Red',won:false,rounds:8}]),
 rounds_json:JSON.stringify([{r:0,winner:'Blue'},{r:1,winner:'Red'}]),
 kills_json:JSON.stringify([
  {r:0,t:300,killer:puuid,victim:'enemy0'},
  {r:0,t:1800,killer:'enemy1',victim:'ally0'},
  {r:1,t:250,killer:'enemy1',victim:puuid},
  {r:1,t:1300,killer:'ally1',victim:'enemy1'}
 ])
});
const accounts=[{name:'Aquatopia',tag:'toppy',puuid:'kobe-id'}];
test('one event per complete match, exact FK/FD, KDA and win outcome',()=>{
 const point=buildCoachMatchTrend([saved()],accounts);
 assert.equal(point.length,1);
 assert.deepEqual({outcome:point[0].outcome,kills:point[0].kills,deaths:point[0].deaths,
  assists:point[0].assists,firstKills:point[0].firstKills,firstDeaths:point[0].firstDeaths,
  observedOpeningRounds:point[0].observedOpeningRounds},
 {outcome:'win',kills:17,deaths:8,assists:11,firstKills:1,firstDeaths:1,observedOpeningRounds:2});
 const serialized=JSON.stringify(point);
 for(const secret of ['kobe-id','enemy1','opponent','ally0','toppy'])assert.equal(serialized.includes(secret),false);
});
test('old name matched only by permanent PUUID, wrong same-name tag not merged',()=>{
 assert.equal(buildCoachMatchTrend([saved('OldNick','OLD','kobe-id')],accounts).length,1);
 assert.equal(buildCoachMatchTrend([saved('Aquatopia','different','not-kobe')],accounts).length,0);
});
test('invalid and partial event timelines are excluded instead of zeroed',()=>{
 const incomplete={...saved(),kills_json:null};
 assert.equal(buildCoachMatchTrend([incomplete],accounts).length,0);
 const bad={...saved(),kills_json:JSON.stringify([{r:0,t:10,killer:'attacker-fake',victim:'enemy1'}])};
 assert.equal(buildCoachMatchTrend([bad],accounts).length,0);
});
test('limits graph to at most 20 rows with no network access',()=>{
 const rows=Array.from({length:24},(_,i)=>({...saved(),ended_at:Date.parse('2026-11-17T10:00:00.000Z')-i*86_400_000}));
 assert.equal(buildCoachMatchTrend(rows,accounts).length,20);
});

test('real-world kill timestamps above ten seconds remain eligible for post-match',()=>{
 const row=saved();
 const kills=JSON.parse(row.kills_json).map((k: {t:number},i:number)=>({...k,t:[18500,82000,30100,109000][i]}));
 const result=buildCoachMatchTrend([{...row,kills_json:JSON.stringify(kills)}],accounts);
 assert.equal(result.length,1,'valid 18–109s events must not erase the entire match');
 assert.deepEqual([result[0].firstKills,result[0].firstDeaths],[1,1]);
 const outOfRange=[{...kills[0],t:900001},...kills.slice(1)];
 assert.equal(buildCoachMatchTrend([{...row,kills_json:JSON.stringify(outOfRange)}],accounts).length,0);
});
