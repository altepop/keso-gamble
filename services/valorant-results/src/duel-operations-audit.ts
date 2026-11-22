/** Phase 12: bounded, strictly read-only duel operations audit.
 * This module never deletes rows, alters live matches, changes KP or grants rewards.
 * Only aggregate counts leave D1; do not expose this directly to browser clients.
 */
import type {KpEnv} from './kp.ts';
export const DUEL_RETENTION_REVIEW_DAYS=90;
export type DuelAuditCounts={staleFinishedPve:number;staleFinishedPvp:number;activePve:number;activePvp:number};
export type DuelOperationsAudit={asOf:number;retentionReviewDays:number;counts:DuelAuditCounts;reviewRecommended:boolean;deletionAuthorized:false};
const snowflake=/^\d{15,22}$/;
export async function duelOperationsAudit(env:Pick<KpEnv,'DB'>,guild:string,now=Date.now()):Promise<DuelOperationsAudit>{
 if(!snowflake.test(guild)||!Number.isSafeInteger(now)||now<0)
  throw Error('Invalid duel operations audit input');
 const threshold=now-DUEL_RETENTION_REVIEW_DAYS*86_400_000;
 // Always bounded to the approved guild; no full row or private-hand output.
 const [pve,pvp]=await Promise.all([
  env.DB.prepare(`SELECT
    COALESCE(SUM(CASE WHEN turn='finished' AND updated_at<? THEN 1 ELSE 0 END),0) AS stale,
    COALESCE(SUM(CASE WHEN turn='human' THEN 1 ELSE 0 END),0) AS active
    FROM kp_duel_pve_sessions WHERE guild=?`).bind(threshold,guild).first<{stale:number;active:number}>(),
  env.DB.prepare(`SELECT
    COALESCE(SUM(CASE WHEN status IN ('finished','cancelled') AND updated_at<? THEN 1 ELSE 0 END),0) AS stale,
    COALESCE(SUM(CASE WHEN status IN ('active','pending') THEN 1 ELSE 0 END),0) AS active
    FROM kp_board_duels WHERE guild=?`).bind(threshold,guild).first<{stale:number;active:number}>()
 ]);
 const count=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0?n:null;
 const a=count(pve?.stale),b=count(pvp?.stale),c=count(pve?.active),d=count(pvp?.active);
 if([a,b,c,d].some(x=>x===null))throw Error('Invalid duel audit result');
 const counts={staleFinishedPve:a!,staleFinishedPvp:b!,activePve:c!,activePvp:d!};
 return {asOf:now,retentionReviewDays:DUEL_RETENTION_REVIEW_DAYS,counts,
  reviewRecommended:counts.staleFinishedPve+counts.staleFinishedPvp>0,
  deletionAuthorized:false};
}
