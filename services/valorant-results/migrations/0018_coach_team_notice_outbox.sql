-- Phase 3-E2: additive, dormant outbox. No bootstrap rows and no automatic delivery.
CREATE TABLE IF NOT EXISTS coach_team_notice_outbox(
 guild TEXT NOT NULL,team_id TEXT NOT NULL,event_key TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('task','status')),
 revision INTEGER NOT NULL CHECK(revision>=1),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','claimed','delivered','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=5),
 next_attempt_at INTEGER NOT NULL CHECK(next_attempt_at>=0),
 claimed_until INTEGER NOT NULL DEFAULT 0 CHECK(claimed_until>=0),
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 PRIMARY KEY(guild,team_id,event_key),
 CHECK(team_id='coach-roster-v1'),
 CHECK(event_key=team_id || ':' || event_type || ':' || revision)
);
CREATE INDEX IF NOT EXISTS coach_team_notice_outbox_due
 ON coach_team_notice_outbox(state,next_attempt_at);
-- No names, Discord IDs, match IDs, notes or practice logs in queued records.
