// D1 2026-11-07: every one-minute monitor scanned the entire Discord receipt
// and Death-mode reservation tables to delete old data even on quiet minutes.
// No user rewards, bets or inbox deliveries run through this optional cleanup.
// Retain automatic repair every 15 minutes and immediate roster-change cleanup.
export const MONITOR_CLEANUP_INTERVAL_MS=15*60_000;
interface State {roster:string;rosterAt:number;receiptAt:number}
const states=new WeakMap<object,State>();

export async function cleanupMonitorData(db:D1Database,playerIds:string[],now=Date.now()):Promise<void>{
 const ids=[...playerIds].sort();
 const roster=JSON.stringify(ids);
 const prev=states.get(db);
 const due=!prev||prev.roster!==roster||now<prev.rosterAt||now-prev.rosterAt>=MONITOR_CLEANUP_INTERVAL_MS;
 let state=prev;
 if(due){
  const placeholders=ids.map(()=>'?').join(',');
  await db.prepare(`DELETE FROM tracked_players${ids.length?` WHERE riot_id NOT IN (${placeholders})`:''}`).bind(...ids).run();
  await db.prepare(`DELETE FROM death_unrated_sessions${ids.length?` WHERE riot_id NOT IN (${placeholders})`:''}`).bind(...ids).run();
  state={roster,rosterAt:now,receiptAt:prev?.receiptAt??Number.NEGATIVE_INFINITY};
  states.set(db,state);
 }
 if(!state||now<state.receiptAt||now-state.receiptAt>=MONITOR_CLEANUP_INTERVAL_MS){
  // Interaction IDs are immutable; a receipt may remain up to 15 min after its
  // 24h expiry, but retry/deduplication correctness is unchanged.
  await db.prepare('DELETE FROM discord_command_receipts WHERE expires_at<?').bind(now).run();
  if(state)state.receiptAt=now;
  else states.set(db,{roster,rosterAt:now,receiptAt:now});
 }
}
