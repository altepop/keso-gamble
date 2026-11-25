// Phase 3-E2 dormant due-item reader. Never claims leases or sends Discord messages.
import {canClaimCoachOutbox,type CoachOutboxLease} from './coach-team-outbox-retry.ts';
import {coachNoticeDedupKey,type CoachNoticeKind} from './coach-team-notice-policy.ts';
export type CoachDueOutboxCandidate={eventKey:string;event:CoachNoticeKind;attempts:number};
type DbRow={event_key:string;event_type:string;revision:number;state:string;
 attempts:number;next_attempt_at:number;claimed_until:number};
export async function readDueCoachOutboxCandidates(
 db:D1Database,guild:string,now:number
):Promise<CoachDueOutboxCandidate[]|null>{
 if(!/^\d{15,22}$/.test(guild)||!Number.isSafeInteger(now)||now<0)return null;
 // Bound the scan. A full batch fails closed; nobody can infer that it was complete.
 const rows=(await db.prepare(`SELECT event_key,event_type,revision,state,attempts,
 next_attempt_at,claimed_until FROM coach_team_notice_outbox
 WHERE guild=? AND team_id='coach-roster-v1'
 AND attempts<5 AND next_attempt_at<=?
 AND (state='pending' OR (state='claimed' AND claimed_until>0 AND claimed_until<=?))
 ORDER BY next_attempt_at,event_key LIMIT 6`).bind(guild,now,now).all<DbRow>()).results;
 if(!Array.isArray(rows)||rows.length>5)return null;
 const keys=new Set<string>();const candidates:CoachDueOutboxCandidate[]=[];
 for(const r of rows){
  if(!r||typeof r.event_key!=='string'||keys.has(r.event_key)||
   (r.event_type!=='task'&&r.event_type!=='status')||
   coachNoticeDedupKey('coach-roster-v1',r.event_type,r.revision)!==r.event_key)return null;
  const lease:CoachOutboxLease={
   state:r.state as CoachOutboxLease['state'],attempts:r.attempts,
   nextAttemptAt:r.next_attempt_at,claimedUntil:r.claimed_until
  };
  if(!canClaimCoachOutbox(lease,now))return null;
  keys.add(r.event_key);
  candidates.push({eventKey:r.event_key,event:r.event_type,attempts:r.attempts});
 }
 return candidates;
}
