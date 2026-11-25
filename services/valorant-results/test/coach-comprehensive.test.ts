import test from 'node:test';
import assert from 'node:assert/strict';
import {comprehensiveCoachDiagnosis} from '../src/coach-comprehensive.ts';
import {summarizeCoachRounds} from '../src/coach-round-analysis.ts';

function sample(){
 const side=(rounds:number,fk:number,fd:number)=>({
  rounds,observedOpeningRounds:rounds,firstKills:fk,firstDeaths:fd,
  firstKillWins:0,firstKillLosses:0,firstDeathWins:0,firstDeathLosses:0
 });
 const team={
  matchWins:12,matchLosses:8,matchDraws:0,
  rounds:500,winnerKnown:500,ourRoundWins:285,
  firstKillWins:150,firstKillLosses:50,firstKillOutcomesKnown:200,
  enemyFkWins:35,enemyFkLosses:160,doubleOpeningWins:63,doubleOpeningLosses:7,
  roundsWithSides:350
 };
 const player={
  player:'VDK',matches:21,observedOpeningRounds:450,
  firstKills:40,firstDeaths:42,firstKillWins:34,firstKillLosses:6,
  firstDeathWins:10,firstDeathLosses:32,
  matchWins:11,matchLosses:10,matchDraws:0,
  statsMatches:21,totalKills:350,totalDeaths:260,totalAssists:160,
  scoreMatches:21,totalScore:85000,samePartyAsVdk:0,differentPartyFromVdk:0,partyUnknown:0,
  openingKillerDiedWithin5s:3,firstDeathKillerEliminatedWithin5s:9,
  attack:side(160,25,12),defense:side(170,8,21)
 };
 const support={...player,player:'石原',matches:1,observedOpeningRounds:20,
  firstKills:0,firstDeaths:1,firstKillWins:0,firstKillLosses:0,
  firstDeathWins:0,firstDeathLosses:1,
  matchWins:0,matchLosses:1,matchDraws:0,
  statsMatches:1,totalKills:4,totalDeaths:15,totalAssists:7,
  scoreMatches:1,totalScore:5000,samePartyAsVdk:0,differentPartyFromVdk:0,partyUnknown:1,
  openingKillerDiedWithin5s:0,firstDeathKillerEliminatedWithin5s:0,
  attack:side(10,0,0),defense:side(10,0,1)};
 return {archivedMatches:44,usableMatches:43,killDataMissing:1,roundDataMissing:0,
  overall:team,individual:[player,support],
  individualMapAgent:[
   {...player,map:'Corrode',agent:'Fade',matches:7,
    matchWins:4,matchLosses:3,matchDraws:0,statsMatches:7,
    observedOpeningRounds:140,
    firstKillWins:15,firstKillLosses:3,firstKills:18,firstDeaths:30},
   {...player,map:'Lotus',agent:'Fade',matches:1,
    matchWins:0,matchLosses:1,matchDraws:0,statsMatches:1,
    observedOpeningRounds:20,
    firstKillWins:0,firstKillLosses:1,firstKills:1,firstDeaths:4}
  ],maps:[{...team,map:'Corrode',matches:8,firstKillWins:38,firstKillLosses:10},
   {...team,map:'Lotus',matches:2,firstKillWins:2,firstKillLosses:7}]
 };
}

