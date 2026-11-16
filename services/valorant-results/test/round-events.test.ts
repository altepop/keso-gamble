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
