import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {recordCompetitiveRoster,compactCompetitiveRoster} from '../src/match-rosters.ts';
import type {Match} from '../src/results.ts';

function fixture():Match{
 return {
  metadata:{match_id:'tested-match',is_completed:true,started_at:'2026-11-16T05:00:00Z',game_length_in_ms:600000,queue:{id:'competitive'},season:{short:'V26:A6'},map:{name:'Corrode'}},
  players:Array.from({length:10},(_,i)=>({puuid:'user-'+i,team_id:i<5?'red':'blue',party_id:i<3?'party-a':null,agent:{name:i===0?'Clove':'Cypher'},stats:{kills:i,deaths:4,assists:2,score:i*100}})),
  teams:[{team_id:'red',won:true,rounds:{won:13}},{team_id:'blue',won:false,rounds:{won:8}}]
 };
}
test('one compact row retains 10 unique PUUIDs, teams and party IDs, not player names',()=>{
 const m=fixture();
 const obj=compactCompetitiveRoster(m,123)!;
 assert.ok(obj);
 assert.equal(obj.map,'Corrode');assert.equal(obj.act,'V26:A6');
 assert.equal(obj.endedAt,Date.parse('2026-11-16T05:10:00Z'));
 const ps=JSON.parse(obj.players);
 assert.equal(ps.length,10);assert.equal(ps[0].party_id,'party-a');
 assert.deepEqual(JSON.parse(obj.teams).map((x:{rounds:number})=>x.rounds),[13,8]);
 assert.ok(!obj.players.includes('displayName'));
});
test('ignores noncompetitive, incomplete and malformed teams',()=>{
 const one=fixture();one.metadata.queue.id='spikerush';assert.equal(compactCompetitiveRoster(one),null);
 const two=fixture();two.players.pop();assert.equal(compactCompetitiveRoster(two),null);
 const three=fixture();three.players[0].team_id='other';assert.equal(compactCompetitiveRoster(three),null);
 const four=fixture();four.metadata.is_completed=false;assert.equal(compactCompetitiveRoster(four),null);
});
test('same match from two monitored players is stored once and survives later reads',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../migrations/0006_competitive_match_rosters.sql',import.meta.url),'utf8'));
 const db={prepare:(text:string)=>({bind:(...args:unknown[])=>({
    first:async()=>sql.prepare(text).get(...args as never[])??null,
    run:async()=>({meta:{changes:Number(sql.prepare(text).run(...args as never[]).changes)}})
 })})} as unknown as D1Database;
 assert.equal(await recordCompetitiveRoster(db,fixture(),1000),true);
 assert.equal(await recordCompetitiveRoster(db,fixture(),2000),false);
 const saved=sql.prepare('SELECT * FROM valorant_match_rosters WHERE match_id=?').get('tested-match') as {players_json:string;recorded_at:number};
 assert.equal(saved.recorded_at,1000);
 assert.equal(JSON.parse(saved.players_json).length,10);
 assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM valorant_match_rosters').get() as {n:number}).n,1);
 sql.close();
});
