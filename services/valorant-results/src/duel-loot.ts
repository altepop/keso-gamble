/** Server-only PvP progression. Only verified natural terminal moves issue loot receipts.
 * Receipts and skill progress are committed by the same SQLite transaction as
 * the duel payout trigger. Claims are atomic with kp_operations via a trigger.
 */
import type {KpEnv} from './kp.ts';
import {relicCollection,type RelicCollection} from './relics.ts';
import {DUEL_PVP_SELECT_ID,DUEL_PVP_CONSUMABLE,DUEL_PVP_ANCIENT_ID,DUEL_PVP_ANCIENT} from './relic-consumables.ts';

/** High-value drops have a per-opponent limit, not a total daily hard stop.
 * Repeat matches beyond this cap remain playable, but have no skill or loot.
 * Caps are based on verified server-authoritative completion records.
 */
export const DUEL_LOOT_DAILY_FULL_RATE=12;
export const DUEL_LOOT_PAIR_DAILY_FULL_RATE=4;
export {DUEL_PVP_SELECT_ID,DUEL_PVP_CONSUMABLE,DUEL_PVP_ANCIENT_ID,DUEL_PVP_ANCIENT} from './relic-consumables.ts';
export type DuelLootReceipt={
 duel_id:string;guild:string;user:string;game:string;opponent:string;
 outcome:'win'|'loss'|'draw';rating:number;day:number;settled_at:number;claimed_at:number|null;reward_scale?:number;
};
export function skillStage(rating:number){return Math.max(0,Math.min(4,Math.floor(Math.max(0,rating)/500)));}
export const skillTierName=(rating:number)=>['見習い','挑戦者','名人','達人','超人'][skillStage(rating)]!;
/** PvP rare chance is independent of skill: a strong player beating a novice
 * receives no more than a novice beating another novice.
 * PvE will have its own skill-dependent tables in a separate implementation.
 */
