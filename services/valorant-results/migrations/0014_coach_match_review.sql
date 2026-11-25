ALTER TABLE coach_practice_records ADD COLUMN match_id TEXT;
ALTER TABLE coach_practice_records ADD COLUMN primary_metric TEXT DEFAULT 'dpr';
ALTER TABLE coach_practice_records ADD COLUMN supporting_metrics_json TEXT NOT NULL DEFAULT '["kpr","kd"]';
ALTER TABLE coach_personal_notes ADD COLUMN match_id TEXT;
CREATE INDEX coach_practice_observation ON coach_practice_records(guild,subject_id,planned_at) WHERE planned_at IS NOT NULL;
UPDATE coach_practice_records SET primary_metric=NULL,supporting_metrics_json='[]' WHERE status='deleted';