test('complete-case team, personal FK/FD, two-kill, side and map/agent signals have exact evidence',()=>{
 const diagnosis=comprehensiveCoachDiagnosis(sample());
 const find=(subject:string,title:string)=>diagnosis.items.find(x=>x.subject===subject&&x.title===title);
 assert.equal(find('チーム','味方FK後のラウンド勝率')?.status,'good');
 assert.equal(find('チーム','味方が先に2キル以上取得したラウンドの勝率')?.status,'good');
 assert.equal(find('VDK','本人FK後の勝率')?.status,'mixed');
 assert.equal(find('VDK','K / D / A の試合平均')?.status,'context');
 assert.equal(find('チーム','試合勝率（勝敗判明）')?.ratePct,60);
 assert.ok(diagnosis.items.some(x=>x.subject==='石原'&&x.title==='パーティー情報の不明件数'));
 assert.equal(find('VDK','先制デス率')?.status,'context','FD volume by role is never called a weakness');
 assert.equal(find('VDK','FD後5秒以内に味方が同じ敵を倒した率')?.status,'context',
  'teammate trade timing is contextual, not proof of the dead player failing');
 assert.equal(find('VDK','FK後5秒以内に倒されなかった率')?.status,'good');
 assert.equal(find('VDK','攻撃時のFK−FD収支')?.status,'good');
 assert.equal(find('VDK','防衛時のFK−FD収支')?.status,'focus');
 assert.equal(find('VDK','Corrode / Fade：FK後勝率')?.numerator,15);
 assert.equal(find('VDK','Corrode / Fade：先制デス率')?.numerator,30);
 assert.equal(find('VDK','Corrode / Fade：先制デス率')?.status,'focus');
 assert.equal(find('VDK','Lotus / Fade：先制デス率')?.status,'insufficient',
  'one match must not be labeled a weakness by a self-overlapping reference');
 assert.equal(find('VDK','Corrode / Fade：試合勝率')?.denominator,7,
  'map outcome denominator must use the map-agent cohort rather than all matches');
 assert.equal(find('VDK','Lotus / Fade：FK後勝率')?.status,'insufficient');
 assert.ok(diagnosis.items.every(x=>!JSON.stringify(x).includes('secret-puuid')));
 assert.equal(diagnosis.synopsis.find(x=>x.subject==='VDK')?.priority?.status,'focus');
 assert.equal(diagnosis.limitations.length>=4,true);
});

test('sparse support or unknown outcomes never produce skill labels or fabricated rates',()=>{
 const diagnosis=comprehensiveCoachDiagnosis(sample());
 const support=diagnosis.items.filter(x=>x.subject==='石原');
 assert.ok(support.length>=8);
 assert.ok(support.every(x=>x.status==='insufficient'||x.status==='context'));
 assert.equal(support.find(x=>x.title==='本人FK後の勝率')?.ratePct,null);
 assert.equal(support.find(x=>x.title==='FD後5秒以内に味方が同じ敵を倒した率')?.ratePct,0);
 assert.equal(diagnosis.synopsis.find(x=>x.subject==='石原')?.focuses,0);
});

test('real archive summary passes exactly the available complete matches, preserving unknown sides',()=>{
 const players=Array.from({length:10},(_,i)=>({
  puuid:'id'+i,team_id:i<5?'Blue':'Red',
  name:i===0?'Dolly':i===1?'Abema':i===2?'h1d3g1g4s':'p'+i,
  tag:i===0?'SDGs':i===1?'ttv':i===2?'1037':'T',agent:'Fade'
 }));
 const row=(id:string,rounds:any[],kills:any[]|null)=>({
  match_id:id,map:'Corrode',ended_at:1794666339000,players_json:JSON.stringify(players),
  rounds_json:JSON.stringify(rounds),kills_json:kills===null?null:JSON.stringify(kills)
 });
 const full=row('a',[
  {r:0,winner:'Blue',attack:'Blue',defense:'Red'},
  {r:1,winner:'Red',attack:'Red',defense:'Blue'},
  {r:2,winner:null,attack:null,defense:null}
 ],[
  {r:0,t:1000,killer:'id0',victim:'id5'},
  {r:0,t:1300,killer:'id1',victim:'id6'},
  {r:1,t:1500,killer:'id7',victim:'id0'},
  {r:2,t:1000,killer:'id0',victim:'id5'}
 ]);
 const partial=row('b',[{r:0,winner:'Blue'}],null);
 const s=summarizeCoachRounds([full,partial]);
 assert.equal(s.usableMatches,1);
 assert.equal(s.overall.doubleOpeningWins,1);
 assert.equal(s.overall.doubleOpeningLosses,0);
 assert.equal(s.overall.enemyFkLosses,1);
 assert.equal(s.individual.find(x=>x.player==='VDK')?.attack.firstKills,1);
 assert.equal(s.individual.find(x=>x.player==='VDK')?.defense.firstDeaths,1);
 assert.equal(s.individual.find(x=>x.player==='VDK')?.attack.observedOpeningRounds,1);
 assert.equal(s.individual.find(x=>x.player==='VDK')?.defense.observedOpeningRounds,1);
 const diagnosis=comprehensiveCoachDiagnosis(s);
 assert.ok(diagnosis.items.some(x=>x.category==='攻撃・防衛'));
 assert.equal(diagnosis.items.some(x=>x.status==='good'||x.status==='focus'),false,
  'one complete match is not enough to rank anybody');
});
