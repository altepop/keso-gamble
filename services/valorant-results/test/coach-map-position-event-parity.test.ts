import test from 'node:test';
import assert from 'node:assert/strict';
import {coachMapPositionEventParity} from '../src/coach-map-position-event-parity.ts';
const roster=Array.from({length:10},(_,i)=>({puuid:'private-'+i}));
const kill=[{r:0,t:1234,victim:'private-1',killer:'private-0',assistants:[]}];
const frame=[{round:0,time:1234,victim:1,killer:0,victimLocation:[7,9],locations:[]}];
const row=(map:string|null,events:unknown=kill,frames:unknown=frame)=>({
 map,players_json:JSON.stringify(roster),kills_json:JSON.stringify(events),
 positions_json:JSON.stringify({schema:1,roster:roster.map(p=>({id:p.puuid})),frames})
});
test('all seven maps stay in fixed pool; nonpool and missing map samples retain denominators',()=>{
 const output=coachMapPositionEventParity([row('Bind'),row('Bind',kill,[]),row('Corrode',null),row('Ascent'),row(null)]);
 assert.deepEqual(output.pool.map(v=>v.map),['Abyss','Bind','Corrode','Haven','Lotus','Summit','Sunset']);
 assert.deepEqual(output.pool.find(v=>v.map==='Bind'),{
  map:'Bind',sampleMatches:2,comparableMatches:1,consistentMatches:1,mismatchedMatches:0,unavailableMatches:1,status:'整合性を確認可能'});
 assert.equal(output.pool.find(v=>v.map==='Corrode')?.status,'比較不能');
 assert.equal(output.pool.find(v=>v.map==='Abyss')?.status,'未収集');
 assert.equal(output.historicalMatches,1);assert.equal(output.unknownMapMatches,1);
 assert.equal(output.historicalComparableMatches,1);assert.equal(output.unknownMapComparableMatches,1);
 assert.equal(output.sampleMatches,5);
 for(const secret of ['private-0','private-1','1234','7,9'])assert.equal(JSON.stringify(output).includes(secret),false);
});
test('genuine comparable mismatches are not converted to missing; malformed events remain unavailable',()=>{
 const output=coachMapPositionEventParity([row('Lotus',kill,[{...frame[0],victim:2}]),row('Lotus',[],frame)]);
 const lotus=output.pool.find(v=>v.map==='Lotus')!;
 assert.equal(lotus.comparableMatches,1);assert.equal(lotus.mismatchedMatches,1);
 assert.equal(lotus.unavailableMatches,1);assert.equal(lotus.consistentMatches,0);
 assert.equal(output.analysisOnly,true);assert.match(output.guidance,/本人のミスに含めず/);
});
test('oversized archive is rejected',()=>{
 assert.throws(()=>coachMapPositionEventParity(Array.from({length:251},()=>row('Bind'))));
});
