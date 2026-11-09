// Presentation totals only. The immutable ledger remains the source of truth;
// these values never authorize spending, grants or reward caps.
export const RELIC_ECONOMY_KEY='relic_economy_v1';
export const RELIC_ECONOMY_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS kp_relic_totals(guild TEXT NOT NULL,user TEXT NOT NULL,n INTEGER NOT NULL CHECK(n>=0),total INTEGER NOT NULL,PRIMARY KEY(guild,user))`,
 `DELETE FROM kp_relic_totals WHERE NOT EXISTS(SELECT 1 FROM kp_settings WHERE key='${RELIC_ECONOMY_KEY}')`,
 `INSERT OR REPLACE INTO kp_relic_totals(guild,user,n,total)
  SELECT guild,user,COUNT(*),SUM(delta) FROM kp_ledger
  WHERE kind='relic' AND NOT EXISTS(SELECT 1 FROM kp_settings WHERE key='${RELIC_ECONOMY_KEY}') GROUP BY guild,user`,
 `INSERT OR IGNORE INTO kp_settings(key,value) VALUES('${RELIC_ECONOMY_KEY}','1')`,
 `CREATE TRIGGER IF NOT EXISTS kp_relic_totals_insert AFTER INSERT ON kp_ledger WHEN NEW.kind='relic' BEGIN
  INSERT INTO kp_relic_totals(guild,user,n,total) VALUES(NEW.guild,NEW.user,1,NEW.delta)
  ON CONFLICT(guild,user) DO UPDATE SET n=n+1,total=total+NEW.delta; END`,
 `CREATE TRIGGER IF NOT EXISTS kp_relic_totals_delete AFTER DELETE ON kp_ledger WHEN OLD.kind='relic' BEGIN
  UPDATE kp_relic_totals SET n=n-1,total=total-OLD.delta WHERE guild=OLD.guild AND user=OLD.user; END`,
 `CREATE TRIGGER IF NOT EXISTS kp_relic_totals_update AFTER UPDATE ON kp_ledger WHEN OLD.kind='relic' OR NEW.kind='relic' BEGIN
  UPDATE kp_relic_totals SET n=n-1,total=total-OLD.delta WHERE OLD.kind='relic' AND guild=OLD.guild AND user=OLD.user;
  INSERT INTO kp_relic_totals(guild,user,n,total) SELECT NEW.guild,NEW.user,1,NEW.delta WHERE NEW.kind='relic'
  ON CONFLICT(guild,user) DO UPDATE SET n=n+1,total=total+NEW.delta; END`,
];
const ready=new WeakMap<object,Promise<void>>();
export async function ensureRelicEconomy(db:D1Database):Promise<void>{
 const previous=ready.get(db);if(previous)return previous;
 const job=(async()=>{
  // An explicit point lookup avoids executing even a guarded GROUP BY on each
  // isolate restart. Keep the inner guard for concurrent first-install batches.
  const done=await db.prepare('SELECT value FROM kp_settings WHERE key=?').bind(RELIC_ECONOMY_KEY).first<{value:string}>();
  if(done?.value==='1')return;
  if(done)throw Error('Unsupported relic economy version');
  await db.batch(RELIC_ECONOMY_SCHEMA.map(sql=>db.prepare(sql)));
 })();
 ready.set(db,job);
 try{await job;}catch(error){if(ready.get(db)===job)ready.delete(db);throw error;}
}
export const PERSONAL_RELIC_STATS_SQL='SELECT n,total FROM kp_relic_totals WHERE guild=? AND user=?';
export async function personalVerifiedRelicStats(db:D1Database,guild:string,user:string){
 await ensureRelicEconomy(db);
 return db.prepare(PERSONAL_RELIC_STATS_SQL).bind(guild,user).first<{n:number;total:number}>();
}
