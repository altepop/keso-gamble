import test from 'node:test';import assert from 'node:assert/strict';import {coachProviderShape} from '../src/coach-provider-shape.ts';
test('direct provider field evidence retains counts only, with absent paths distinct from observed numeric paths',()=>{
 const raw={players:Array.from({length:10},()=>({name:'private-name',puuid:'private-id',stats:{kills:10,headshots:4,bodyshots:12,legshots:4,damage:{dealt:2400,received:3000},secret:'private-token'}}))};
 const s=coachProviderShape(raw)!;assert.equal(s.headshots,10);assert.equal(s.statsDamageDealt,10);assert.equal(s.statsDamageMade,0);assert.equal(s.deaths,0);assert.equal(s.contract,'henrik-v4-direct');
 assert.equal(JSON.stringify(s).includes('private'),false);assert.ok(JSON.stringify(s).length<1024);assert.equal(coachProviderShape({players:[]}),null);
});
