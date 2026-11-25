import test from 'node:test';
import assert from 'node:assert/strict';
import {NORMAL_RELIC_BY_RARITY} from '../src/relic-catalog.ts';
import {summonRelics,type RelicCollection,type RelicItem} from '../src/relics.ts';
import {NORMAL_CONSUMABLES,SHARD_YIELDS,normalConsumableDrops,useNormalConsumable,consumableTargetAllowed} from '../src/relic-consumables.ts';

const make=(rarity:'common'|'rare'|'legendary'|'ancient'|'transcendent'='rare',count=3)=>{
 const def=NORMAL_RELIC_BY_RARITY.get(rarity)![0]!;
 const item:RelicItem={id:def.id,name:def.name,origin:'normal',rarity:def.rarity,power:def.power,ability:def.ability,mode:def.mode,skill:def.skill,count};
 const relics:RelicCollection={totalSummons:42,items:{[def.id]:item},equipped:[],shards:0,consumables:{}};
 return {state:{relics},def,item};
};
test('normal summons keep their old cost, rarity, count and level while independently dropping consumables',()=>{
 const a:{cash:number;relics?:RelicCollection}={cash:2000};
 const b:{cash:number;relics?:RelicCollection}={cash:2000};
 const draws=new Uint32Array(20).fill(900000);
 const bonusA=new Uint32Array([0,16000,22000,23500,999999,0,16000,22000,23500,999999]);
 const resultA=summonRelics(a,10,draws,undefined,bonusA);
 const resultB=summonRelics(b,10,draws);
 assert.equal(a.cash,0);assert.equal(b.cash,0);
 assert.deepEqual(resultA.summary,resultB.summary);
 assert.deepEqual(a.relics!.items,b.relics!.items);
 assert.equal(a.relics!.totalSummons,10);
 assert.deepEqual(resultA.consumables!.map(x=>[x.id,x.count]),[
  ['consumable.mirror',2],['consumable.shard_vial',2],['consumable.foil_seal',2]]);
 assert.deepEqual(a.relics!.consumables,{
  'consumable.mirror':2,'consumable.shard_vial':2,'consumable.foil_seal':2});
 assert.equal(resultB.consumables,undefined);
});
test('consumables have a valid separately documented total bonus probability',()=>{
 assert.equal(NORMAL_CONSUMABLES.length,3);
 assert.equal(NORMAL_CONSUMABLES.reduce((s,x)=>s+x.ratePerMillion,0),23500);
 assert.equal(new Set(NORMAL_CONSUMABLES.map(x=>x.id)).size,3);
 const {state}=make();
 const drops=normalConsumableDrops(state.relics,new Uint32Array([0,15999,16000,21999,22000,23499,23500]));
 assert.deepEqual(drops.map(x=>x.count),[2,2,2]);
 assert.equal(state.relics.consumables?.['consumable.foil_seal'],2);
});
test('mirror consumes only a spare ordinary copy and never changes rarity or summon level',()=>{
 const {state,def,item}=make('ancient');
 state.relics.consumables!['consumable.mirror']=1;
 const chosen=NORMAL_RELIC_BY_RARITY.get('ancient')!.filter(x=>x.id!==def.id)[0]!;
 const got=useNormalConsumable(state,'consumable.mirror',def.id,()=>0);
 assert.equal(got.gained,chosen.name);
 assert.equal(item.count,2);
 assert.equal(state.relics.items[chosen.id]?.rarity,'ancient');
 assert.equal(state.relics.items[chosen.id]?.count,1);
 assert.equal(state.relics.totalSummons,42);
 assert.equal(state.relics.consumables!['consumable.mirror'],undefined);
 assert.throws(()=>useNormalConsumable(state,'consumable.mirror',def.id,()=>0),/所持していません/);
});
test('shard vial consumes one duplicate and grants double base shards, not fresh KP',()=>{
 const {state,def,item}=make('legendary',2);
 state.relics.consumables!['consumable.shard_vial']=1;
 const got=useNormalConsumable(state,'consumable.shard_vial',def.id);
 assert.equal(got.shards,2*SHARD_YIELDS.legendary);
 assert.equal(state.relics.shards,2*SHARD_YIELDS.legendary);
 assert.equal(item.count,1);
 assert.equal(state.relics.consumables!['consumable.shard_vial'],undefined);
});
test('foil seal applies the existing one-time foil mechanic, never changes high rarity or item count',()=>{
 const {state,def,item}=make('rare',1);
 state.relics.consumables!['consumable.foil_seal']=1;
 const got=useNormalConsumable(state,'consumable.foil_seal',def.id,()=>1,123456);
 assert.equal(got.consumed,1);
 assert.deepEqual(item.foil,{kind:'starlit',percent:3,at:123456});
 assert.equal(item.count,1);
 assert.equal(state.relics.foilCount,1);
 assert.equal(state.relics.consumables!['consumable.foil_seal'],undefined);
});
test('foil and mutation cannot be overwritten; one-copy cannot be recycled and unknown targets never consume stock',()=>{
 const {state,def,item}=make('rare',1);
 state.relics.consumables!['consumable.mirror']=2;
 state.relics.consumables!['consumable.shard_vial']=1;
 state.relics.consumables!['consumable.foil_seal']=2;
 assert.throws(()=>useNormalConsumable(state,'consumable.mirror',def.id),/使用できる/);
 assert.throws(()=>useNormalConsumable(state,'consumable.shard_vial',def.id),/使用できる/);
 assert.throws(()=>useNormalConsumable(state,'consumable.foil_seal','bogus'),/使用できる/);
 item.mutation={kind:'prism',percent:12,at:1};
 assert.throws(()=>useNormalConsumable(state,'consumable.foil_seal',def.id),/使用できる/);
 delete item.mutation;
 item.foil={kind:'starlit',percent:3,at:1};
 assert.equal(consumableTargetAllowed(def.id,item,'consumable.foil_seal'),false);
 assert.throws(()=>useNormalConsumable(state,'consumable.foil_seal',def.id),/使用できる/);
 assert.deepEqual(state.relics.consumables,{'consumable.mirror':2,'consumable.shard_vial':1,'consumable.foil_seal':2});
});
test('high-rarity transcendents cannot be stamped with a common consumable',()=>{
 const {state,def}=make('transcendent',1);
 state.relics.consumables!['consumable.foil_seal']=1;
 assert.throws(()=>useNormalConsumable(state,'consumable.foil_seal',def.id),/使用できる/);
 assert.equal(state.relics.consumables!['consumable.foil_seal'],1);
});
