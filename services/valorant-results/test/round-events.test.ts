import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {URL as NodeURL} from 'node:url';
import {compactCompetitiveRoundEvents,recordCompetitiveRoundEvents} from '../src/round-events.ts';
import type {Match} from '../src/results.ts';

function match():Match{
 return {
  metadata:{match_id:'coach-round-1',is_completed:true,started_at:'2026-11-16T05:00:00Z',game_length_in_ms:600000,queue:{id:'competitive'}},
  players:Array.from({length:10},(_,i)=>({puuid:'p'+i,team_id:i<5?'Blue':'Red'})),
  teams:[{team_id:'Blue',won:true,rounds:{won:13}},{team_id:'Red',won:false,rounds:{won:10}}],
  rounds:[{id:1,winning_team:'Blue',attacking_team:'Red',defending_team:'Blue'},{id:2,winning_team:'Red'}],
  kills:[{round:1,time_in_round_in_ms:1500,killer:{puuid:'p1'},victim:{puuid:'p7'}},
         {round:2,time_in_round_in_ms:2100,killer:{puuid:'p7'},victim:{puuid:'p1'}}]
 };
}
function store(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new NodeURL('../migrations/0007_competitive_round_events.sql',import.meta.url),'utf8'));
 const db={prepare:(text:string)=>({bind:(...args:unknown[])=>({
  first:async()=>sql.prepare(text).get(...args as never[])??null,
  run:async()=>({meta:{changes:Number(sql.prepare(text).run(...args as never[]).changes)}})
 })})} as unknown as D1Database;
 return {sql,db};
}
test('archives verified winners, sides and timed kills without inferring missing sides',()=>{
 const row=compactCompetitiveRoundEvents(match(),1000)!;
 assert.ok(row);
 assert.deepEqual(JSON.parse(row.roundsJson!),[
  {r:1,winner:'Blue',attack:'Red',defense:'Blue'},
  {r:2,winner:'Red',attack:null,defense:null}
 ]);
 assert.deepEqual(JSON.parse(row.killsJson!),[
  {r:1,t:1500,killer:'p1',victim:'p7'},
  {r:2,t:2100,killer:'p7',victim:'p1'}
 ]);
});
test('never fabricates events for missing arrays and rejects invalid game modes',()=>{
 const empty=match();delete empty.kills;delete empty.rounds;
 assert.equal(compactCompetitiveRoundEvents(empty),null);
 empty.rounds=[{id:1,winning_team:'not-a-team'}];
 assert.equal(JSON.parse(compactCompetitiveRoundEvents(empty)!.roundsJson!)[0].winner,null);
 empty.metadata.queue.id='spikerush';
 assert.equal(compactCompetitiveRoundEvents(empty),null);
});
test('malformed kill events cannot be silently omitted from first-kill analysis',()=>{
 const bad=match();
 bad.kills![1].victim.puuid='unknown-puuid';
 const row=compactCompetitiveRoundEvents(bad)!;
 assert.equal(row.killsJson,null);
 assert.ok(row.roundsJson);
});
test('one row per match: no KP, notifications, bets or duplicate inserts',async()=>{
 const {sql,db}=store();try{
  assert.equal(await recordCompetitiveRoundEvents(db,match(),1234),true);
  assert.equal(await recordCompetitiveRoundEvents(db,match(),5678),false);
  const row=sql.prepare('SELECT * FROM valorant_match_round_events').get() as {recorded_at:number;kills_json:string};
  assert.equal(row.recorded_at,1234);
  assert.equal(JSON.parse(row.kills_json).length,2);
  assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM valorant_match_round_events').get() as {n:number}).n,1);
 }finally{sql.close()}
});

test('partial archive is repaired when verified kills arrive later, without overwriting observations',async()=>{
 const {sql,db}=store();try{
  const partial=match();
  delete partial.kills;
  assert.equal(await recordCompetitiveRoundEvents(db,partial,1000),true);
  let row=sql.prepare('SELECT * FROM valorant_match_round_events').get() as
    {rounds_json:string;kills_json:string|null;recorded_at:number};
  assert.ok(row.rounds_json);
  assert.equal(row.kills_json,null);
  assert.equal(await recordCompetitiveRoundEvents(db,match(),2000),true);
  row=sql.prepare('SELECT * FROM valorant_match_round_events').get() as typeof row;
  assert.equal(JSON.parse(row.kills_json!).length,2);
  assert.equal(row.recorded_at,2000);
  // A fresh payload must not silently rewrite earlier observed events.
  const changed=match();changed.rounds![0].winning_team='Red';
  changed.kills![0].time_in_round_in_ms=222222;
  assert.equal(await recordCompetitiveRoundEvents(db,changed,3000),false);
  const unchanged=sql.prepare('SELECT * FROM valorant_match_round_events').get() as typeof row;
  assert.equal(unchanged.rounds_json,row.rounds_json);
  assert.equal(unchanged.kills_json,row.kills_json);
  assert.equal(unchanged.recorded_at,2000);
  assert.equal((sql.prepare('SELECT COUNT(*) n FROM valorant_match_round_events').get() as {n:number}).n,1);
 }finally{sql.close()}
});
test('partial kill-only archives accept missing rounds without replacing kills',async()=>{
 const {sql,db}=store();try{
  const onlyKills=match();delete onlyKills.rounds;
  assert.equal(await recordCompetitiveRoundEvents(db,onlyKills,1000),true);
  const before=sql.prepare('SELECT kills_json FROM valorant_match_round_events').get() as {kills_json:string};
  assert.equal(await recordCompetitiveRoundEvents(db,match(),2000),true);
  const after=sql.prepare('SELECT kills_json,rounds_json FROM valorant_match_round_events').get() as
    {kills_json:string;rounds_json:string};
  assert.equal(before.kills_json,after.kills_json);
  assert.equal(JSON.parse(after.rounds_json).length,2);
 }finally{sql.close()}
});

