// Indexed projection of KP wallet bets, maintained atomically with kp_state writes.
// ML keeps settled history for match notices; racing stores only unsettled tickets.
// No new cron, no per-request full-wallet LIKE scans.
import type {KpEnv} from './kp.ts';
const ready=new WeakMap<object,Promise<void>>();
const schema=[
 "CREATE TABLE IF NOT EXISTS kp_bet_index(guild TEXT NOT NULL,user TEXT NOT NULL,kind TEXT NOT NULL,slot INTEGER NOT NULL,match TEXT NOT NULL,status TEXT NOT NULL,PRIMARY KEY(guild,user,kind,slot))",
 "CREATE INDEX IF NOT EXISTS kp_bet_index_by_status ON kp_bet_index(guild,kind,status,match,user)",
 "CREATE INDEX IF NOT EXISTS kp_bet_index_by_match ON kp_bet_index(guild,kind,match,user)",
 "CREATE INDEX IF NOT EXISTS kp_bet_index_ml_pending ON kp_bet_index(kind,status,match)",
 "CREATE TRIGGER IF NOT EXISTS kp_bet_index_insert AFTER INSERT ON kp_state BEGIN INSERT INTO kp_bet_index(guild,user,kind,slot,match,status) SELECT NEW.guild,NEW.user,'ml',CAST(j.key AS INTEGER),COALESCE(CAST(json_extract(j.value,'$.match') AS TEXT),''),COALESCE(CAST(json_extract(j.value,'$.status') AS TEXT),'') FROM json_each(NEW.data,'$.mlBets') j WHERE j.type='object'; INSERT INTO kp_bet_index(guild,user,kind,slot,match,status) SELECT NEW.guild,NEW.user,'race',CAST(j.key AS INTEGER),COALESCE(CAST(json_extract(j.value,'$.raceId') AS TEXT),''),'pending' FROM json_each(NEW.data,'$.raceBets') j WHERE j.type='object' AND json_extract(j.value,'$.status')='pending'; END",
 "CREATE TRIGGER IF NOT EXISTS kp_bet_index_update AFTER UPDATE OF data ON kp_state WHEN json_extract(OLD.data,'$.mlBets') IS NOT json_extract(NEW.data,'$.mlBets') OR json_extract(OLD.data,'$.raceBets') IS NOT json_extract(NEW.data,'$.raceBets') BEGIN DELETE FROM kp_bet_index WHERE guild=NEW.guild AND user=NEW.user; INSERT INTO kp_bet_index(guild,user,kind,slot,match,status) SELECT NEW.guild,NEW.user,'ml',CAST(j.key AS INTEGER),COALESCE(CAST(json_extract(j.value,'$.match') AS TEXT),''),COALESCE(CAST(json_extract(j.value,'$.status') AS TEXT),'') FROM json_each(NEW.data,'$.mlBets') j WHERE j.type='object'; INSERT INTO kp_bet_index(guild,user,kind,slot,match,status) SELECT NEW.guild,NEW.user,'race',CAST(j.key AS INTEGER),COALESCE(CAST(json_extract(j.value,'$.raceId') AS TEXT),''),'pending' FROM json_each(NEW.data,'$.raceBets') j WHERE j.type='object' AND json_extract(j.value,'$.status')='pending'; END",
 "CREATE TRIGGER IF NOT EXISTS kp_bet_index_delete AFTER DELETE ON kp_state BEGIN DELETE FROM kp_bet_index WHERE guild=OLD.guild AND user=OLD.user; END"
];
const backfill=[
 `INSERT OR REPLACE INTO kp_bet_index(guild,user,kind,slot,match,status)
 SELECT s.guild,s.user,'ml',CAST(j.key AS INTEGER),COALESCE(CAST(json_extract(j.value,'$.match') AS TEXT),''),COALESCE(CAST(json_extract(j.value,'$.status') AS TEXT),'')
 FROM kp_state s,json_each(s.data,'$.mlBets') j WHERE j.type='object'`,
 `INSERT OR REPLACE INTO kp_bet_index(guild,user,kind,slot,match,status)
 SELECT s.guild,s.user,'race',CAST(j.key AS INTEGER),COALESCE(CAST(json_extract(j.value,'$.raceId') AS TEXT),''),'pending'
 FROM kp_state s,json_each(s.data,'$.raceBets') j WHERE j.type='object' AND json_extract(j.value,'$.status')='pending'`,
 "INSERT INTO kp_settings(key,value) VALUES('bet_index_backfilled_v1','1') ON CONFLICT(key) DO UPDATE SET value='1'",
];
export async function ensureBetIndex(env:KpEnv):Promise<void>{
 const prior=ready.get(env.DB);if(prior)return prior;
 const task=(async()=>{
  await env.DB.batch(schema.map(s=>env.DB.prepare(s)));
  const done=await env.DB.prepare("SELECT value FROM kp_settings WHERE key='bet_index_backfilled_v1'").first<{value:string}>();
  if(done?.value==='1')return;
  // One transactional migration of historical wallets. Each user write afterward updates the index in the same transaction.
  await env.DB.batch(backfill.map(s=>env.DB.prepare(s)));
 })();
 ready.set(env.DB,task);
 try{await task;}catch(e){ready.delete(env.DB);throw e;}
}
