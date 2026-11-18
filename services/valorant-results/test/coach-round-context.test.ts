import test from 'node:test';import assert from 'node:assert/strict';
import {compactRoundContext,mergeRoundContexts,coachRoundContext,observedWeapon,observedRoundSides} from '../src/coach-round-context.ts';
import {compactCompetitiveRoundEvents} from '../src/round-events.ts';
import {coachRoundContribution} from '../src/coach-round-contribution.ts';
import type {Match} from '../src/results.ts';
export function contextMatch():Match{
 const players=Array.from({length:10},(_,i)=>({puuid:'p'+i,team_id:i<5?'Blue':'Red',name:'name'+i,tag:'JP',stats:{kills:i===0?2:i===5?1:0,deaths:[0,5,6].includes(i)?1:0,assists:0}}));
 const stats=(loadout:number)=>players.map(p=>({player:{puuid:p.puuid},economy:{loadout_value:p.puuid==='p0'?loadout:4500},ability_casts:p.puuid==='p0'?{grenade:0,ability1:2,ability2:null,ultimate:1}:{}}));
 return {metadata:{match_id:'context-match',queue:{id:'competitive'},is_completed:true,started_at:'2026-11-18T00:00:00Z',game_length_in_ms:1200000},players,teams:[{team_id:'Blue',won:true,rounds:{won:13}},{team_id:'Red',won:false,rounds:{won:0}}],
  rounds:Array.from({length:13},(_,id)=>({id,winning_team:'Blue',attacking_team:id===1?'Red':'Blue',defending_team:id===1?'Blue':'Red',...(id===0?{stats:stats(999),plant:{player:{puuid:'p0'},round_time_in_ms:30000},defuse:null}:id===1?{stats:stats(1000),plant:null,defuse:{player:{puuid:'p0'},round_time_in_ms:50000}}:{})})),
  kills:[{round:0,time_in_round_in_ms:1000,killer:{puuid:'p0'},victim:{puuid:'p5'},assistants:[],weapon:{name:'Vandal'}},{round:0,time_in_round_in_ms:2000,killer:{puuid:'p0'},victim:{puuid:'p6'},assistants:[],weapon:{name:'unknown-provider-text'}},{round:1,time_in_round_in_ms:5000,killer:{puuid:'p5'},victim:{puuid:'p0'},assistants:[],weapon:{name:'Phantom'}}]};
}
function fixture(){const m=contextMatch(),c=compactCompetitiveRoundEvents(m,1000)!;return {m,row:{match_id:c.id,players_json:JSON.stringify(m.players.map(p=>({puuid:p.puuid,team_id:p.team_id,name:p.name,tag:p.tag,k:p.stats?.kills,d:p.stats?.deaths,a:p.stats?.assists}))),teams_json:JSON.stringify(m.teams.map(t=>({id:t.team_id,rounds:t.rounds?.won}))),rounds_json:c.roundsJson,kills_json:c.killsJson}};}
const accounts=[{name:'name0',tag:'JP',puuid:'p0'}];
test('fixed field capture distinguishes null event, missing field, invalid actor and true zero cast',()=>{
 const teams=new Map([['p0','Blue'],['p1','Red']]);
 const c=compactRoundContext({attacking_team:'Blue',stats:[{player:{puuid:'p0'},economy:{loadout_value:0},ability_casts:{grenade:0,ability1:null,ability2:-1,ultimate:1}}],plant:null,defuse:{player:{puuid:'unknown'},round_time_in_ms:20}},teams,1000)!;
 assert.equal(c.e?.p[0].v,0);assert.equal(c.a?.p[0].grenade,0);assert.equal(c.a?.p[0].ability1,undefined);assert.equal(c.a?.p[0].ability2,undefined);assert.deepEqual(c.plant,{at:1000,event:null});assert.equal(c.defuse,undefined);
 assert.equal(compactRoundContext({plant:{player:{puuid:'p1'},round_time_in_ms:1},attacking_team:'Blue'},teams,1000),null);
 assert.equal(compactRoundContext({plant:{player:{puuid:'p0'},round_time_in_ms:900001}},teams,1000),null);
 assert.equal(observedWeapon({name:'vandal'}),'Vandal');assert.equal(observedWeapon({name:'<script>private</script>'}),null);
});
test('duplicate or unknown stat identities invalidate that block without suppressing a separate spike event',()=>{
 const teams=new Map([['p0','Blue']]);
 const c=compactRoundContext({stats:[{player:{puuid:'p0'},economy:{loadout_value:100}},{player:{puuid:'p0'},economy:{loadout_value:200}}],plant:null},teams,1000)!;
 assert.equal(c.e,undefined);assert.equal(c.a,undefined);assert.equal(c.plant?.event,null);
});
test('equipment, cast and spike denominators work without a complete kill timeline',()=>{
 const {row}=fixture(),r=coachRoundContext([row],accounts,new Set());
 assert.equal(r.quality.candidateRounds,13);assert.equal(r.quality.economy.rounds,2);assert.equal(r.bands[0].rounds,1);assert.equal(r.bands[1].rounds,1);assert.equal(r.bands[0].combatRounds,0);
 assert.deepEqual(r.abilities.grenade,{casts:0,rounds:2,matches:1,recordedAt:{oldest:1000,newest:1000}});assert.equal(r.abilities.ability1.casts,4);assert.equal(r.abilities.ability2.rounds,0);
 assert.deepEqual(r.spike.plant,{events:1,rounds:2,matches:1,recordedAt:{oldest:1000,newest:1000}});assert.deepEqual(r.spike.defuse,{events:1,rounds:2,matches:1,recordedAt:{oldest:1000,newest:1000}});
 assert.deepEqual(r.quality.economy.recordedAt,{oldest:1000,newest:1000});assert.equal(r.peerComparableRounds,2);assert.equal(r.lowWithArmedPeers,1);assert.equal(r.notes.length,0);
 assert.equal(r.weapons.matches,0);assert.equal(r.pistols.rounds,0);
});
test('verified combat supplies equipment K/D, regulated pistol observations and known weapon coverage only',()=>{
 const {row}=fixture(),verified=new Set<string>();coachRoundContribution([row],accounts,r=>verified.add(r.match_id));assert.equal(verified.size,1);
 const r=coachRoundContext([row],accounts,verified);
 assert.equal(r.bands[0].kills,2);assert.equal(r.bands[0].deaths,0);assert.equal(r.bands[1].deaths,1);
 assert.equal(r.weapons.totalKills,2);assert.equal(r.weapons.knownKills,1);assert.deepEqual(r.weapons.counts,[{weapon:'Vandal',kills:1}]);
 assert.equal(r.pistols.rounds,2);assert.equal(r.pistols.kills,2);assert.equal(r.pistols.deaths,0);assert.equal(r.pistols.knownOutcomes,2);assert.equal(r.pistols.wins,2);
});
test('one match is counted once and an ambiguous two-account game is excluded',()=>{
 const {row}=fixture();assert.equal(coachRoundContext([row,row],accounts,new Set()).quality.candidateRounds,13);
 const r=coachRoundContext([row],[...accounts,{name:'name1',tag:'JP',puuid:'p1'}],new Set());assert.equal(r.quality.candidateRounds,0);assert.equal(r.quality.economy.matches,0);
 const corrupted={...row,teams_json:JSON.stringify([{id:'Blue',rounds:12},{id:'Red',rounds:0}])};assert.equal(coachRoundContext([corrupted],accounts,new Set()).quality.candidateRounds,0);
});
test('context enrichment fills missing domains, keeps known snapshots and rejects changed round cores',()=>{
 const old=JSON.stringify([{r:0,winner:'Blue',attack:'Blue',defense:'Red',context:{v:1,e:{at:1000,p:[{u:'p0',v:1000}]}}}]);
 const incoming=JSON.stringify([{r:0,winner:'Blue',attack:'Blue',defense:'Red',contextSchema:1,context:{v:1,e:{at:2000,p:[{u:'p0',v:5000}]},plant:{at:2000,event:null}}}]);
 const out=mergeRoundContexts(old,incoming),r=JSON.parse(out.json!)[0];assert.equal(out.compatible,true);assert.equal(r.context.e.p[0].v,1000);assert.equal(r.context.e.at,1000);assert.equal(r.context.plant.at,2000);assert.equal(r.contextSchema,1);
 assert.equal(mergeRoundContexts(out.json,incoming).json,out.json);
 assert.deepEqual(mergeRoundContexts(old,incoming.replace('"winner":"Blue"','"winner":"Red"')),{json:old,compatible:false});
});

