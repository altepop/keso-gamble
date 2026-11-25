CREATE TABLE IF NOT EXISTS coach_position_backfill (
 match_id TEXT PRIMARY KEY,
 status TEXT NOT NULL CHECK(status IN ('running','retry','saved','unavailable')),
 attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 3),
 next_at INTEGER NOT NULL,
 reason TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
