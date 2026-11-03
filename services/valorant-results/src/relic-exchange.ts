/** Shard exchange is server-owned, and only executes through idempotent kp_operations.
 * It never converts verified Steam/Unite exclusives or an item's final owned copy.
 * All values are persisted in the existing user state (no new D1 table/cron). */
import {NORMAL_RELIC_BY_ID} from './relic-catalog.ts';
import type {NormalRelicRarity} from './relic-catalog.ts';
import {relicCollection} from './relics.ts';
import type {RelicCollection,RelicItem} from './relics.ts';

export const SHARD_YIELDS:Readonly<Record<NormalRelicRarity,number>>={
 common:1,uncommon:3,rare:9,legendary:30,mythic:80,ancient:250,transcendent:1000,
};
export const SHARD_PRICES:Readonly<Partial<Record<NormalRelicRarity,number>>>={
 common:15,uncommon:45,rare:130,legendary:450,
};
/** One voucher is redeemable only for a normal (3,000-KP) horse box.
 * A voucher-funded horse has price=0, preventing resale arbitrage. */
export const MY_HORSE_VOUCHER_PRICE=180;
export const MAX_RECYCLING_COPIES=1000;
export const exchangeBalance=(c?:RelicCollection)=>({
 shards:Math.max(0,Math.floor(c?.shards??0)),
 horseVouchers:Math.max(0,Math.floor(c?.horseVouchers??0)),
});
const assertBalance=(c:RelicCollection)=>{
 if(!Number.isSafeInteger(c.shards??0)||(c.shards??0)<0||!Number.isSafeInteger(c.horseVouchers??0)||(c.horseVouchers??0)<0)
  throw Error('交換所の残高を確認できません。');
};
export function recycleNormalRelic(state:{relics?:RelicCollection},id:string,numberOfCopies:number){
 if(!Number.isSafeInteger(numberOfCopies)||numberOfCopies<1||numberOfCopies>MAX_RECYCLING_COPIES)
  throw Error('欠片に変える個数は1〜1000個にしてください。');
 const c=relicCollection(state);assertBalance(c);
 const item=c.items[id],def=NORMAL_RELIC_BY_ID.get(id);
 if(!item||item.origin!=='normal'||!def||item.rarity!==def.rarity)
  throw Error('欠片にできるのは通常召喚の遺物だけです。');
 if(!Number.isSafeInteger(item.count)||item.count<=numberOfCopies)
  throw Error('最後の1個は残してください。');
 const miner=c.equipped.slice(0,4).some(key=>key==='normal.ability.shard_pick'&&c.items[key]?.origin==='normal'&&c.items[key]!.count>=1);
 const shards=numberOfCopies*(SHARD_YIELDS[def.rarity]+(miner?1:0));
 if(!Number.isSafeInteger(shards+(c.shards??0)))throw Error('欠片の所持上限に達しました。');
 item.count-=numberOfCopies;
 item.power=def.power+Math.min(60,Math.floor(Math.log2(item.count))*5);
 c.shards=(c.shards??0)+shards;
 return {relic:id,name:item.name,recycled:numberOfCopies,gained:shards,shards:c.shards,remaining:item.count};
}
export function exchangeNormalRelic(state:{relics?:RelicCollection},id:string){
 const def=NORMAL_RELIC_BY_ID.get(id);
 if(!def||!Object.hasOwn(SHARD_PRICES,def.rarity))throw Error('交換できるのは伝説以下の通常遺物です。');
 const c=relicCollection(state);assertBalance(c);
 const cost=SHARD_PRICES[def.rarity]!;
 if((c.shards??0)<cost)throw Error('交換に必要な欠片が足りません。');
 const current=c.items[id];
 if(current&&current.origin!=='normal')throw Error('限定遺物は交換できません。');
 if(current&&(!Number.isSafeInteger(current.count)||current.count<1))throw Error('遺物の所持数を確認できません。');
 if(current&&current.count>=Number.MAX_SAFE_INTEGER)throw Error('所持上限に達しました。');
 c.shards=(c.shards??0)-cost;
 if(current){
  current.count++;
  current.power=def.power+Math.min(60,Math.floor(Math.log2(current.count))*5);
 }else{
  const item:RelicItem={id:def.id,name:def.name,origin:'normal',rarity:def.rarity,power:def.power,
   ability:def.ability,mode:def.mode,skill:def.skill,count:1};
  c.items[id]=item;
 }
 return {relic:id,item:c.items[id],cost,shards:c.shards};
}
export function exchangeMyHorseVoucher(state:{relics?:RelicCollection}){
 const c=relicCollection(state);assertBalance(c);
 if((c.shards??0)<MY_HORSE_VOUCHER_PRICE)throw Error('引換券に必要な欠片が足りません。');
 if((c.horseVouchers??0)>=999)throw Error('引換券は999枚まで保有できます。');
 c.shards=(c.shards??0)-MY_HORSE_VOUCHER_PRICE;
 c.horseVouchers=(c.horseVouchers??0)+1;
 return {shards:c.shards,horseVouchers:c.horseVouchers,cost:MY_HORSE_VOUCHER_PRICE};
}
export function spendMyHorseVoucher(state:{relics?:RelicCollection},box:string){
 if(box!=='normal')throw Error('My馬引換券はノーマルボックス専用です。');
 const c=relicCollection(state);assertBalance(c);
 if(!(c.horseVouchers??0))throw Error('My馬引換券がありません。');
 c.horseVouchers=(c.horseVouchers??0)-1;
 return {horseVouchers:c.horseVouchers};
}
