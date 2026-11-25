import test from 'node:test';import assert from 'node:assert/strict';
import {URL as NodeURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {compactCompetitivePositions,recordCompetitivePositions,captureCompetitivePositions,positionSnapshotImproves} from '../src/coach-position-storage.ts';
function match():any{
 const players=Array.from({length:10},(_,i)=>({puuid:'p'+i,team_id:i<5?'Blue':'Red'}));
 return {metadata:{match_id:'m1',queue:{id:'competitive'},is_completed:true},players,
 kills:[{round:1,time_in_round_in_ms:1000,killer:{puuid:'p0'},victim:{puuid:'p9'},location:{x:-20,y:0},
 player_locations:players.slice(0,6).map((p,i)=>({player:{puuid:p.puuid},location:{x:i,y:-i},view_radians:1.25}))}]};
}
function store(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new NodeURL('../migrations/0008_competitive_positions.sql',import.meta.url),'utf8'));let reads=0,writes=0;
 const db={prepare:(text:string)=>({bind:(...args:unknown[])=>({first:async()=>{reads++;return sql.prepare(text).get(...args as never[])??null;},run:async()=>{writes++;return {meta:{changes:Number(sql.prepare(text).run(...args as never[]).changes)}};}})})} as unknown as D1Database;
 return {sql,db,counts:()=>({reads,writes})};}
test('real nested identities: victim separate, partial six of ten, zero/negative coordinates and fractional direction retained',()=>{
 const m=match(),before=JSON.stringify(m),v=compactCompetitivePositions(m,'history',100)!.payload;
 const f=v.frames[0];assert.deepEqual(f.victimLocation,[-20,0]);assert.equal(f.victimListed,false);assert.equal(f.coordinateCount,6);assert.equal(f.coordinateCoverage,.6);assert.equal(f.listedCoverage,.6);assert.equal(f.directionCoverage,.6);assert.equal(f.rosterCount,10);assert.equal(f.locations[0].direction,1.25);assert.deepEqual(f.locations[0].location,[0,-0]);assert.equal(v.victimPositionSource,'kill.location');assert.equal(JSON.stringify(m),before);
});
test('null, absent, invalid and empty are distinct; missing positions/headings are never zero-filled',()=>{
 const m=match();delete m.kills[0].location;delete m.kills[0].player_locations[0].location;m.kills[0].player_locations[1].location=null;m.kills[0].player_locations[2].location={x:NaN,y:0};m.kills[0].player_locations[3].view_radians=null;
 const f=compactCompetitivePositions(m,'detail')!.payload.frames[0];assert.equal(f.victimLocationState,'missing');assert.deepEqual(f.locations.slice(0,3).map(p=>p.locationState),['missing','null','invalid']);assert.equal(f.coordinateCount,3);assert.equal(f.directionCount,5);assert.equal(f.locations[3].direction,null);
 for(const [list,expected] of [[undefined,'missing'],[null,'null'],['bad','invalid'],[[],'observed']] as const){m.kills[0].player_locations=list;const k=compactCompetitivePositions(m,'detail')!.payload.frames[0];assert.equal(k.listState,expected);assert.equal(k.coordinateCoverage,0);}
});
test('flat compatibility; all duplicate, conflicting and unknown identities are rejected from coverage',()=>{
 const m=match();m.kills[0].player_locations=m.kills[0].player_locations.map((v:any)=>({...v,puuid:v.player.puuid,player:undefined}));
 m.kills[0].player_locations.push(m.kills[0].player_locations[0],{puuid:'outsider',location:{x:1,y:1}}, {puuid:'p7',player:{puuid:'p8'}});
 const f=compactCompetitivePositions(m,'detail')!.payload.frames[0];assert.equal(f.coordinateCount,5);assert.equal(f.rejectedCount,4);assert.equal(f.returnedCount,9);
});
test('rejects noncompetitive, invalid identities/events, oversize matches and excessive bytes without partial writes',()=>{
 const m=match();m.metadata.queue.id='unrated';assert.equal(compactCompetitivePositions(m,'history'),null);m.metadata.queue.id='competitive';m.kills[0].victim.puuid='unknown';assert.equal(compactCompetitivePositions(m,'history'),null);
 const huge=match();huge.kills=Array.from({length:601},()=>huge.kills[0]);assert.equal(compactCompetitivePositions(huge,'detail'),null);
 const cap=match();cap.kills[0].player_locations=cap.players.map((p:any)=>({player:{puuid:p.puuid},location:{x:1234567.1234567,y:7654321.7654321},view_radians:1.123456789012345}));cap.kills=Array.from({length:600},()=>cap.kills[0]);assert.equal(compactCompetitivePositions(cap,'detail'),null);
});
test('SQLite persistence is idempotent; only nonconflicting better complete snapshots replace old evidence',async()=>{
 const s=store();try{const m=match();assert.equal(await recordCompetitivePositions(s.db,m,'history',100),true);assert.equal(await recordCompetitivePositions(s.db,m,'detail',200),false);assert.equal(s.counts().writes,1);
 m.kills[0].player_locations.push({player:{puuid:'p6'},location:{x:60,y:0},view_radians:0});assert.equal(await recordCompetitivePositions(s.db,m,'detail',300),true);
 m.kills[0].player_locations[0].location.x=42;assert.equal(await recordCompetitivePositions(s.db,m,'detail',400),false);
 const row=s.sql.prepare('SELECT * FROM valorant_match_positions').get() as any;assert.equal(row.recorded_at,300);assert.equal(JSON.parse(row.positions_json).frames[0].coordinateCoverage,.7);assert.equal(s.counts().writes,2);
 }finally{s.sql.close();}
});
test('a later response cannot remove observed headings or change event identity; CAS does not overwrite concurrent evidence',async()=>{
 const a=compactCompetitivePositions(match(),'history')!.payload,b=structuredClone(a);b.frames[0].locations[0].direction=null;b.frames[0].locations.push({...b.frames[0].locations[1],player:7});b.frames[0].listedCount++;assert.equal(positionSnapshotImproves(a,b),false);
 const s=store();try{await recordCompetitivePositions(s.db,match(),'history');const m=match();m.kills[0].player_locations.push({player:{puuid:'p6'},location:{x:60,y:0},view_radians:0});const both=await Promise.all([recordCompetitivePositions(s.db,m,'detail',2),recordCompetitivePositions(s.db,m,'detail',3)]);assert.equal(both.filter(Boolean).length,1);}finally{s.sql.close();}
});
test('bounded same-response cache avoids repeated D1 queries; storage errors are isolated',async()=>{
 const s=store();try{await captureCompetitivePositions(s.db,match(),'history',1);await captureCompetitivePositions(s.db,match(),'history',2);assert.deepEqual(s.counts(),{reads:1,writes:1});}finally{s.sql.close();}
 await captureCompetitivePositions({prepare(){throw Error('private');}} as any,match(),'detail');
});