test('match casts stay independent of round timelines, and rate numerators use only games with valid R',()=>{
 const {row}=fixture();const ps=JSON.parse(row.players_json);ps[0].casts={grenade:0,ability1:3,ultimate:null};ps[0].castsAt=1234;
 const first={...row,players_json:JSON.stringify(ps),rounds_json:null};
 const other=structuredClone(ps);other[0].casts.ability1=10;
 const second={...row,match_id:'unknown-rounds',players_json:JSON.stringify(other),rounds_json:null,teams_json:JSON.stringify([{id:'Blue',rounds:null},{id:'Red',rounds:null}])};
 const r=coachRoundContext([first,second],accounts,new Set());
 assert.equal(r.matchAbilities.ability1.casts,13);assert.equal(r.matchAbilities.ability1.matches,2);assert.equal(r.matchAbilities.ability1.rateCasts,3);assert.equal(r.matchAbilities.ability1.rounds,13);assert.equal(r.matchAbilities.ability1.rateMatches,1);
 assert.equal(r.matchAbilities.grenade.matches,2);assert.equal(r.matchAbilities.grenade.casts,0);assert.equal(r.matchAbilities.ultimate.matches,0);assert.equal(r.abilities.ability1.rounds,0);
 assert.deepEqual(r.matchAbilities.ability1.recordedAt,{oldest:1234,newest:1234});
});
test('complete conflicting round cast totals are excluded without invalidating match totals or equipment',()=>{
 const {row}=fixture(),ps=JSON.parse(row.players_json),rs=JSON.parse(row.rounds_json!);ps[0].casts={grenade:99};ps[0].castsAt=1234;
 for(const r of rs)r.context={...(r.context??{v:1}),a:{at:1000,p:[{u:'p0',grenade:1}]}};
 const out=coachRoundContext([{...row,players_json:JSON.stringify(ps),rounds_json:JSON.stringify(rs)}],accounts,new Set());
 assert.equal(out.matchAbilities.grenade.casts,99);assert.equal(out.abilities.grenade.rounds,0);assert.equal(out.abilities.grenade.recordedAt,null);assert.equal(out.quality.economy.rounds,2);assert.equal(out.quality.excluded['round-cast-total-mismatch:grenade'],1);
});

