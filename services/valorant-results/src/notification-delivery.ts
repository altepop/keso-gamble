// Only the notification rows actually included in a successful Discord post may
// be marked as delivered. A match can contain unclaimed Death-mode participants
// whose notices were deliberately excluded by the eligibility filter.
//
// Guard both empty lists and nullish IDs: accidentally marking by match alone
// would permanently suppress participants who become eligible later.
export async function markDeliveredNotices(
 db:D1Database,matchId:string,notices:ReadonlyArray<{riot_id:string}>
):Promise<number>{
 if(typeof matchId!=='string'||!matchId||!Array.isArray(notices))throw Error('Invalid delivered notification set');
 const ids=[...new Set(notices.map(n=>n.riot_id))];
 if(!ids.length||ids.some(id=>typeof id!=='string'||!id))throw Error('Empty or invalid delivered notification set');
 const placeholders=ids.map(()=>'?').join(',');
 const r=await db.prepare(`UPDATE notifications SET sent=1 WHERE match_id=? AND sent=0 AND riot_id IN (${placeholders})`)
  .bind(matchId,...ids).run();
 return Number(r.meta.changes??0);
}
