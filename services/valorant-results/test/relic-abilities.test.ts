import test from 'node:test';
import assert from 'node:assert/strict';
import {ABILITY_RELICS,NORMAL_RELICS,NORMAL_RELIC_BY_RARITY,RELIC_CATALOG_COUNT} from '../src/relic-catalog.ts';
import {evaluateRelicBonus,summonRelics,type RelicCollection} from '../src/relics.ts';
import {recycleNormalRelic} from '../src/relic-exchange.ts';

const item=(id:string)=>{
 const d=ABILITY_RELICS.find(x=>x.id===id)!;
 return {...d,origin:'normal' as const,count:1};
};
function equip(...ids:string[]):RelicCollection{
 return {items:Object.fromEntries(ids.map(id=>[id,item(id)])),equipped:ids,totalSummons:100};
}
const result=(ids:string[],mode:string,amount:number,win=true)=>
 evaluateRelicBonus(equip(...ids),mode,{amount,win});

test('seven unique ability-only IDs are appended; legacy 175 and 8 pact relics remain untouched',()=>{
 assert.equal(ABILITY_RELICS.length,7);
 assert.equal(RELIC_CATALOG_COUNT,190);
 assert.equal(NORMAL_RELICS.length,175);
 assert.equal(new Set(ABILITY_RELICS.map(x=>x.id)).size,7);
 assert.deepEqual(ABILITY_RELICS.map(x=>x.rarity),['common','uncommon','rare','legendary','mythic','ancient','transcendent']);
 assert.ok(ABILITY_RELICS.every(x=>x.percent===0&&Boolean(x.special)));
});
test('flat bell provides fixed 6 KP only on verified positive game reward',()=>{
 const id='normal.ability.small_bell';
 assert.equal(result([id],'competitive',20).bonus,6);
 assert.equal(result([id],'competitive',500).bonus,6);
 assert.equal(result([id],'casino',500).bonus,0);
 assert.equal(result([id],'market',500).bonus,0);
 assert.equal(result([id],'racing',500).bonus,0);
 assert.equal(result([id],'mleague',500).bonus,0);
 assert.equal(result([id],'competitive',-10).bonus,0);
});
test('digit and square root are nonpercentage, integer-safe transformations',()=>{
 assert.equal(result(['normal.ability.digits'],'quiz',207).bonus,18);
 assert.equal(result(['normal.ability.root'],'steam',100).bonus,30);
 assert.equal(result(['normal.ability.root'],'loop',50000).bonus,Math.floor(Math.sqrt(50000))*3);
 assert.equal(result(['normal.ability.root'],'casino',50000).bonus,0);
});
test('comeback works only for positive non-victory receipts; threshold needs 500 KP',()=>{
 const a='normal.ability.comeback',b='normal.ability.threshold';
 assert.equal(result([a],'competitive',100,false).bonus,50);
 assert.equal(result([a],'competitive',100,true).bonus,0);
 assert.equal(result([a],'competitive',0,false).bonus,0);
 assert.equal(result([b],'mahjong',499).bonus,0);
 assert.equal(result([b],'mahjong',500).bonus,250);
 assert.equal(result([b],'casino',500).bonus,0);
});
test('ancient echo requires another actually triggered relic',()=>{
 const echo='normal.ability.echo',bell='normal.ability.small_bell',flag='normal.ability.comeback';
 assert.equal(result([echo],'quiz',100).bonus,0);
 assert.equal(result([echo,bell],'quiz',100).bonus,40+6);
 assert.equal(result([echo,bell,flag],'competitive',100,false).bonus,40*2+6+50);
 assert.equal(result([echo,flag],'competitive',100,true).bonus,0);
});
test('shard pick changes only shard extraction and preserves last relic + equipped tool',()=>{
 const pick='normal.ability.shard_pick';
 const base=NORMAL_RELICS.find(x=>x.rarity==='common')!;
 const state:{relics:RelicCollection}={relics:{totalSummons:0,items:{
  [pick]:item(pick),[base.id]:{...base,origin:'normal',count:4}},equipped:[pick],shards:0}};
 const gained=recycleNormalRelic(state,base.id,3);
 assert.equal(gained.gained,6);
 assert.equal(state.relics.items[base.id]!.count,1);
 assert.equal(state.relics.items[pick]!.count,1);
 assert.equal(result([pick],'quiz',100).bonus,0);
});
test('ability-only relics do not silently mutate into percent amplifiers via summon variants',()=>{
 const d=ABILITY_RELICS[0]!;
 const index=NORMAL_RELIC_BY_RARITY.get('common')!.findIndex(x=>x.id===d.id);
 assert.ok(index>=0);
 const s:{cash:number;relics?:RelicCollection}={cash:400};
 summonRelics(s,1,new Uint32Array([999999,index]),new Uint32Array([0,0]));
 summonRelics(s,1,new Uint32Array([999999,index]),new Uint32Array([0,0]));
 assert.equal(s.relics!.items[d.id]!.count,2);
 assert.equal(s.relics!.items[d.id]!.mutation,undefined);
 assert.equal(s.relics!.items[d.id]!.foil,undefined);
 assert.equal(result([d.id],'quiz',100).bonus,0);
});
