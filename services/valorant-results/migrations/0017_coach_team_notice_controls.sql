-- Phase 3-E preparation. Opt-in remains OFF and no messages are sent on deploy.
CREATE TABLE IF NOT EXISTS coach_team_notice_preferences(
 guild TEXT NOT NULL,team_id TEXT NOT NULL,subject_id TEXT NOT NULL,owner_user TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 consent_version INTEGER NOT NULL DEFAULT 0 CHECK(consent_version>=0),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(guild,team_id,subject_id),
 UNIQUE(guild,team_id,owner_user),
 FOREIGN KEY(guild,subject_id) REFERENCES coach_profiles(guild,subject_id)
);
CREATE TRIGGER IF NOT EXISTS coach_team_notice_owner_guard BEFORE UPDATE ON coach_team_notice_preferences
 WHEN NEW.guild<>OLD.guild OR NEW.team_id<>OLD.team_id OR NEW.subject_id<>OLD.subject_id OR NEW.owner_user<>OLD.owner_user
 BEGIN SELECT RAISE(ABORT,'Team notice owner cannot change'); END;
CREATE TABLE IF NOT EXISTS coach_team_notice_channels(
 guild TEXT NOT NULL,team_id TEXT NOT NULL,channel_id TEXT NOT NULL DEFAULT '',
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 configured_by TEXT NOT NULL DEFAULT '',
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(guild,team_id)
);
-- No new channel is configured; only an admin-signed interaction may enable it in a later stage.
