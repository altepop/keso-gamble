-- Explicit opt-in only. Existing profiles stay private with no selected fields.
ALTER TABLE coach_profiles ADD COLUMN shared_fields_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(shared_fields_json) AND json_type(shared_fields_json)='array');
CREATE INDEX IF NOT EXISTS coach_profiles_shared ON coach_profiles(guild,visibility,subject_id);
