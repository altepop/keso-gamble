import type {KpEnv} from './kp.ts';
// @ts-expect-error Shared pure browser module.
import {JACKPOT_SEED,JACKPOT_CAP} from '../../../js/casino-more.js';
// The slot's shared jackpot, one pool per guild. Every spin adds its contribution and a 💎💎💎 takes its share, in the
// same statement that records the spin: a win only applies to the pool version it was drawn on, so two winners can
// never both take the same pool (the later one is refused and tries again on the new pool).
const ready=new WeakSet<object>();
export async function ensureJackpot(env:KpEnv){
 if(ready.has(env.DB))return;
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS casino_jackpots(guild TEXT PRIMARY KEY,amount INTEGER NOT NULL CHECK(amount>=0),version INTEGER NOT NULL DEFAULT 0,last_winner TEXT,last_won INTEGER,last_at INTEGER)'),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS casino_jackpot_apply AFTER INSERT ON kp_operations WHEN json_extract(NEW.response,'$.result.done.game')='slot' AND json_type(NEW.response,'$.result.done.pool') IS NOT NULL BEGIN
   UPDATE casino_jackpots SET amount=MIN(${JACKPOT_CAP},MAX(${JACKPOT_SEED},amount-json_extract(NEW.response,'$.result.done.jackpot'))+json_extract(NEW.response,'$.result.done.pool.contribution')),version=version+1,
    last_winner=CASE WHEN json_extract(NEW.response,'$.result.done.jackpot')>0 THEN NEW.user ELSE last_winner END,last_won=CASE WHEN json_extract(NEW.response,'$.result.done.jackpot')>0 THEN json_extract(NEW.response,'$.result.done.jackpot') ELSE last_won END,last_at=CASE WHEN json_extract(NEW.response,'$.result.done.jackpot')>0 THEN NEW.at ELSE last_at END
    WHERE guild=NEW.guild AND (json_extract(NEW.response,'$.result.done.jackpot')=0 OR version=json_extract(NEW.response,'$.result.done.pool.version'));
   SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'Jackpot changed') END;
  END`),
 ]);
 ready.add(env.DB);
}
export async function jackpotOf(env:KpEnv,guild:string){
 await ensureJackpot(env);
 await env.DB.prepare('INSERT OR IGNORE INTO casino_jackpots(guild,amount) VALUES(?,?)').bind(guild,JACKPOT_SEED).run();
 const row=await env.DB.prepare('SELECT amount,version,last_won AS lastWon,last_at AS lastAt FROM casino_jackpots WHERE guild=?').bind(guild).first<{amount:number;version:number;lastWon:number|null;lastAt:number|null}>();
 return {amount:Number(row?.amount??JACKPOT_SEED),version:Number(row?.version??0),lastWon:row?.lastWon??null,lastAt:row?.lastAt??null};
}
