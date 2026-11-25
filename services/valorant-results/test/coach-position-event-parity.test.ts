import test from 'node:test';
import assert from 'node:assert/strict';
import {coachPositionEventParity} from '../src/coach-position-event-parity.ts';
const roster=Array.from({length:10},(_,i)=>({puuid:'player-'+i,team_id:i<5?'Blue':'Red'}));
const snap=(frames:unknown[],order=roster)=>JSON.stringify({schema:1,roster:order.map(p=>({id:p.puuid,team:p.team_id})),frames});
const kill=(victim='player-1',killer:'player-0'|null='player-0')=>({r:0,t:1234,victim,killer,assistants:[]});
const frame=(victim=1,killer:number|null=0,time=1234)=>({round:0,time,victim,killer,victimLocation:[7,9],locations:[]});
const row=(k:unknown[],f:unknown[],order=roster)=>({players_json:JSON.stringify(roster),kills_json:JSON.stringify(k),positions_json:snap(f,order)});
test('matching independently stored kill and position events are comparable, without leaking identity or coordinates',()=>{
 const result=coachPositionEventParity([row([kill()],[frame()])]);
 assert.deepEqual([result.sampleMatches,result.comparableMatches,result.consistentMatches,result.mismatchedMatches,result.unavailableMatches],[1,1,1,0,0]);
 for(const secret of ['player-0','player-1','1234','7,9'])assert.equal(JSON.stringify(result).includes(secret),false);
});
test('same roster but mismatched victim, killer or event time is never reported consistent',()=>{
 const result=coachPositionEventParity([row([kill()],[frame(2)]),row([kill()],[frame(1,2)]),row([kill()],[frame(1,0,2345)])]);
 assert.equal(result.comparableMatches,3);assert.equal(result.mismatchedMatches,3);
 assert.equal(result.consistentMatches,0);
});
test('missing, malformed and unequal event count remain unavailable rather than falsely mismatched',()=>{
 const a=row([kill()],[frame()]),result=coachPositionEventParity([
  {...a,kills_json:null},{...a,positions_json:'{'},row([kill()],[frame(),frame()]),row([],[frame()])
 ]);
 assert.equal(result.unavailableMatches,4);assert.equal(result.mismatchedMatches,0);
});
test('reordered position roster uses stored indices instead of assumed index order',()=>{
 const rev=roster.slice().reverse();
 const result=coachPositionEventParity([row([kill()],[frame(8,9)],rev)]);
 assert.equal(result.consistentMatches,1);
});
test('invalid roster is excluded and report is bounded',()=>{
 const a=row([kill()],[frame()]);
 const p=JSON.parse(a.positions_json);p.roster[9]=p.roster[8];
 const result=coachPositionEventParity([{...a,positions_json:JSON.stringify(p)}]);
 assert.equal(result.unavailableMatches,1);
 assert.throws(()=>coachPositionEventParity(Array.from({length:251},()=>a)));
});
