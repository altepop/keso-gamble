/** Steam achievement credit and Steam-exclusive relic eligibility share ONE daily quota.
 * The quota is calculated by Steam's existing UTC day (reset 09:00 JST).
 * Never use the client's time, UI state, percent or unverified claims. */
export const STEAM_RELIC_DAILY_CAP=5000;
export const steamRelicDay=(now=Date.now())=>new Date(now).toISOString().slice(0,10);
export type SteamRelicEvidence={
 id:string;app:number;achievement:string;title:string;percent:number;
 amount:number;earnedToday:number;
};
export const STEAM_RELIC_PROOF_SQL=`SELECT e.id,e.app,e.achievement,e.title,e.percent,e.amount,
 COALESCE(d.amount,0) AS earnedToday
 FROM kp_steam_events e LEFT JOIN kp_steam_daily d
 ON d.guild=e.guild AND d.user=e.user AND d.day=?
 WHERE e.id=? AND e.guild=? AND e.user=?`;
export const STEAM_RELIC_LIST_SQL=`SELECT e.id,e.title,e.percent,e.app,e.amount,
 COALESCE(d.amount,0) AS earnedToday
 FROM kp_steam_events e LEFT JOIN kp_steam_daily d
 ON d.guild=e.guild AND d.user=e.user AND d.day=?
 WHERE e.guild=? AND e.user=?
 ORDER BY CASE WHEN e.percent<=10 THEN 0 WHEN e.percent<=25 THEN 1 ELSE 2 END,e.at DESC LIMIT 100`;

/** Returns an existing, credited immutable receipt, or a clear server error. */
export function requireSteamRelicEligibility(proof:SteamRelicEvidence|null):SteamRelicEvidence{
 if(!proof)throw Error('監視開始後のSteam実績を確認できません。過去の実績は対象外です。');
 if(!Number.isSafeInteger(proof.amount)||proof.amount<=0)
  throw Error('この実績はSteamの当日5,000KP上限によって0KPになったため、限定遺物の対象外です。翌日も獲得できません。');
 if(!Number.isSafeInteger(proof.earnedToday)||proof.earnedToday>=STEAM_RELIC_DAILY_CAP)
  throw Error('本日のSteam報酬が5,000KPに達しています。限定遺物の受け取りは翌日9時以降に再開します。');
 return proof;
}
/** Commit-time check closes the race with an external Steam credit arriving
 * between the first proof query and the idempotent KP operation insertion.
 * The CASE is short-circuited for all non-Steam actions. This SQL must be
 * included in the wallet-operation INSERT ... SELECT WHERE expression. */
export const STEAM_RELIC_COMMIT_GUARD=` AND (?=0 OR (
 EXISTS(SELECT 1 FROM kp_steam_events e WHERE e.id=? AND e.guild=? AND e.user=? AND e.amount>0)
 AND NOT EXISTS(SELECT 1 FROM kp_steam_daily d WHERE d.guild=? AND d.user=? AND d.day=? AND d.amount>=5000)
))`;
