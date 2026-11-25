CREATE TABLE IF NOT EXISTS coach_practice_records (
 guild TEXT NOT NULL,subject_id TEXT NOT NULL,record_id TEXT NOT NULL,
 goal_id TEXT,goal_version INTEGER,goal_snapshot_json TEXT,
 catalog_version TEXT,plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
 execution_json TEXT,reflection TEXT NOT NULL DEFAULT '',planned_at INTEGER,
 occurred_date_jst TEXT,recorded_at INTEGER,status TEXT NOT NULL CHECK(status IN ('planned','recorded','skipped','deleted')),
 version INTEGER NOT NULL CHECK(version>=1),create_hash TEXT NOT NULL,mutation_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deleted_at INTEGER,
 PRIMARY KEY(guild,subject_id,record_id),FOREIGN KEY(guild,subject_id) REFERENCES coach_profiles(guild,subject_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS coach_practice_one_plan ON coach_practice_records(guild,subject_id) WHERE status='planned';
CREATE INDEX IF NOT EXISTS coach_practice_history ON coach_practice_records(guild,subject_id,updated_at DESC,record_id DESC) WHERE status IN ('recorded','skipped');
CREATE TABLE IF NOT EXISTS coach_personal_notes (
 guild TEXT NOT NULL,subject_id TEXT NOT NULL,note_id TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,record_id TEXT,
 version INTEGER NOT NULL CHECK(version>=1),create_hash TEXT NOT NULL,mutation_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deleted_at INTEGER,
 PRIMARY KEY(guild,subject_id,note_id),FOREIGN KEY(guild,subject_id) REFERENCES coach_profiles(guild,subject_id),
 FOREIGN KEY(guild,subject_id,record_id) REFERENCES coach_practice_records(guild,subject_id,record_id)
);
CREATE INDEX IF NOT EXISTS coach_notes_history ON coach_personal_notes(guild,subject_id,updated_at DESC,note_id DESC) WHERE deleted_at IS NULL;
CREATE TRIGGER IF NOT EXISTS coach_record_owner_immutable BEFORE UPDATE ON coach_practice_records
 WHEN NEW.guild<>OLD.guild OR NEW.subject_id<>OLD.subject_id OR NEW.record_id<>OLD.record_id
 BEGIN SELECT RAISE(ABORT,'Private record owner cannot change'); END;
CREATE TRIGGER IF NOT EXISTS coach_note_owner_immutable BEFORE UPDATE ON coach_personal_notes
 WHEN NEW.guild<>OLD.guild OR NEW.subject_id<>OLD.subject_id OR NEW.note_id<>OLD.note_id
 BEGIN SELECT RAISE(ABORT,'Private note owner cannot change'); END;