export function duelDropChance(_rating:number,outcome:DuelLootReceipt['outcome']){
 return outcome==='win'?40000:20000; // 4% / 2%
}
/** Extra-high prize, unattainable via the ordinary shard exchange. */
export function duelAncientChance(_rating:number,outcome:DuelLootReceipt['outcome']){
 return outcome==='win'?2000:1000; // 0.2% / 0.1%
}
export function duelUsefulChance(_rating:number,outcome:DuelLootReceipt['outcome']){
 return outcome==='win'?140000:70000; // 14% / 7%
}
export const randomDuelTicket=()=>{
 const values=new Uint32Array(1),range=1_000_000,limit=Math.floor(0x1_0000_0000/range)*range;
 do{crypto.getRandomValues(values);}while(values[0]!>=limit);
 return values[0]!%range;
};
export function grantVerifiedPvPReward(state:{relics?:RelicCollection},receipt:DuelLootReceipt,ticket:number){
 if(!Number.isSafeInteger(ticket)||ticket<0||ticket>=1_000_000)throw Error('報酬抽選値が不正です。');
 if(!Number.isSafeInteger(receipt.rating)||receipt.rating<0||receipt.rating>2500)
  throw Error('熟練度の記録が不正です。');
 const relics=relicCollection(state);
 const scale=receipt.reward_scale??1;
 if(![1,0.5,0.25].includes(scale))throw Error('報酬補正の記録が不正です。');
 const baseShards=receipt.outcome==='win'?6:receipt.outcome==='draw'?4:3;
 // Never go to zero: genuine repeat play still progresses, but coordinated farming
 // cannot mint full-value shards endlessly without changing opponents.
 const shards=Math.max(1,Math.floor(baseShards*scale));
 if(!Number.isSafeInteger(relics.shards??0)||(relics.shards??0)<0||
  !Number.isSafeInteger((relics.shards??0)+shards))throw Error('欠片の所持上限です。');
 const rate=Math.floor(duelDropChance(receipt.rating,receipt.outcome)*scale);
 const ancientRate=Math.floor(duelAncientChance(receipt.rating,receipt.outcome)*scale);
 const usefulRate=Math.floor(duelUsefulChance(receipt.rating,receipt.outcome)*scale);
 const droppedId=ticket<ancientRate?DUEL_PVP_ANCIENT_ID
  :ticket<ancientRate+rate?DUEL_PVP_SELECT_ID
  :ticket<ancientRate+rate+usefulRate?'consumable.shard_vial':null;
 if(droppedId){
  const bag=relics.consumables??(relics.consumables={});
  const n=bag[droppedId]??0;
  if(!Number.isSafeInteger(n)||n<0||n===Number.MAX_SAFE_INTEGER)throw Error('消耗品の所持上限です。');
  bag[droppedId]=n+1;
 }
 relics.shards=(relics.shards??0)+shards;
 return {duelLootClaim:true,duel:receipt.duel_id,game:receipt.game,
  rating:receipt.rating,stage:skillTierName(receipt.rating),outcome:receipt.outcome,
  ratePercent:rate/10000,ancientRatePercent:ancientRate/10000,bonusRatePercent:usefulRate/10000,
  rewardScale:scale,shards,droppedItem:droppedId,
  droppedName:droppedId===DUEL_PVP_ANCIENT_ID?DUEL_PVP_ANCIENT.name
   :droppedId===DUEL_PVP_SELECT_ID?DUEL_PVP_CONSUMABLE.name
   :droppedId==='consumable.shard_vial'?'欠片増幅瓶':null};
}
const ready=new WeakMap<object,Promise<void>>();
export async function ensureDuelLoot(env:KpEnv){
 const previous=ready.get(env.DB);if(previous)return previous;
 const task=(async()=>{
  await env.DB.batch([
   env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_duel_skill(
    guild TEXT NOT NULL,user TEXT NOT NULL,game TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 0 CHECK(rating BETWEEN 0 AND 2500),
    peak INTEGER NOT NULL DEFAULT 0 CHECK(peak BETWEEN 0 AND 2500),
    games INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,draws INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,PRIMARY KEY(guild,user,game))`),
   env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_duel_loot_receipts(
    guild TEXT NOT NULL,duel_id TEXT NOT NULL,user TEXT NOT NULL,
    game TEXT NOT NULL,opponent TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK(outcome IN ('win','loss','draw')),
    rating INTEGER NOT NULL,day INTEGER NOT NULL,settled_at INTEGER NOT NULL,
    claimed_at INTEGER,drop_id TEXT,reward_scale REAL NOT NULL DEFAULT 1 CHECK(reward_scale IN (1,0.5)),
    PRIMARY KEY(guild,duel_id,user))`),
   env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_duel_loot_daily ON kp_duel_loot_receipts(guild,user,day,opponent)'),
   env.DB.prepare("INSERT OR IGNORE INTO kp_settings(key,value) VALUES('duel_loot_started_at',?)").bind(String(Date.now())),
   env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_duel_progress_after_finish
    AFTER UPDATE OF status ON kp_board_duels
    WHEN OLD.status='active' AND NEW.status='finished'
     AND NEW.updated_at >= CAST((SELECT value FROM kp_settings WHERE key='duel_loot_started_at') AS INTEGER)
     AND EXISTS(SELECT 1 FROM kp_board_duel_actions a WHERE a.duel_id=NEW.id AND a.version=OLD.version
      AND a.kind='move' AND a.winner IS NOT NULL)
    BEGIN
     INSERT INTO kp_duel_skill(guild,user,game,rating,peak,games,wins,losses,draws,updated_at)
      VALUES(NEW.guild,NEW.user_a,NEW.game,CASE WHEN (SELECT COUNT(*) FROM kp_duel_loot_receipts WHERE guild=NEW.guild AND user=NEW.user_a
       AND opponent=NEW.user_b AND day=CAST((NEW.updated_at+32400000)/86400000 AS INTEGER))>=4 THEN 0 ELSE (CASE WHEN NEW.winner=NEW.user_a THEN 35 WHEN NEW.winner=NEW.user_b THEN 7 ELSE 12 END) END,
       CASE WHEN (SELECT COUNT(*) FROM kp_duel_loot_receipts WHERE guild=NEW.guild AND user=NEW.user_a
       AND opponent=NEW.user_b AND day=CAST((NEW.updated_at+32400000)/86400000 AS INTEGER))>=4 THEN 0 ELSE (CASE WHEN NEW.winner=NEW.user_a THEN 35 WHEN NEW.winner=NEW.user_b THEN 7 ELSE 12 END) END,1,
       CASE WHEN NEW.winner=NEW.user_a THEN 1 ELSE 0 END,CASE WHEN NEW.winner=NEW.user_b THEN 1 ELSE 0 END,
       CASE WHEN NEW.winner='draw' THEN 1 ELSE 0 END,NEW.updated_at)
      ON CONFLICT(guild,user,game) DO UPDATE SET
       rating=MAX(0,MIN(2500,rating+CASE WHEN (SELECT COUNT(*) FROM kp_duel_loot_receipts WHERE guild=NEW.guild AND user=NEW.user_a
       AND opponent=NEW.user_b AND day=CAST((NEW.updated_at+32400000)/86400000 AS INTEGER))>=4 THEN 0 ELSE (CASE WHEN NEW.winner=NEW.user_a THEN 35 WHEN NEW.winner=NEW.user_b THEN 7 ELSE 12 END) END)),
       peak=MAX(peak,MAX(0,MIN(2500,rating+CASE WHEN (SELECT COUNT(*) FROM kp_duel_loot_receipts WHERE guild=NEW.guild AND user=NEW.user_a
       AND opponent=NEW.user_b AND day=CAST((NEW.updated_at+32400000)/86400000 AS INTEGER))>=4 THEN 0 ELSE (CASE WHEN NEW.winner=NEW.user_a THEN 35 WHEN NEW.winner=NEW.user_b THEN 7 ELSE 12 END) END))),
       games=games+1,wins=wins+(NEW.winner=NEW.user_a),
       losses=losses+(NEW.winner=NEW.user_b),draws=draws+(NEW.winner='draw'),updated_at=NEW.updated_at;
     INSERT INTO kp_duel_skill(guild,user,game,rating,peak,games,wins,losses,draws,updated_at)
      VALUES(NEW.guild,NEW.user_b,NEW.game,CASE WHEN (SELECT COUNT(*) FROM kp_duel_loot_receipts WHERE guild=NEW.guild AND user=NEW.user_b
       AND opponent=NEW.user_a AND day=CAST((NEW.updated_at+32400000)/86400000 AS INTEGER))>=4 THEN 0 ELSE (CASE WHEN NEW.winner=NEW.user_b THEN 35 WHEN NEW.winner=NEW.user_a THEN 7 ELSE 12 END) END,
       CASE WHEN (SELECT COUNT(*) FROM kp_duel_loot_receipts WHERE guild=NEW.guild AND user=NEW.user_b
       AND opponent=NEW.user_a AND day=CAST((NEW.updated_at+32400000)/86400000 AS INTEGER))>=4 THEN 0 ELSE (CASE WHEN NEW.winner=NEW.user_b THEN 35 WHEN NEW.winner=NEW.user_a THEN 7 ELSE 12 END) END,1,
       CASE WHEN NEW.winner=NEW.user_b THEN 1 ELSE 0 END,CASE WHEN NEW.winner=NEW.user_a THEN 1 ELSE 0 END,
       CASE WHEN NEW.winner='draw' THEN 1 ELSE 0 END,NEW.updated_at)
      ON CONFLICT(guild,user,game) DO UPDATE SET
       rating=MAX(0,MIN(2500,rating+CASE WHEN (SELECT COUNT(*) FROM kp_duel_loot_receipts WHERE guild=NEW.guild AND user=NEW.user_b
       AND opponent=NEW.user_a AND day=CAST((NEW.updated_at+32400000)/86400000 AS INTEGER))>=4 THEN 0 ELSE (CASE WHEN NEW.winner=NEW.user_b THEN 35 WHEN NEW.winner=NEW.user_a THEN 7 ELSE 12 END) END)),
       peak=MAX(peak,MAX(0,MIN(2500,rating+CASE WHEN (SELECT COUNT(*) FROM kp_duel_loot_receipts WHERE guild=NEW.guild AND user=NEW.user_b
       AND opponent=NEW.user_a AND day=CAST((NEW.updated_at+32400000)/86400000 AS INTEGER))>=4 THEN 0 ELSE (CASE WHEN NEW.winner=NEW.user_b THEN 35 WHEN NEW.winner=NEW.user_a THEN 7 ELSE 12 END) END))),
       games=games+1,wins=wins+(NEW.winner=NEW.user_b),
       losses=losses+(NEW.winner=NEW.user_a),draws=draws+(NEW.winner='draw'),updated_at=NEW.updated_at;
     INSERT OR IGNORE INTO kp_duel_loot_receipts(guild,duel_id,user,game,opponent,outcome,rating,day,settled_at,reward_scale)
      SELECT NEW.guild,NEW.id,NEW.user_a,NEW.game,NEW.user_b,
       CASE WHEN NEW.winner='draw' THEN 'draw' WHEN NEW.winner=NEW.user_a THEN 'win' ELSE 'loss' END,
       p.rating,CAST((NEW.updated_at+32400000)/86400000 AS INTEGER),NEW.updated_at,
       CASE WHEN (SELECT COUNT(*) FROM kp_duel_loot_receipts WHERE guild=NEW.guild AND user=NEW.user_a
        AND day=CAST((NEW.updated_at+32400000)/86400000 AS INTEGER))>=12 THEN 0.5
       ELSE 1 END
      FROM kp_duel_skill p WHERE p.guild=NEW.guild AND p.user=NEW.user_a AND p.game=NEW.game
       AND (SELECT COUNT(*) FROM kp_board_duel_actions WHERE duel_id=NEW.id AND kind='move')>=1
       AND (SELECT COUNT(*) FROM kp_duel_loot_receipts WHERE guild=NEW.guild AND user=NEW.user_a
        AND opponent=NEW.user_b AND day=CAST((NEW.updated_at+32400000)/86400000 AS INTEGER))<4;
     INSERT OR IGNORE INTO kp_duel_loot_receipts(guild,duel_id,user,game,opponent,outcome,rating,day,settled_at,reward_scale)
      SELECT NEW.guild,NEW.id,NEW.user_b,NEW.game,NEW.user_a,
       CASE WHEN NEW.winner='draw' THEN 'draw' WHEN NEW.winner=NEW.user_b THEN 'win' ELSE 'loss' END,
       p.rating,CAST((NEW.updated_at+32400000)/86400000 AS INTEGER),NEW.updated_at,
       CASE WHEN (SELECT COUNT(*) FROM kp_duel_loot_receipts WHERE guild=NEW.guild AND user=NEW.user_b
        AND day=CAST((NEW.updated_at+32400000)/86400000 AS INTEGER))>=12 THEN 0.5
       ELSE 1 END
      FROM kp_duel_skill p WHERE p.guild=NEW.guild AND p.user=NEW.user_b AND p.game=NEW.game
       AND (SELECT COUNT(*) FROM kp_board_duel_actions WHERE duel_id=NEW.id AND kind='move')>=1
       AND (SELECT COUNT(*) FROM kp_duel_loot_receipts WHERE guild=NEW.guild AND user=NEW.user_b
        AND opponent=NEW.user_a AND day=CAST((NEW.updated_at+32400000)/86400000 AS INTEGER))<4;
    END`),
   env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_duel_reward_claim_once
    AFTER INSERT ON kp_operations
    WHEN json_extract(NEW.response,'$.result.duelLootClaim')=1
    BEGIN
     UPDATE kp_duel_loot_receipts SET claimed_at=NEW.at,
      drop_id=json_extract(NEW.response,'$.result.droppedItem')
      WHERE guild=NEW.guild AND user=NEW.user
       AND duel_id=json_extract(NEW.response,'$.result.duel') AND claimed_at IS NULL;
     SELECT CASE WHEN changes()=1 THEN 1 ELSE RAISE(ABORT,'duel loot already claimed') END;
    END`)
  ]);
 })();
 ready.set(env.DB,task);try{await task;}catch(e){ready.delete(env.DB);throw e;}
}
export async function pendingDuelLoot(env:KpEnv,guild:string,user:string,duel:string):Promise<DuelLootReceipt>{
 await ensureDuelLoot(env);
 const row=await env.DB.prepare(`SELECT duel_id,guild,user,game,opponent,outcome,rating,day,settled_at,claimed_at,reward_scale
 FROM kp_duel_loot_receipts WHERE guild=? AND user=? AND duel_id=?`)
 .bind(guild,user,duel).first<DuelLootReceipt>();
 if(!row)throw Error('この対局には受取可能な決闘報酬がありません。');
 if(row.claimed_at!==null)throw Error('この対局の報酬は受取済みです。');
 return row;
}
