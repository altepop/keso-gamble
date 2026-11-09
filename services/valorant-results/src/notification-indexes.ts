// Indexed notification scans are used by the five-minute monitor and racing crowns.
// Creating an index is additive: never rewrite existing KP or notification rows.
const ready=new WeakMap<object,Promise<void>>();
export async function ensureNotificationReadIndexes(db:D1Database):Promise<void>{
 const existing=ready.get(db);
 if(existing)return existing;
 const job=(async()=>{
  await db.batch([
   db.prepare('CREATE INDEX IF NOT EXISTS notifications_pending_match ON notifications(ended_at,match_id) WHERE sent=0'),
   db.prepare("CREATE INDEX IF NOT EXISTS notifications_pending_regular ON notifications(ended_at,match_id) WHERE sent=0 AND (mode IS NULL OR (mode!='unrated' AND substr(mode,1,6)!='death_'))"),
   db.prepare('CREATE INDEX IF NOT EXISTS death_sessions_active_notice ON death_unrated_sessions(riot_id,match_id) WHERE cancelled_at IS NULL'),
   db.prepare("CREATE INDEX IF NOT EXISTS notifications_crown_history ON notifications(riot_id,ended_at DESC,match_id DESC,outcome) WHERE outcome IN ('win','loss')"),
   // A match's participants are read together for a single Discord post; the
   // existing primary key (riot_id,match_id) cannot seek by match alone.
   db.prepare('CREATE INDEX IF NOT EXISTS notifications_match_members ON notifications(match_id,riot_id)'),
   // Per-minute monitor reads 200 most recent match IDs. A covering recent index
   // avoids sorting/scanning the entire growing notification history every minute.
   db.prepare('CREATE INDEX IF NOT EXISTS notifications_recent_saved ON notifications(ended_at DESC,riot_id,match_id)')
  ]);
 })();
 ready.set(db,job);
 try{await job;}catch(e){ready.delete(db);throw e;}
}
