// E2: atomic, parameterized claim/release statements only. Not connected to production.
export const COACH_OUTBOX_LEASE_MS=60_000;
export const COACH_OUTBOX_MAX_ATTEMPTS=5;
export const COACH_OUTBOX_CLAIM_SQL=`
UPDATE coach_team_notice_outbox
SET state='claimed',attempts=attempts+1,claimed_until=?,updated_at=?
WHERE guild=? AND team_id='coach-roster-v1' AND event_key=?
 AND attempts<5 AND next_attempt_at<=?
 AND (state='pending' OR (state='claimed' AND claimed_until>0 AND claimed_until<=?))
RETURNING event_key,attempts,claimed_until
`;
export const COACH_OUTBOX_RELEASE_SQL=`
UPDATE coach_team_notice_outbox
SET state=CASE WHEN attempts>=5 THEN 'cancelled' ELSE 'pending' END,
 next_attempt_at=?,claimed_until=0,updated_at=?
WHERE guild=? AND team_id='coach-roster-v1' AND event_key=?
 AND state='claimed' AND attempts=? AND claimed_until=?
RETURNING event_key,state
`;
export function coachClaimLeaseUntil(now:number):number|null{
 if(!Number.isSafeInteger(now)||now<0)return null;
 const until=now+COACH_OUTBOX_LEASE_MS;
 return Number.isSafeInteger(until)?until:null;
}
