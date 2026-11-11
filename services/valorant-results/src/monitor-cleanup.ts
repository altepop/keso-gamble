// Durable, low-read housekeeping gate. A Cloudflare Worker isolate may be
// recycled after each cron run; a WeakMap alone does not stop the same DELETEs
// from scanning the historical tables once per minute in the next isolate.
// This marker lives in the existing monitor_state PK table (no migration).
// Never gate rewards, pending Discord posts, bets, KP or death-mode validation.
export const MONITOR_CLEANUP_INTERVAL_MS=15*60_000;
export const MONITOR_CLEANUP_KEY='monitor_cleanup_v2';

interface State {roster:string;rosterAt:number;receiptAt:number}
function validState(value:string|undefined):State|null{
 if(!value)return null;
 try{
  const state=JSON.parse(value) as Partial<State>;
  if(typeof state.roster!=='string'||
    !Number.isSafeInteger(state.rosterAt)||state.rosterAt!<0||
    !Number.isSafeInteger(state.receiptAt)||state.receiptAt!<0)return null;
  return state as State;
 }catch{return null;}
}
function due(previous:number,now:number){
 return now<previous||now-previous>=MONITOR_CLEANUP_INTERVAL_MS;
}

export async function cleanupMonitorData(db:D1Database,playerIds:string[],now=Date.now()):Promise<void>{
 if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid monitor cleanup time');
 const ids=[...new Set(playerIds)].sort();
 const roster=JSON.stringify(ids);
 // One indexed row on every minute cron is cheaper than two DELETE statements
 // scanning the tracked roster + old Death reservations on every new isolate.
 const saved=await db.prepare('SELECT value FROM monitor_state WHERE key=?')
  .bind(MONITOR_CLEANUP_KEY).first<{value:string}>();
 const prev=validState(saved?.value);
 const rosterDue=!prev||prev.roster!==roster||due(prev.rosterAt,now);
 const receiptDue=!prev||due(prev.receiptAt,now);
 if(!rosterDue&&!receiptDue)return;

 // Do not record successful cleanup until all requested DELETEs have worked.
 // A transient D1 failure must be retried by the very next cron invocation.
 if(rosterDue){
  const placeholders=ids.map(()=>'?').join(',');
  await db.prepare(`DELETE FROM tracked_players${ids.length?` WHERE riot_id NOT IN (${placeholders})`:''}`).bind(...ids).run();
  await db.prepare(`DELETE FROM death_unrated_sessions${ids.length?` WHERE riot_id NOT IN (${placeholders})`:''}`).bind(...ids).run();
 }
 if(receiptDue){
  // Immutable interaction IDs: an expired receipt may remain <=15min beyond
  // its expiry without changing the replay protection of live receipts.
  await db.prepare('DELETE FROM discord_command_receipts WHERE expires_at<?').bind(now).run();
 }
 const state:State={
  roster,rosterAt:rosterDue?now:prev!.rosterAt,
  receiptAt:receiptDue?now:prev!.receiptAt
 };
 await db.prepare('INSERT INTO monitor_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  .bind(MONITOR_CLEANUP_KEY,JSON.stringify(state)).run();
}
