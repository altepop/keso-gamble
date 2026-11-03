/** Player-to-player relic marketplace. One copy is escrowed in server state before listing.
 * All final transfers are atomic effects of the existing idempotent kp_operations INSERT.
 * A buyer's cash, acquisition, listing status and seller's 95% KP credit commit together. */
import type {KpEnv} from './kp.ts';
import {NORMAL_RELIC_BY_ID} from './relic-catalog.ts';
import {relicCollection} from './relics.ts';
import type {RelicCollection,RelicItem} from './relics.ts';

export const MARKET_FEE_PERCENT=5;
export const MARKET_MIN_PRICE=100,MARKET_MAX_PRICE=100000000;
export const MARKET_MAX_ACTIVE_PER_PLAYER=4;
export interface RelicMarketListing{
 id:string;guild:string;seller:string;relic:string;price:number;status:'active'|'sold'|'cancelled';at:number;buyer?:string|null;
}
const ready=new WeakSet<object>();
export async function ensureRelicMarket(env:KpEnv){
 if(ready.has(env.DB))return;
 await env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_relic_listings(
   id TEXT PRIMARY KEY,guild TEXT NOT NULL,seller TEXT NOT NULL,relic TEXT NOT NULL,
   price INTEGER NOT NULL CHECK(price BETWEEN 100 AND 100000000),status TEXT NOT NULL DEFAULT 'active'
   CHECK(status IN ('active','sold','cancelled')),at INTEGER NOT NULL,buyer TEXT,updated_at INTEGER)`),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS kp_relic_listings_active ON kp_relic_listings(guild,status,at DESC)"),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_relic_listing_create AFTER INSERT ON kp_operations
   WHEN json_extract(NEW.response,'$.result.relicMarket.action')='list' BEGIN
    INSERT INTO kp_relic_listings(id,guild,seller,relic,price,status,at)
    VALUES(NEW.guild||':'||NEW.user||':'||NEW.id,NEW.guild,NEW.user,
     json_extract(NEW.response,'$.result.relicMarket.relic'),
     json_extract(NEW.response,'$.result.relicMarket.price'),'active',NEW.at);
   END`),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_relic_listing_buy AFTER INSERT ON kp_operations
   WHEN json_extract(NEW.response,'$.result.relicMarket.action')='buy' BEGIN
    UPDATE kp_relic_listings SET status='sold',buyer=NEW.user,updated_at=NEW.at
    WHERE id=json_extract(NEW.response,'$.result.relicMarket.listing')
      AND guild=NEW.guild AND status='active' AND seller!=NEW.user
      AND relic=json_extract(NEW.response,'$.result.relicMarket.relic')
      AND price=json_extract(NEW.response,'$.result.relicMarket.price');
    SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'relic_market_sold') END;
    INSERT INTO kp_ledger(id,guild,user,delta,kind,at)
     SELECT 'relic-market:'||id,guild,seller,CAST(price*(100-${MARKET_FEE_PERCENT})/100 AS INTEGER),'relic_sale',NEW.at
     FROM kp_relic_listings WHERE id=json_extract(NEW.response,'$.result.relicMarket.listing')
       AND guild=NEW.guild AND buyer=NEW.user AND status='sold';
   END`),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_relic_listing_cancel AFTER INSERT ON kp_operations
   WHEN json_extract(NEW.response,'$.result.relicMarket.action')='cancel' BEGIN
    UPDATE kp_relic_listings SET status='cancelled',updated_at=NEW.at
    WHERE id=json_extract(NEW.response,'$.result.relicMarket.listing')
      AND guild=NEW.guild AND seller=NEW.user AND status='active';
    SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'relic_market_sold') END;
   END`),
 ]);
 ready.add(env.DB);
}
export async function activeRelicListings(env:KpEnv,guild:string){
 await ensureRelicMarket(env);
 return (await env.DB.prepare("SELECT id,guild,seller,relic,price,status,at FROM kp_relic_listings WHERE guild=? AND status='active' ORDER BY at DESC LIMIT 60").bind(guild).all<RelicMarketListing>()).results;
}
export async function listingById(env:KpEnv,guild:string,id:string){
 await ensureRelicMarket(env);
 if(!/^[0-9]{15,22}:[0-9]{15,22}:[a-zA-Z0-9-]{16,80}$/.test(id))throw Error('出品情報が不正です。');
 return await env.DB.prepare("SELECT id,guild,seller,relic,price,status,at,buyer FROM kp_relic_listings WHERE guild=? AND id=?").bind(guild,id).first<RelicMarketListing>();
}
const assertOrdinary=(id:string)=>{const def=NORMAL_RELIC_BY_ID.get(id);if(!def)throw Error('通常召喚の遺物だけ売買できます。');return def;};
export function prepareRelicListing(state:{relics?:RelicCollection},id:string,price:number,opId:string,guild:string,seller:string){
 if(!Number.isSafeInteger(price)||price<MARKET_MIN_PRICE||price>MARKET_MAX_PRICE||price%100!==0)
  throw Error('闇市の価格は100〜100,000,000 KPの100KP単位です。');
 const d=assertOrdinary(id),c=relicCollection(state),item=c.items[id];
 if(!item||item.origin!=='normal'||item.rarity!==d.rarity||!Number.isSafeInteger(item.count)||item.count<2)
  throw Error('通常遺物の余剰分（2個目以降）だけ出品できます。');
 if(item.mutation||item.foil)throw Error('変異・特殊外観が付いた遺物は闇市で取引できません。');
 item.count--;
 item.power=d.power+Math.min(60,Math.floor(Math.log2(item.count))*5);
 const listing=guild+':'+seller+':'+opId;
 return {relicMarket:{action:'list' as const,listing,relic:id,price},name:d.name};
}
export function receiveRelicListing(state:{cash:number;relics?:RelicCollection},listing:RelicMarketListing,user:string){
 if(!listing||listing.status!=='active'||listing.seller===user)throw Error('この出品は購入できません。');
 const def=assertOrdinary(listing.relic);
 if(!Number.isSafeInteger(listing.price)||listing.price<MARKET_MIN_PRICE||listing.price>MARKET_MAX_PRICE||state.cash<listing.price)
  throw Error('購入に必要なKPが足りません。');
 const c=relicCollection(state),prev=c.items[listing.relic];
 if(prev&&prev.origin!=='normal')throw Error('この遺物は受け取れません。');
 if(prev&&(!Number.isSafeInteger(prev.count)||prev.count<1||prev.count>=Number.MAX_SAFE_INTEGER))throw Error('遺物の所持数が不正です。');
 if(prev){prev.count++;prev.power=def.power+Math.min(60,Math.floor(Math.log2(prev.count))*5);}
 else {const item:RelicItem={id:def.id,name:def.name,origin:'normal',rarity:def.rarity,power:def.power,
  ability:def.ability,mode:def.mode,skill:def.skill,count:1};c.items[listing.relic]=item;}
 state.cash-=listing.price;
 return {relicMarket:{action:'buy' as const,listing:listing.id,relic:listing.relic,price:listing.price},name:def.name,paid:listing.price};
}
export function cancelRelicListing(state:{relics?:RelicCollection},listing:RelicMarketListing,user:string){
 if(!listing||listing.seller!==user||listing.status!=='active')throw Error('自分の出品だけ取り下げられます。');
 const def=assertOrdinary(listing.relic),c=relicCollection(state),item=c.items[listing.relic];
 if(item&&item.origin!=='normal')throw Error('遺物の状態を確認できません。');
 if(item&&(!Number.isSafeInteger(item.count)||item.count<1||item.count>=Number.MAX_SAFE_INTEGER))throw Error('所持数を確認できません。');
 if(item){item.count++;item.power=def.power+Math.min(60,Math.floor(Math.log2(item.count))*5);}
 else c.items[listing.relic]={id:def.id,name:def.name,origin:'normal',rarity:def.rarity,
  power:def.power,ability:def.ability,mode:def.mode,skill:def.skill,count:1};
 return {relicMarket:{action:'cancel' as const,listing:listing.id,relic:listing.relic,price:listing.price},name:def.name};
}
