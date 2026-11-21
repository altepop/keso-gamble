import test from 'node:test';
import assert from 'node:assert/strict';
import {coachMapPositionCoverage} from '../src/coach-map-position-coverage.ts';
const players=Array.from({length:10},(_,i)=>({puuid:i===0?'owner-id':'peer-'+i}));
const snapshot=(frames:unknown[])=>JSON.stringify({schema:1,roster:players.map(p=>({id:p.puuid,team:'Blue'})),frames});
const base=(map:string|null,positions_json:string|null)=>({map,players_json:JSON.stringify(players),positions_json});
test('seven official maps remain present with owner-only per-map evidence counts',()=>{
 const rows=[
  ...Array.from({length:5},()=>base('Bind',snapshot([{victim:0,killer:1,victimLocation:[12,42],locations:[]}]))),
  base('Corrode',snapshot([{victim:1,killer:0,victimLocation:null,locations:[{player:0,location:[5,6]}]}])),
  base('Haven',null),base('Ascent',null),base(null,null)
 ];
 const result=coachMapPositionCoverage(rows,[{puuid:'owner-id'}]);
 assert.deepEqual(result.pool.map(x=>x.map),['Abyss','Bind','Corrode','Haven','Lotus','Summit','Sunset']);
 const bind=result.pool.find(x=>x.map==='Bind')!;
 assert.equal(bind.sampleMatches,5);assert.equal(bind.verifiedPositionMatches,5);
 assert.equal(bind.observedOwnVictimEvents,5);assert.equal(bind.knownOwnVictimLocations,5);
 assert.equal(bind.status,'取得状況を確認可能');
 const corrode=result.pool.find(x=>x.map==='Corrode')!;
 assert.equal(corrode.verifiedPositionMatches,1);assert.equal(corrode.knownOwnKillerLocations,1);
 assert.equal(corrode.status,'まだ分かりません');
 assert.equal(result.pool.find(x=>x.map==='Abyss')?.status,'未収集');
 assert.equal(result.pool.find(x=>x.map==='Haven')?.status,'位置データ未取得');
 assert.equal(result.historicalMatches,1);assert.equal(result.unknownMapMatches,1);
 assert.equal(result.sampleMatches,9);
 for(const secret of ['owner-id','peer-1','12,42','5,6'])assert.equal(JSON.stringify(result).includes(secret),false);
});
test('unverified owner and invalid snapshots are missing data, not negative positioning grades',()=>{
 const rows=[base('Lotus',snapshot([{victim:0,killer:null,victimLocation:[33,44],locations:[]}]))];
 const result=coachMapPositionCoverage(rows,[{puuid:null}]);
 const lotus=result.pool.find(x=>x.map==='Lotus')!;
 assert.equal(lotus.sampleMatches,1);assert.equal(lotus.verifiedPositionMatches,0);
 assert.equal(lotus.missingOrInvalidPositionMatches,1);
 assert.equal(lotus.knownOwnVictimLocations,0);assert.equal(lotus.status,'位置データ未取得');
 assert.equal(result.analysisOnly,true);assert.match(result.guidance,/優劣は評価していません/);
});
test('reject oversized archives rather than silently truncating a denominator',()=>{
 assert.throws(()=>coachMapPositionCoverage(Array.from({length:251},()=>base('Bind',null)),[{puuid:'owner-id'}]));
});
