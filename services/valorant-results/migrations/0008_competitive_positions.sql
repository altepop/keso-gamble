-- Separate, private per-match evidence. Ordinary coaching queries never join it.
CREATE TABLE IF NOT EXISTS valorant_match_positions (
 match_id TEXT PRIMARY KEY,
 positions_json TEXT NOT NULL CHECK(json_valid(positions_json)),
 recorded_at INTEGER NOT NULL,
 has_coordinates INTEGER NOT NULL CHECK(has_coordinates IN (0,1))
);
