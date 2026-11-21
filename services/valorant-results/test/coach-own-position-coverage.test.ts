import test from 'node:test';
import assert from 'node:assert/strict';
import {coachOwnPositionCoverage} from '../src/coach-own-position-coverage.ts';
const players=Array.from({length:10},(_,i)=>({puuid:i===0?'owner-id':'other-'+i}));
const snapshot=(frames:unknown[])=>JSON.stringify({
 schema:1,roster:players.map(p=>({id:p.puuid,team:'Blue'})),frames
});
const frame=(victim:number,killer:number|null,location:unknown,locations:unknown[]=[])=>({
 victim,killer,victimLocation:location,locations
});
test('counts only owner positions and never returns coordinates or roster IDs',()=>{
 const row={map:'Bind',players_json:JSON.stringify(players),positions_json:snapshot([
  frame(0,1,[12,42],[{player:0,location:[123,456]}]),
  frame(2,0,[99,88],[{player:0,location:[5,6]}]),
  frame(0,4,null,[]),
  frame(3,0,[7,7],[])
 ])};
 const r=coachOwnPositionCoverage([row],[{puuid:'owner-id'}]);
 assert.equal(r.verifiedPositionMatches,1);
 assert.equal(r.observedOwnVictimEvents,2);
 assert.equal(r.knownOwnVictimLocations,1);
 assert.equal(r.observedOwnKillerEvents,2);
 assert.equal(r.knownOwnKillerLocations,1);
 for(const secret of ['owner-id','other-1','123','456','42'])assert.equal(JSON.stringify(r).includes(secret),false);
});
test('missing, malformed and unverified snapshots stay unavailable rather than zero-valued evidence',()=>{
 const base={map:'Bind',players_json:JSON.stringify(players)};
 const r=coachOwnPositionCoverage([
  {...base,positions_json:null},
  {...base,positions_json:'{'},
  {...base,positions_json:snapshot([frame(0,1,[1,2])])}
 ],[{puuid:null}]);
 assert.equal(r.sampleMatches,3);
 assert.equal(r.verifiedPositionMatches,0);
 assert.equal(r.missingOrInvalidPositionMatches,3);
 assert.equal(r.knownOwnVictimLocations,0);
 assert.match(r.guidance,/評価範囲外/);
});
test('invalid snapshot cannot leak owner or opponent coordinates',()=>{
 const result=coachOwnPositionCoverage([{
  map:'Haven',players_json:JSON.stringify(players),
  positions_json:snapshot([frame(0,1,[10,20],[{player:99,location:[0,0]}])])
 }],[{puuid:'owner-id'}]);
 assert.equal(result.verifiedPositionMatches,1);
 assert.equal(result.knownOwnVictimLocations,1);
 assert.equal(result.knownOwnKillerLocations,0);
 assert.equal(JSON.stringify(result).includes('10,20'),false);
});

test('same-owner snapshot from a different opponent roster is rejected rather than attributed',()=>{
 const different=[...players];different[9]={puuid:'different-opponent'};
 const row={map:'Bind',players_json:JSON.stringify(players),positions_json:JSON.stringify({
  schema:1,roster:different.map(p=>({id:p.puuid,team:'Blue'})),
  frames:[frame(0,1,[44,55])]
 })};
 const result=coachOwnPositionCoverage([row],[{puuid:'owner-id'}]);
 assert.equal(result.sampleMatches,1);
 assert.equal(result.verifiedPositionMatches,0);
 assert.equal(result.missingOrInvalidPositionMatches,1);
 assert.equal(result.knownOwnVictimLocations,0);
 assert.equal(JSON.stringify(result).includes('different-opponent'),false);
});
test('duplicated roster identity and empty snapshot frames cannot imply verified evidence',()=>{
 const duplicates=players.map(p=>({id:p.puuid,team:'Blue'}));
 duplicates[9]={...duplicates[1]};
 const rows=[
  {map:'Corrode',players_json:JSON.stringify(players),
   positions_json:JSON.stringify({schema:1,roster:duplicates,frames:[frame(0,1,[2,3])]})},
  {map:'Corrode',players_json:JSON.stringify(players),positions_json:snapshot([])}
 ];
 const r=coachOwnPositionCoverage(rows,[{puuid:'owner-id'}]);
 assert.equal(r.verifiedPositionMatches,0);
 assert.equal(r.missingOrInvalidPositionMatches,2);
 assert.equal(r.observedOwnVictimEvents,0);
});
test('reordered complete roster retains valid owner-only counts',()=>{
 const roster=players.slice().reverse().map(p=>({id:p.puuid,team:'Blue'}));
 const result=coachOwnPositionCoverage([{
  map:'Haven',players_json:JSON.stringify(players),
  positions_json:JSON.stringify({schema:1,roster,frames:[frame(9,8,[21,31])]})
 }],[{puuid:'owner-id'}]);
 assert.equal(result.verifiedPositionMatches,1);
 assert.equal(result.knownOwnVictimLocations,1);
});
