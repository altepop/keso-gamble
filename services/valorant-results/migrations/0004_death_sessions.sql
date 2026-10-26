CREATE TABLE death_unrated_sessions (
  riot_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  armed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  match_id TEXT,
  cancelled_at INTEGER,
  PRIMARY KEY (riot_id,session_id)
);
CREATE UNIQUE INDEX death_unrated_waiting ON death_unrated_sessions(riot_id)
  WHERE match_id IS NULL AND cancelled_at IS NULL;
CREATE UNIQUE INDEX death_unrated_match ON death_unrated_sessions(riot_id,match_id)
  WHERE match_id IS NOT NULL;
CREATE TABLE discord_command_receipts (
  interaction_id TEXT PRIMARY KEY,
  response TEXT,
  expires_at INTEGER NOT NULL
);