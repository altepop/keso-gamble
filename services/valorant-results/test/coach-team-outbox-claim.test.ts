import test from 'node:test';
import assert from 'node:assert/strict';
import {COACH_OUTBOX_CLAIM_SQL,COACH_OUTBOX_RELEASE_SQL,coachClaimLeaseUntil} from '../src/coach-team-outbox-claim.ts';
test('atomic claim has due, attempt and lease predicates in one UPDATE RETURNING',()=>{
 assert.match(COACH_OUTBOX_CLAIM_SQL,/UPDATE coach_team_notice_outbox/);
 assert.match(COACH_OUTBOX_CLAIM_SQL,/attempts=attempts\+1/);
 assert.match(COACH_OUTBOX_CLAIM_SQL,/attempts<5 AND next_attempt_at<=\?/);
 assert.match(COACH_OUTBOX_CLAIM_SQL,/claimed_until<=\?/);
 assert.match(COACH_OUTBOX_CLAIM_SQL,/RETURNING event_key,attempts,claimed_until/);
 assert.doesNotMatch(COACH_OUTBOX_CLAIM_SQL,/owner_user|subject_id|channel_id|match_id/);
});
test('retry release requires same attempt and lease (stale worker cannot release)',()=>{
 assert.match(COACH_OUTBOX_RELEASE_SQL,/state='claimed' AND attempts=\? AND claimed_until=\?/);
 assert.match(COACH_OUTBOX_RELEASE_SQL,/attempts>=5 THEN 'cancelled'/);
 assert.equal(coachClaimLeaseUntil(0),60_000);
 assert.equal(coachClaimLeaseUntil(-1),null);
 assert.equal(coachClaimLeaseUntil(Number.MAX_SAFE_INTEGER),null);
});
