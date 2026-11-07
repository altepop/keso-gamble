// Pending regular notices are a tiny partial-index subset. Ineligible Death-mode
// notices are intentionally kept unsent and never scanned on every Cron tick.
export interface PendingNotificationMatch {match_id:string;ended_at:number}
export const REGULAR_PENDING_SQL=`SELECT match_id,MIN(ended_at) AS ended_at FROM notifications
 WHERE sent=0 AND (mode IS NULL OR (mode!='unrated' AND substr(mode,1,6)!='death_'))
 GROUP BY match_id ORDER BY ended_at,match_id LIMIT ?`;
export const CLAIMED_DEATH_PENDING_SQL=`SELECT n.match_id,MIN(n.ended_at) AS ended_at
 FROM death_unrated_sessions s CROSS JOIN notifications n
 WHERE s.cancelled_at IS NULL AND n.riot_id=s.riot_id AND n.match_id=s.match_id
 AND n.sent=0 AND (n.mode='unrated' OR substr(n.mode,1,6)='death_')
 GROUP BY n.match_id ORDER BY ended_at,n.match_id LIMIT ?`;
export async function pendingNotificationMatches(db:D1Database,limit=10):Promise<PendingNotificationMatch[]>{
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Invalid pending limit');
 const normal=(await db.prepare(REGULAR_PENDING_SQL).bind(limit).all<PendingNotificationMatch>()).results;
 const death=(await db.prepare(CLAIMED_DEATH_PENDING_SQL).bind(limit).all<PendingNotificationMatch>()).results;
 const unique=new Map<string,PendingNotificationMatch>();
 for(const row of [...normal,...death]){const old=unique.get(row.match_id);if(!old||old.ended_at>row.ended_at)unique.set(row.match_id,row);}
 return [...unique.values()].sort((x,y)=>x.ended_at-y.ended_at||(x.match_id<y.match_id?-1:x.match_id>y.match_id?1:0)).slice(0,limit);
}
