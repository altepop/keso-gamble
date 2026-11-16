-- One compact competitive match/roster snapshot per completed match.
-- Never store entire API payloads or combat events: minimize D1 growth.
CREATE TABLE IF NOT EXISTS valorant_match_snapshots (
 match_id TEXT PRIMARY KEY,
 started_at INTEGER NOT NULL,
 ended_at INTEGER NOT NULL,
 queue TEXT NOT NULL,
 map TEXT,
 act_id TEXT,
 roster_json TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS valorant_snapshots_ended ON valorant_match_snapshots(ended_at DESC);
