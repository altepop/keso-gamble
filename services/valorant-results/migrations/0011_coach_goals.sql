-- Private, person-scoped goals. No wallet, collection, or analytics changes.
CREATE TABLE IF NOT EXISTS coach_goals (
 guild TEXT NOT NULL, subject_id TEXT NOT NULL, goal_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('rank','process')),
 action TEXT NOT NULL, steps_json TEXT NOT NULL CHECK(json_valid(steps_json)),
 self_check TEXT NOT NULL, target_rank TEXT, target_date TEXT,
 status TEXT NOT NULL CHECK(status IN ('active','self-achieved','archived')),
 version INTEGER NOT NULL CHECK(version>=1), create_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(guild,subject_id,goal_id),
 FOREIGN KEY(guild,subject_id) REFERENCES coach_profiles(guild,subject_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS coach_goals_active ON coach_goals(guild,subject_id,kind) WHERE status='active';
CREATE INDEX IF NOT EXISTS coach_goals_history ON coach_goals(guild,subject_id,updated_at DESC,goal_id) WHERE status<>'active';
