import test from 'node:test';import assert from 'node:assert/strict';import {coachProviderShape} from '../src/coach-provider-shape.ts';
test('direct provider field evidence retains counts only, with absent paths distinct from observed numeric paths',()=>{
 const raw={players:Array.from({length:10},()=>({name:'private-name',puuid:'private-id',stats:{kills:10,headshots:4,bodyshots:12,legshots:4,damage:{dealt:2400,received:3000},secret:'private-token'}}))};
 const s=coachProviderShape(raw)!;assert.equal(s.headshots,10);assert.equal(s.statsDamageDealt,10);assert.equal(s.statsDamageMade,0);assert.equal(s.deaths,0);assert.equal(s.contract,'henrik-v4-direct');
 assert.equal(JSON.stringify(s).includes('private'),false);assert.ok(JSON.stringify(s).length<2048);assert.equal(coachProviderShape({players:[]}),null);
});

test('direct response observation validates assistant identity paths without outputting identities',()=>{
 const players=Array.from({length:10},(_,i)=>({puuid:'private-'+i,team_id:i<5?'Blue':'Red'}));
 const raw={players,kills:[{killer:{puuid:'private-0'},victim:{puuid:'private-5'},assistants:[{puuid:'private-1'}]}]};
 const shape=coachProviderShape(raw)!;assert.equal(shape.killAssistantIdsComplete,1);assert.equal(JSON.stringify(shape).includes('private'),false);
 raw.kills[0].assistants=[{puuid:'private-9'}];assert.equal(coachProviderShape(raw)!.killAssistantIdsComplete,0);
});

test('round-field probes sample fixed paths only, without outputting arbitrary keys or values',()=>{
 const players=Array.from({length:10},(_,i)=>({puuid:'private-'+i,team_id:i<5?'Blue':'Red'}));
 const shape=coachProviderShape({players,rounds:[{stats:[{player:{puuid:'private-0'},stats:{kills:1,deaths:0,assists:1,damage:{dealt:100,received:40}},economy:{spent:3900},ability_casts:{c_cast:1},private:'secret'}],plant:{private:'private-player'}}]})!;
 assert.equal(shape.roundStats,1);assert.equal(shape.roundStatPlayerIds,1);assert.equal(shape.roundStatKdaNested,1);assert.equal(shape.roundEconomy,1);assert.equal(shape.roundSurvived,0);assert.equal(JSON.stringify(shape).includes('private'),false);
});

test('new context probes verify fixed numeric and actor paths without copying account or weapon data',()=>{
 const players=Array.from({length:10},(_,i)=>({puuid:'private-'+i,team_id:i<5?'Blue':'Red'}));
 const s=coachProviderShape({players,rounds:[{stats:[{player:{puuid:'private-0'},economy:{loadout_value:4500},ability_casts:{grenade:0,ability1:null}}],plant:{player:{puuid:'private-0'},round_time_in_ms:12345},defuse:null}],kills:[{weapon:{name:'Vandal'}}]})!;
 assert.equal(s.roundEconomyLoadout,1);assert.equal(s.roundAbilityCounts,1);assert.equal(s.roundPlantActor,1);assert.equal(s.roundDefuseActor,0);assert.equal(s.roundPlantNull,0);assert.equal(s.roundDefuseNull,1);assert.equal(s.killWeaponKnown,1);
 assert.doesNotMatch(JSON.stringify(s),/private|Vandal|4500|12345/);
});
