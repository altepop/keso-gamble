import test from 'node:test';import assert from 'node:assert/strict';import {coachProviderShape} from '../src/coach-provider-shape.ts';
test('direct provider field evidence retains counts only, with absent paths distinct from observed numeric paths',()=>{
 const raw={players:Array.from({length:10},()=>({name:'private-name',puuid:'private-id',stats:{kills:10,headshots:4,bodyshots:12,legshots:4,damage:{dealt:2400,received:3000},secret:'private-token'}}))};
 const s=coachProviderShape(raw)!;assert.equal(s.headshots,10);assert.equal(s.statsDamageDealt,10);assert.equal(s.statsDamageMade,0);assert.equal(s.deaths,0);assert.equal(s.contract,'henrik-v4-direct');
 assert.equal(JSON.stringify(s).includes('private'),false);assert.ok(JSON.stringify(s).length<1024);assert.equal(coachProviderShape({players:[]}),null);
});

test('direct response observation validates assistant identity paths without outputting identities',()=>{
 const players=Array.from({length:10},(_,i)=>({puuid:'private-'+i,team_id:i<5?'Blue':'Red'}));
 const raw={players,kills:[{killer:{puuid:'private-0'},victim:{puuid:'private-5'},assistants:[{puuid:'private-1'}]}]};
 const shape=coachProviderShape(raw)!;assert.equal(shape.killAssistantIdsComplete,1);assert.equal(JSON.stringify(shape).includes('private'),false);
 raw.kills[0].assistants=[{puuid:'private-9'}];assert.equal(coachProviderShape(raw)!.killAssistantIdsComplete,0);
});
