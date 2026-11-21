import test from 'node:test';
import assert from 'node:assert/strict';
import {coachMapPoolCoverage} from '../src/coach-map-pool-coverage.ts';
const maps=['Map-A','Map-B','Map-C','Map-D','Map-E','Map-F','Map-G'];
test('all seven trusted maps appear, including absent and sparse maps',()=>{
 const rows=[
  ...Array.from({length:5},()=>({map:'Map-A',agent:'Fade'})),
  {map:'Map-B',agent:'Clove'},{map:'Map-B',agent:'Fade'},
  {map:'Map-C',agent:null},{map:null,agent:'Fade'},
  {map:'Old-Map',agent:'Sova'}
 ];
 const result=coachMapPoolCoverage(maps,rows);
 assert.deepEqual(result.pool.map(x=>x.map),maps);
 assert.deepEqual(result.pool.map(x=>x.status),[
  '集計可能','まだ分かりません','まだ分かりません','未収集',
  '未収集','未収集','未収集'
 ]);
 assert.deepEqual(result.pool[0].observedAgents,[{agent:'Fade',matches:5}]);
 assert.deepEqual(result.pool[1].observedAgents,[{agent:'Clove',matches:1},{agent:'Fade',matches:1}]);
 assert.deepEqual(result.outsidePool,[{map:'Old-Map',matches:1}]);
 assert.equal(result.unknownMapMatches,1);
 assert.equal(result.poolComplete,false);
});
test('only the actual observed agent sample is listed for each map',()=>{
 const samples=maps.flatMap(map=>Array.from({length:5},(_,i)=>({
  map,agent:i===0?'Fade':'Clove'
 })));
 const result=coachMapPoolCoverage(maps,samples);
 assert.equal(result.poolComplete,true);
 assert.equal(result.pool.length,7);
 assert.ok(result.pool.every(row=>row.matches===5&&row.status==='集計可能'));
 assert.ok(result.pool.every(row=>row.observedAgents.length===2));
});
test('invalid pool, duplicated maps and fabricated or malformed input fail closed',()=>{
 assert.throws(()=>coachMapPoolCoverage(maps.slice(0,6),[]));
 assert.throws(()=>coachMapPoolCoverage([...maps.slice(0,6),maps[0]],[]));
 assert.throws(()=>coachMapPoolCoverage([...maps.slice(0,6),'bad\nname'],[]));
 assert.throws(()=>coachMapPoolCoverage(maps,[{map:'Map-A',agent:'bad\nname'}]));
 assert.throws(()=>coachMapPoolCoverage(maps,[],0));
 assert.throws(()=>coachMapPoolCoverage(maps,Array.from({length:251},()=>({map:'Map-A',agent:'Fade'}))));
});
