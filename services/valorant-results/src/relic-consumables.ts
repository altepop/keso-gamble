/** Optional, additional normal-summon drops. Never replace a regular relic roll.
 * Consumed through the same optimistic, idempotent kp_operations transaction
 * as every other wallet mutation. No new D1 table, cron, or equip slot.
 */
import {NORMAL_RELIC_BY_ID,NORMAL_RELIC_BY_RARITY} from './relic-catalog.ts';
import type {NormalRelicRarity} from './relic-catalog.ts';
import type {RelicCollection,RelicItem} from './relics.ts';

export const SHARD_YIELDS:Readonly<Record<NormalRelicRarity,number>>={
 common:1,uncommon:3,rare:9,legendary:30,mythic:80,ancient:250,transcendent:1000,
};
export const NORMAL_CONSUMABLES=[
 {id:'consumable.mirror',name:'同格再鑑定の鏡',ratePerMillion:16000,
  description:'重複した通常遺物を1個使い、同じレアリティの別の通常遺物へランダム再鑑定。レアリティは変わらない。'},
 {id:'consumable.shard_vial',name:'欠片増幅瓶',ratePerMillion:6000,
  description:'通常遺物の余剰1個を消費し、通常の2倍の基礎欠片を受け取る。'},
 {id:'consumable.foil_seal',name:'虹彩刻印',ratePerMillion:1500,
  description:'超越以外の通常遺物1種に、1回だけ特殊外観を確定付与する。'},
] as const;
export type NormalConsumableId=(typeof NORMAL_CONSUMABLES)[number]['id'];
const consumableById=new Map<string,(typeof NORMAL_CONSUMABLES)[number]>(NORMAL_CONSUMABLES.map(x=>[x.id,x]));
const FOIL_KINDS=['holographic','starlit','abyss'] as const;
const randomIndex=(max:number)=>{const bytes=crypto.getRandomValues(new Uint32Array(1));return bytes[0]!%max;};
const nextPower=(base:number,count:number)=>base+Math.min(60,Math.floor(Math.log2(count))*5);

export function normalConsumableDrops(c:RelicCollection,rolls:Uint32Array){
 const total=NORMAL_CONSUMABLES.reduce((sum,x)=>sum+x.ratePerMillion,0);
 if(total>=1_000_000)throw Error('消耗品の抽選設定が不正です。');
 const bag=c.consumables??(c.consumables={});
 const won:Record<string,number>={};
 for(const number of rolls){
  let ticket=number%1_000_000;
  for(const item of NORMAL_CONSUMABLES){
   if(ticket<item.ratePerMillion){
    const old=bag[item.id]??0;
    if(!Number.isSafeInteger(old)||old<0||old>=Number.MAX_SAFE_INTEGER)throw Error('消耗品の所持数が不正です。');
    bag[item.id]=old+1;
    won[item.id]=(won[item.id]??0)+1;
    break;
   }
   ticket-=item.ratePerMillion;
  }
 }
 return NORMAL_CONSUMABLES.filter(item=>won[item.id]).map(item=>({id:item.id,name:item.name,count:won[item.id]!}));
}

export function consumableTargetAllowed(id:string,item:RelicItem|undefined,consumable:string):boolean{
 const def=NORMAL_RELIC_BY_ID.get(id);
 if(!item||!def||item.origin!=='normal'||item.rarity!==def.rarity||
  !Number.isSafeInteger(item.count)||item.count<1||item.mutation||item.foil)return false;
 if(consumable==='consumable.mirror'||consumable==='consumable.shard_vial')return item.count>=2;
 if(consumable==='consumable.foil_seal')return def.rarity!=='transcendent'&&!def.special;
 return false;
}

export function useNormalConsumable(state:{relics?:RelicCollection},consumable:string,target:string,draw=randomIndex,at=Date.now()){
 const def=consumableById.get(consumable);
 if(!def)throw Error('消耗品の種類が不正です。');
 const c=state.relics;
 const held=c?.consumables?.[consumable]??0;
 if(!Number.isSafeInteger(held)||held<1)throw Error('この消耗品を所持していません。');
 const item=c?.items?.[target];
 if(!consumableTargetAllowed(target,item,consumable))throw Error('使用できる通常遺物を選択してください。');
 const source=NORMAL_RELIC_BY_ID.get(target)!;
 if(!Number.isSafeInteger(at)||at<0)throw Error('時刻が不正です。');
 let effect:string;
 let gained:string|undefined;
 let shards:number|undefined;
 if(consumable==='consumable.mirror'){
  const candidates=NORMAL_RELIC_BY_RARITY.get(source.rarity)!.filter(x=>x.id!==target);
  const choice=draw(candidates.length);
  if(!Number.isSafeInteger(choice)||choice<0||choice>=candidates.length)throw Error('再鑑定の抽選が不正です。');
  const next=candidates[choice]!;
  const existing=c!.items[next.id];
  if(existing&&(!Number.isSafeInteger(existing.count)||existing.count<1||existing.count>=Number.MAX_SAFE_INTEGER||
    existing.origin!=='normal'||existing.rarity!==next.rarity))throw Error('再鑑定先の所持状態が不正です。');
  item!.count--;
  item!.power=nextPower(source.power,item!.count);
  if(item!.count===0)delete c!.items[target];
  if(existing){existing.count++;existing.power=nextPower(next.power,existing.count);}
  else c!.items[next.id]={id:next.id,name:next.name,origin:'normal',rarity:next.rarity,power:next.power,
   ability:next.ability,mode:next.mode,skill:next.skill,count:1};
  gained=next.name;
  effect=source.name+' → '+next.name+'（'+source.rarity+'のまま）';
 }else if(consumable==='consumable.shard_vial'){
  shards=SHARD_YIELDS[source.rarity]*2;
  if(!Number.isSafeInteger(c!.shards??0)||(c!.shards??0)<0||
    !Number.isSafeInteger((c!.shards??0)+shards))throw Error('欠片の所持上限に達しました。');
  item!.count--;
  item!.power=nextPower(source.power,item!.count);
  if(item!.count===0)delete c!.items[target];
  c!.shards=(c!.shards??0)+shards;
  effect=source.name+' ×1 → 欠片 +'+shards;
 }else{
  const choice=draw(FOIL_KINDS.length);
  if(!Number.isSafeInteger(choice)||choice<0||choice>=FOIL_KINDS.length)throw Error('虹彩刻印の抽選が不正です。');
  item!.foil={kind:FOIL_KINDS[choice]!,percent:3,at};
  c!.foilCount=(c!.foilCount??0)+1;
  effect=source.name+'に特殊外観を付与';
 }
 if(held===1)delete c!.consumables![consumable];
 else c!.consumables![consumable]=held-1;
 return {id:def.id,name:def.name,target:source.name,effect,remaining:held-1,...(gained?{gained}:{}),...(shards?{shards}:{}),consumed:1};
}
