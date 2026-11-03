import test from 'node:test';
import assert from 'node:assert/strict';
import {NORMAL_RELIC_BY_RARITY} from '../src/relic-catalog.ts';
import type {RelicCollection,RelicItem} from '../src/relics.ts';
import {recycleNormalRelic,exchangeNormalRelic,exchangeMyHorseVoucher,spendMyHorseVoucher,SHARD_YIELDS,SHARD_PRICES,MY_HORSE_VOUCHER_PRICE} from '../src/relic-exchange.ts';
const pick=(rarity:'common'|'uncommon'|'rare'|'legendary'|'mythic'|'ancient'|'transcendent')=>NORMAL_RELIC_BY_RARITY.get(rarity)![0]!;
function owned(count=5){
 const d=pick('common');
 const item:RelicItem={id:d.id,name:d.name,origin:'normal',rarity:d.rarity,power:d.power+10,ability:d.ability,mode:d.mode,skill:d.skill,count,
  mutation:{kind:'prism',percent:12,at:1},foil:{kind:'starlit',percent:3,at:1}};
 const c:RelicCollection={totalSummons:100,items:{[d.id]:item},equipped:[d.id],shards:0};
 return {state:{relics:c},id:d.id};
}
test('recycle only duplicate regular copies, preserve first, mutation/foil and equipped slot',()=>{
 const {state,id}=owned(5);
 const got=recycleNormalRelic(state,id,4);
 assert.equal(got.gained,4*SHARD_YIELDS.common);
 assert.equal(state.relics.items[id]!.count,1);
 assert.equal(state.relics.equipped[0],id);
 assert.equal(state.relics.items[id]!.mutation?.kind,'prism');
 assert.equal(state.relics.items[id]!.foil?.kind,'starlit');
 assert.equal(state.relics.totalSummons,100);
 assert.throws(()=>recycleNormalRelic(state,id,1),/最後の1個/);
 assert.throws(()=>recycleNormalRelic(state,id,-1),/1〜1000/);
 assert.throws(()=>recycleNormalRelic(state,id,1001),/1〜1000/);
 assert.throws(()=>recycleNormalRelic(state,id,0.5),/1〜1000/);
});
test('special / external relics cannot be recycled',()=>{
 const {state,id}=owned();
 state.relics.items[id]!.origin='steam';
 assert.throws(()=>recycleNormalRelic(state,id,1),/通常召喚/);
 assert.equal(state.relics.shards,0);
});
test('shop permits chosen common through legendary and does not grant summon levels or variants',()=>{
 for(const rarity of ['common','uncommon','rare','legendary'] as const){
  const def=pick(rarity),state:{relics:RelicCollection}={relics:{totalSummons:99,items:{},equipped:[],shards:10000}};
  const result=exchangeNormalRelic(state,def.id);
  assert.equal(result.item.count,1);
  assert.equal(result.item.mutation,undefined);
  assert.equal(state.relics.shards,10000-SHARD_PRICES[rarity]!);
  assert.equal(state.relics.totalSummons,99);
  exchangeNormalRelic(state,def.id);
  assert.equal(result.item.count,2);
 }
 for(const rarity of ['mythic','ancient','transcendent'] as const){
  const def=pick(rarity),state:{relics:RelicCollection}={relics:{totalSummons:0,items:{},equipped:[],shards:10000}};
  assert.throws(()=>exchangeNormalRelic(state,def.id),/伝説以下/);
 }
});
test('horse voucher requires shards and is consumed only for normal box',()=>{
 const state:{relics:RelicCollection}={relics:{totalSummons:0,items:{},equipped:[],shards:MY_HORSE_VOUCHER_PRICE}};
 assert.equal(exchangeMyHorseVoucher(state).horseVouchers,1);
 assert.equal(state.relics.shards,0);
 assert.throws(()=>spendMyHorseVoucher(state,'legend'),/ノーマル/);
 assert.equal(state.relics.horseVouchers,1);
 assert.equal(spendMyHorseVoucher(state,'normal').horseVouchers,0);
 assert.throws(()=>spendMyHorseVoucher(state,'normal'),/ありません/);
 assert.throws(()=>exchangeMyHorseVoucher(state),/足りません/);
});
