// Indexed notification scans are used by the five-minute monitor and racing crowns.
// Creating an index is additive: never rewrite existing KP or notification rows.
const ready=new WeakMap<object,Promise<void>>();
export async function ensureNotificationReadIndexes(db:D1Database):Promise<void>{
 const existing=ready.get(db);
 if(existing)return existing;
 const job=(async()=>{
  await db.batch([
   db.prepare('CREATE INDEX IF NOT EXISTS notifications_pending_match ON notifications(ended_at,match_id) WHERE sent=0'),
   db.prepare("CREATE INDEX IF NOT EXISTS notifications_crown_history ON notifications(riot_id,ended_at DESC,match_id DESC,outcome) WHERE outcome IN ('win','loss')")
  ]);
 })();
 ready.set(db,job);
 try{await job;}catch(e){ready.delete(db);throw e;}
}
