import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
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
 sql.exec(readFileSync(new NodeURL('../migrations/0006_competitive_match_rosters.sql',import.meta.url),'utf8'));
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

test('hit locations retain missing values and fixed schema counts without extra API calls',()=>{
 const m=fixture();m.players[0].stats!.headshots=4;m.players[0].stats!.bodyshots=12;m.players[0].stats!.legshots=4;
 const ps=JSON.parse(compactCompetitiveRoster(m)!.players);
 assert.equal(ps[0].hs,4);assert.equal(ps[1].hs,null);assert.equal(ps[0].sourceFields.headshots,1);
 assert.equal(ps[0].sourceFields.players,10);assert.equal(ps[1].sourceFields,undefined);
});

test('normal re-fetch enriches missing hit/damage values once, preserving identities, base stats and original timestamp',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new NodeURL('../migrations/0006_competitive_match_rosters.sql',import.meta.url),'utf8'));
 const db={prepare:(text:string)=>({bind:(...args:unknown[])=>({first:async()=>sql.prepare(text).get(...args as never[])??null,run:async()=>({meta:{changes:Number(sql.prepare(text).run(...args as never[]).changes)}})})})} as unknown as D1Database;
 try{await recordCompetitiveRoster(db,fixture(),1000);const m=fixture();for(const p of m.players)Object.assign(p.stats!,{headshots:4,bodyshots:12,legshots:4,damage:{dealt:2400,received:3000}});
  assert.equal(await recordCompetitiveRoster(db,m,2000),true);assert.equal(await recordCompetitiveRoster(db,m,3000),false);
  const r=sql.prepare('SELECT * FROM valorant_match_rosters').get() as {players_json:string;recorded_at:number},p=JSON.parse(r.players_json)[0];
  assert.equal(r.recorded_at,1000);assert.equal(p.hs,4);assert.equal(p.hsAt,2000);assert.equal(p.damagePairAt,2000);assert.equal(p.k,0);assert.equal(p.puuid,'user-0');
  m.players[0].stats!.headshots=99;assert.equal(await recordCompetitiveRoster(db,m,4000),false);assert.equal(JSON.parse((sql.prepare('SELECT players_json FROM valorant_match_rosters').get() as {players_json:string}).players_json)[0].hs,4);
 }finally{sql.close()}
});
test('conflicting base-stat snapshots cannot enrich or rewrite the saved roster',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new NodeURL('../migrations/0006_competitive_match_rosters.sql',import.meta.url),'utf8'));
 const db={prepare:(text:string)=>({bind:(...args:unknown[])=>({first:async()=>sql.prepare(text).get(...args as never[])??null,run:async()=>({meta:{changes:Number(sql.prepare(text).run(...args as never[]).changes)}})})})} as unknown as D1Database;
 try{await recordCompetitiveRoster(db,fixture(),1000);const before=sql.prepare('SELECT players_json FROM valorant_match_rosters').get()!.players_json;
  const m=fixture();for(const p of m.players){p.stats!.kills!++;Object.assign(p.stats!,{headshots:4,bodyshots:12,legshots:4});}
  assert.equal(await recordCompetitiveRoster(db,m,2000),false);assert.equal(sql.prepare('SELECT players_json FROM valorant_match_rosters').get()!.players_json,before);
 }finally{sql.close()}
});

test('existing-only enrichment never creates an uncollected roster',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new NodeURL('../migrations/0006_competitive_match_rosters.sql',import.meta.url),'utf8'));
 const db={prepare:(text:string)=>({bind:(...args:unknown[])=>({first:async()=>sql.prepare(text).get(...args as never[])??null,run:async()=>({meta:{changes:Number(sql.prepare(text).run(...args as never[]).changes)}})})})} as unknown as D1Database;
 try{assert.equal(await recordCompetitiveRoster(db,fixture(),1000,{existingOnly:true}),false);assert.equal(sql.prepare('SELECT COUNT(*) n FROM valorant_match_rosters').get()!.n,0);}finally{sql.close()}
});

test('a concurrent team-context change prevents the enrichment CAS from mixing snapshots',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new NodeURL('../migrations/0006_competitive_match_rosters.sql',import.meta.url),'utf8'));let race=false;
 const db={prepare:(text:string)=>({bind:(...args:unknown[])=>({first:async()=>{const row=sql.prepare(text).get(...args as never[])??null;if(race&&row){race=false;const teams=JSON.parse(String(row.teams_json));teams[0].rounds++;sql.prepare('UPDATE valorant_match_rosters SET teams_json=?').run(JSON.stringify(teams));}return row;},run:async()=>({meta:{changes:Number(sql.prepare(text).run(...args as never[]).changes)}})})})} as unknown as D1Database;
 try{await recordCompetitiveRoster(db,fixture(),1000);const before=sql.prepare('SELECT players_json FROM valorant_match_rosters').get()!.players_json;
  const m=fixture();for(const p of m.players)Object.assign(p.stats!,{headshots:4,bodyshots:12,legshots:4,damage:{dealt:2400,received:3000}});race=true;
  assert.equal(await recordCompetitiveRoster(db,m,2000),false);assert.equal(sql.prepare('SELECT players_json FROM valorant_match_rosters').get()!.players_json,before);
 }finally{sql.close()}
});

test('match ability counts preserve real zero, omit unknown slots and enrich an existing roster once',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new NodeURL('../migrations/0006_competitive_match_rosters.sql',import.meta.url),'utf8'));
 const db={prepare:(text:string)=>({bind:(...args:unknown[])=>({first:async()=>sql.prepare(text).get(...args as never[])??null,run:async()=>({meta:{changes:Number(sql.prepare(text).run(...args as never[]).changes)}})})})} as unknown as D1Database;
 try{
  await recordCompetitiveRoster(db,fixture(),1000);const m=fixture();m.players[0].ability_casts={grenade:0,ability1:4,ability2:null,ultimate:-1};
  assert.equal(await recordCompetitiveRoster(db,m,2000),true);assert.equal(await recordCompetitiveRoster(db,m,3000),false);
  const saved=sql.prepare('SELECT * FROM valorant_match_rosters').get() as {players_json:string;recorded_at:number},p=JSON.parse(saved.players_json)[0];assert.deepEqual(p.casts,{grenade:0,ability1:4});assert.equal(p.castsAt,2000);assert.equal(saved.recorded_at,1000);
  m.players[0].ability_casts={grenade:99,ability1:5};assert.equal(await recordCompetitiveRoster(db,m,4000),false);
 }finally{sql.close()}
});
