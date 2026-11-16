-- Separate compact round and kill-event archive. NULL means the API did not supply
-- verifiable data. One row per competitive match; no changes to KP/notifications.
CREATE TABLE valorant_match_round_events (
  match_id TEXT PRIMARY KEY,
  rounds_json TEXT,
  kills_json TEXT,
  recorded_at INTEGER NOT NULL,
  CHECK(rounds_json IS NOT NULL OR kills_json IS NOT NULL)
);
