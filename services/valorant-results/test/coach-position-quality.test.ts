import test from 'node:test';import assert from 'node:assert/strict';
import {coachPositionQuality,safePositionEvidence} from '../src/coach-position-quality.ts';
const fixture=()=>{
 const players=Array.from({length:10},(_,i)=>({puuid:'private-player-'+i,team_id:i<5?'Blue':'Red'}));
 return {metadata:{queue:{id:'competitive'},is_completed:true},players,kills:[{round:0,time_in_round_in_ms:1000,killer:{puuid:players[0].puuid},victim:{puuid:players[5].puuid},location:{x:-50,y:0},player_locations:players.map((p,i)=>({puuid:p.puuid,location:{x:i===5?-50:9876543-i,y:0},view_radians:1.12345}))}]};
};
test('a complete snapshot observes signed coordinates and fractional headings without retaining values or identities',()=>{
 const raw=fixture(),before=JSON.stringify(raw),q=coachPositionQuality(raw,'history')!;
 assert.equal(q.kills,1);assert.equal(q.victimCoordinates,1);assert.equal(q.fullRosterCoordinates,1);assert.equal(q.fullRosterDirections,1);assert.equal(q.missingRosterCoordinates,0);assert.equal(q.coordinateItems,10);assert.equal(q.fractionalDirectionItems,10);assert.equal(q.negativeCoordinateItems,1);assert.equal(q.victimCoordinateAgrees,1);assert.equal(q.killerCoordinateAgrees,0);assert.equal(q.rosterCoordinateHistogram[10],1);
 assert.doesNotMatch(JSON.stringify(q),/private-player|9876543|1\.12345/);assert.equal(JSON.stringify(raw),before);
});
test('an empty array is observed but is never reported as a complete roster',()=>{
 const raw=fixture();raw.kills[0].player_locations=[];const q=coachPositionQuality(raw,'detail')!;
 assert.equal(q.locationArrays,1);assert.equal(q.locationArrayEmpty,1);assert.equal(q.fullRosterCoordinates,0);assert.equal(q.missingRosterCoordinates,10);assert.equal(q.rosterCoordinateHistogram[0],1);
});
test('missing coordinates, null headings and malformed numeric values are counted separately',()=>{
 const raw:any=fixture();delete raw.kills[0].player_locations[0].location;raw.kills[0].player_locations[1].location=null;raw.kills[0].player_locations[2].location={x:Infinity,y:0};delete raw.kills[0].player_locations[3].view_radians;raw.kills[0].player_locations[4].view_radians=null;raw.kills[0].player_locations[5].view_radians='1';
 const q=coachPositionQuality(raw,'history')!;assert.equal(q.coordinateMissing,1);assert.equal(q.coordinateNull,1);assert.equal(q.coordinateInvalid,1);assert.equal(q.directionMissing,1);assert.equal(q.directionNull,1);assert.equal(q.directionInvalid,1);assert.equal(q.rosterCoordinateHistogram[7],1);assert.equal(q.rosterDirectionHistogram[4],1);assert.equal(q.fullRosterDirections,0);
});
test('flat and nested identity paths are measured, while duplicates and unknowns cannot fake full coverage',()=>{
 const raw:any=fixture();raw.kills[0].player_locations=raw.kills[0].player_locations.map(({puuid,...v}:any)=>({...v,player:{puuid}}));
 const q=coachPositionQuality(raw,'history')!;assert.equal(q.identityNested,10);assert.equal(q.identityFlat,0);assert.equal(q.fullRosterDirections,1);
 raw.kills[0].player_locations[9]=raw.kills[0].player_locations[0];assert.equal(coachPositionQuality(raw,'history')!.identityDuplicate,1);assert.equal(coachPositionQuality(raw,'history')!.fullRosterCoordinates,0);
 raw.kills[0].player_locations[9]={...raw.kills[0].player_locations[9],puuid:'unknown'};assert.equal(coachPositionQuality(raw,'history')!.identityConflict,1);
});
test('missing roster members remain missing without inferring alive/dead or inventing a direction',()=>{
 const raw=fixture();raw.kills[0].player_locations=raw.kills[0].player_locations.slice(0,4);const q=coachPositionQuality(raw,'detail')!;assert.equal(q.completeListedSnapshots,1);assert.equal(q.fullRosterCoordinates,0);assert.equal(q.missingRosterCoordinates,6);assert.equal(q.rosterCoordinateHistogram[4],1);
});
test('the probe bounds input, distinguishes absent kills and does not observe other modes',()=>{
 const raw:any=fixture();raw.metadata.queue.id='unrated';assert.equal(coachPositionQuality(raw,'history'),null);raw.metadata.queue.id='competitive';raw.metadata.is_completed=false;assert.equal(coachPositionQuality(raw,'history'),null);raw.metadata.is_completed=true;
 raw.kills=Array.from({length:601},()=>({}));assert.equal(coachPositionQuality(raw,'history')!.killsState,'invalid');delete raw.kills;assert.equal(coachPositionQuality(raw,'history')!.killsState,'missing');raw.kills=[];assert.equal(coachPositionQuality(raw,'history')!.killsState,'empty');
 raw.kills=[{player_locations:Array.from({length:21},()=>({}))}];const q=coachPositionQuality(raw,'history')!;assert.equal(q.locationArrayOversize,1);assert.equal(q.listedItems,0);
});
test('the tail allowlist rejects invalid histograms and never copies trace extras',()=>{
 const q=coachPositionQuality(fixture(),'history')!;const trace={private:'secret',logs:[{message:['unrelated',{token:'private'}]},{message:['coach_position_quality',{...q,coordinates:[9876543],puuid:'private'}]}]};
 const safe=safePositionEvidence(trace)!;assert.deepEqual(safe,q);assert.doesNotMatch(JSON.stringify(safe),/private|9876543|coordinates/);
 assert.equal(safePositionEvidence({logs:[{message:['coach_position_quality',{...q,rosterDirectionHistogram:[99]}]}]}),null);
 assert.equal(safePositionEvidence({logs:[{message:['coach_position_quality',{...q,coordinateItems:Infinity}]}]}),null);
});
