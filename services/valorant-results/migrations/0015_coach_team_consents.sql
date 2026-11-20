-- Phase 3-B: separate, explicit, guild-bound team consent. Existing sharing
-- preferences and private records are never upgraded by this migration.
CREATE TABLE IF NOT EXISTS coach_team_consents (
 guild TEXT NOT NULL,
 team_id TEXT NOT NULL,
 subject_id TEXT NOT NULL,
 owner_user TEXT NOT NULL,
 joined INTEGER NOT NULL DEFAULT 0 CHECK(joined IN (0,1)),
 share_status INTEGER NOT NULL DEFAULT 0 CHECK(share_status IN (0,1)),
 share_metrics INTEGER NOT NULL DEFAULT 0 CHECK(share_metrics IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(guild,team_id,subject_id),
 UNIQUE(guild,team_id,owner_user),
 FOREIGN KEY(guild,subject_id) REFERENCES coach_profiles(guild,subject_id),
 CHECK(joined=1 OR (share_status=0 AND share_metrics=0))
);
CREATE INDEX IF NOT EXISTS coach_team_consent_roster
 ON coach_team_consents(guild,team_id,joined,share_status,updated_at DESC,subject_id);
CREATE TRIGGER IF NOT EXISTS coach_team_consent_owner_immutable BEFORE UPDATE ON coach_team_consents
 WHEN NEW.guild<>OLD.guild OR NEW.team_id<>OLD.team_id
 OR NEW.subject_id<>OLD.subject_id OR NEW.owner_user<>OLD.owner_user
 BEGIN SELECT RAISE(ABORT,'Coaching team consent owner cannot change'); END;