test('validated assistants fill only missing fields of identical old events and never overwrite known observations',async()=>{
 const {sql,db}=store();try{
  await recordCompetitiveRoundEvents(db,match(),1000);const m=match();m.kills![0].assistants=[{puuid:'p2'}];m.kills![1].assistants=[];
  assert.equal(await recordCompetitiveRoundEvents(db,m,2000),true);
  const a=sql.prepare('SELECT kills_json,recorded_at FROM valorant_match_round_events').get() as {kills_json:string;recorded_at:number};
  assert.deepEqual(JSON.parse(a.kills_json)[0].assistants,['p2']);assert.equal(JSON.parse(a.kills_json)[0].t,1500);assert.equal(a.recorded_at,2000);
  m.kills![0].assistants=[{puuid:'p3'}];assert.equal(await recordCompetitiveRoundEvents(db,m,3000),false);
  assert.equal((sql.prepare('SELECT kills_json FROM valorant_match_round_events').get() as {kills_json:string}).kills_json,a.kills_json);
  m.kills![0].time_in_round_in_ms=9999;assert.equal(await recordCompetitiveRoundEvents(db,m,4000),false);
 }finally{sql.close()}
});
test('malformed/absent assistant identity is unknown without dropping the valid kill timeline',()=>{
 const m=match();m.kills![0].assistants=[{puuid:'unknown'}];m.kills![1].assistants=[];
 const ks=JSON.parse(compactCompetitiveRoundEvents(m,1234)!.killsJson!);assert.equal(ks.length,2);assert.equal('assistants' in ks[0],false);assert.deepEqual(ks[1].assistants,[]);
});

test('existing-only normal-monitor enrichment cannot create a previously uncollected event row',async()=>{
 const {sql,db}=store();try{
  const m=match();m.kills!.forEach(k=>{k.assistants=[];});
  assert.equal(await recordCompetitiveRoundEvents(db,m,1000,{existingOnly:true}),false);
  assert.equal((sql.prepare('SELECT COUNT(*) n FROM valorant_match_round_events').get() as {n:number}).n,0);
  assert.equal(await recordCompetitiveRoundEvents(db,m,2000),true);
 }finally{sql.close()}
});

test('new round contexts and weapon names fill only matching old observations and replay is a no-op',async()=>{
 const {sql,db}=store();try{
  const m=match();await recordCompetitiveRoundEvents(db,m,1000);
  m.rounds![0].stats=m.players.map(p=>({player:{puuid:p.puuid},economy:{loadout_value:3000},ability_casts:{grenade:0}}));
  m.rounds![0].plant=null;m.kills![0].weapon={name:'Vandal'};
  assert.equal(await recordCompetitiveRoundEvents(db,m,2000,{existingOnly:true}),true);
  const saved=sql.prepare('SELECT * FROM valorant_match_round_events').get() as {rounds_json:string;kills_json:string;recorded_at:number};
  assert.equal(JSON.parse(saved.rounds_json)[0].context.e.at,2000);assert.equal(JSON.parse(saved.kills_json)[0].w,'Vandal');assert.equal(JSON.parse(saved.kills_json)[0].wAt,2000);
  assert.equal(await recordCompetitiveRoundEvents(db,m,3000,{existingOnly:true}),false);
  m.rounds![0].stats=m.players.map(p=>({player:{puuid:p.puuid},economy:{loadout_value:4500},ability_casts:{grenade:1}}));m.kills![0].weapon={name:'Phantom'};
  assert.equal(await recordCompetitiveRoundEvents(db,m,4000,{existingOnly:true}),false);
  assert.equal((sql.prepare('SELECT rounds_json FROM valorant_match_round_events').get() as {rounds_json:string}).rounds_json,saved.rounds_json);
  delete m.rounds![0].plant;m.rounds![1].plant=null;m.kills![0].time_in_round_in_ms=99999;
  assert.equal(await recordCompetitiveRoundEvents(db,m,5000,{existingOnly:true}),false,'a changed timeline cannot supply joint equipment evidence');
 }finally{sql.close()}
});

test('additional context bytes are bounded without discarding the existing round skeleton or kills',()=>{
 const m=match();m.players.forEach((p,i)=>p.puuid=('x'.repeat(120)+i));m.kills=[];
 m.rounds=Array.from({length:60},(_,id)=>({id,winning_team:'Blue',stats:m.players.map(p=>({player:{puuid:p.puuid},economy:{loadout_value:5000},ability_casts:{grenade:100,ability1:100,ability2:100,ultimate:100}}))}));
 const c=compactCompetitiveRoundEvents(m,1000)!;const rs=JSON.parse(c.roundsJson!);
 assert.equal(rs.length,60);assert.equal(rs[0].contextSchema,1);assert.equal(rs[0].contextOmitted,'size-cap');assert.equal(rs.some((r:any)=>r.context!==undefined),false);assert.equal(rs[59].r,59);
});