test('separate partial snapshots cannot accumulate beyond the context byte cap',()=>{
 const ids=Array.from({length:10},(_,i)=>'x'.repeat(36)+i);
 const old=Array.from({length:60},(_,r)=>({r,winner:'Blue',attack:'Blue',defense:'Red',context:{v:1,e:{at:1000,p:ids.map(u=>({u,v:4500}))}}}));
 const fresh=old.map(r=>({...r,contextSchema:1,context:{v:1,a:{at:2000,p:ids.map(u=>({u,grenade:100,ability1:100,ability2:100,ultimate:100}))}}}));
 const merged=JSON.parse(mergeRoundContexts(JSON.stringify(old),JSON.stringify(fresh)).json!);
 assert.equal(merged[0].contextOmitted,'size-cap');assert.deepEqual(merged[0].context.e,old[0].context.e);assert.equal(merged.some((r:any)=>r.context.a),false);
 const bare=merged.map(({context,...r}:any)=>r);assert.ok(Buffer.byteLength(JSON.stringify(merged))-Buffer.byteLength(JSON.stringify(bare))<=65536);
});

test('winner role metadata resolves sides only for an unambiguous known winner and two known teams',()=>{
 const teams=new Set(['Blue','Red']);
 assert.deepEqual(observedRoundSides({winning_team:'Blue',winning_team_role:'Attacker'},teams),{attack:'Blue',defense:'Red',derived:true});
 assert.deepEqual(observedRoundSides({winning_team:'Blue',winning_team_role:'Defense'},teams),{attack:'Red',defense:'Blue',derived:true});
 assert.deepEqual(observedRoundSides({winning_team:'Blue',winning_team_role:'unknown'},teams),{attack:null,defense:null,derived:false});
 assert.deepEqual(observedRoundSides({winning_team:'unknown',winning_team_role:'Attack'},teams),{attack:null,defense:null,derived:false});
 assert.deepEqual(observedRoundSides({winning_team:'Blue',winning_team_role:'Defender',attacking_team:'Blue',defending_team:'Red'},teams),{attack:null,defense:null,derived:false});
 const old=JSON.stringify([{r:0,winner:'Blue',attack:null,defense:null}]),fresh=JSON.stringify([{r:0,winner:'Blue',attack:'Blue',defense:'Red',sideSource:'winner-role'}]);
 const merged=mergeRoundContexts(old,fresh);assert.equal(merged.compatible,true);assert.equal(JSON.parse(merged.json!)[0].sideSource,'winner-role');assert.equal(mergeRoundContexts(merged.json,fresh).json,merged.json);
 assert.equal(mergeRoundContexts(JSON.stringify([{r:0,winner:'Blue',attack:'Blue',defense:null}]),JSON.stringify([{r:0,winner:'Blue',attack:null,defense:'Blue'}])).compatible,false);
});

test('inconsistent round outcomes invalidate outcome rates without dropping valid equipment or combat counts',()=>{
 const {row}=fixture(),rounds=JSON.parse(row.rounds_json!);rounds[0].winner='Red';
 const r=coachRoundContext([{...row,rounds_json:JSON.stringify(rounds)}],accounts,new Set([row.match_id]));
 assert.equal(r.quality.economy.rounds,2);assert.equal(r.bands[0].kills,2);assert.equal(r.bands[0].knownOutcomes,0);assert.equal(r.pistols.rounds,2);assert.equal(r.pistols.knownOutcomes,0);assert.equal(r.quality.excluded['round-outcomes-do-not-match-team'],1);
});
