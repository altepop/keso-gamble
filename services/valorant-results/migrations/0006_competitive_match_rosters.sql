-- Captured from already-fetched match API responses. Never used for KP settlement
-- or Discord notifications. A single row per unique competitive match avoids
-- ten per-player writes and preserves membership/party data for later analysis.
CREATE TABLE valorant_match_rosters (
  match_id TEXT PRIMARY KEY,
  ended_at INTEGER NOT NULL,
  map TEXT,
  act_name TEXT,
  teams_json TEXT NOT NULL,
  players_json TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);
CREATE INDEX valorant_match_rosters_recent ON valorant_match_rosters(ended_at DESC);
