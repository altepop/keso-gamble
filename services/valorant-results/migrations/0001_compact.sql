PRAGMA foreign_keys = ON;
CREATE TABLE tracked_players (
  riot_id TEXT PRIMARY KEY,
  puuid TEXT NOT NULL,
  region TEXT NOT NULL,
  since INTEGER NOT NULL
);
CREATE TABLE notifications (
  riot_id TEXT NOT NULL REFERENCES tracked_players(riot_id) ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  message TEXT NOT NULL,
  ended_at INTEGER NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(riot_id,match_id)
);
CREATE TABLE monitor_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
