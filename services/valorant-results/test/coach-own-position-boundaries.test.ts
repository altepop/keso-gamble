import test from 'node:test';
import assert from 'node:assert/strict';
import {coachOwnPositionCoverage} from '../src/coach-own-position-coverage.ts';

const roster=Array.from({length:10},(_,i)=>({puuid:i===0?'owner':'other-'+i}));
const row=(frames:unknown[],overrides:Record<string,unknown>={})=>({
 map:'Bind',players_json:JSON.stringify(roster),
 positions_json:JSON.stringify({schema:1,roster:roster.map(p=>({id:p.puuid})),frames,...overrides})
});
const event=(location:unknown)=>({
 victim:0,killer:1,victimLocation:location,locations:[]
});

test('invalid or absent coordinates do not become observed positions',()=>{
 const r=coachOwnPositionCoverage([row([
  event(null),event([null,3]),event([1]),event([1,2,3]),
  event([10000001,0]),event(['1',2]),event([1,2])
 ])],[{puuid:'owner'}]);
 assert.equal(r.verifiedPositionMatches,1);
 assert.equal(r.observedOwnVictimEvents,7);
 assert.equal(r.knownOwnVictimLocations,1);
 assert.match(r.guidance,/評価範囲外/);
 assert.doesNotMatch(JSON.stringify(r),/owner|other-|10000001/);
});

test('oversized frame arrays and ambiguous owner accounts fail closed',()=>{
 const manyFrames=Array.from({length:601},()=>event([1,2]));
 const r=coachOwnPositionCoverage([
  row(manyFrames),row([event([1,2])])
 ],[{puuid:'owner'},{puuid:'other-1'}]);
 assert.equal(r.verifiedPositionMatches,0);
 assert.equal(r.missingOrInvalidPositionMatches,2);
 assert.equal(r.knownOwnVictimLocations,0);
});

test('input caps reject oversized read batches and account lists',()=>{
 const one=row([event([1,2])]);
 assert.throws(()=>coachOwnPositionCoverage(Array.from({length:251},()=>one),[{puuid:'owner'}]),/Invalid position coverage sample/);
 assert.throws(()=>coachOwnPositionCoverage([one],Array.from({length:6},()=>({puuid:'owner'}))),/Invalid position coverage sample/);
});
