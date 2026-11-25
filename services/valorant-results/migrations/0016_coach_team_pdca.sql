-- Phase 3-D: explicit-team-only shared challenge and self-declared participation.
-- DDL only; never enroll users or insert production records on deploy.
CREATE TABLE IF NOT EXISTS coach_team_challenges (
 guild TEXT NOT NULL,team_id TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 author_subject TEXT NOT NULL,author_user TEXT NOT NULL,
 category TEXT NOT NULL,title TEXT NOT NULL,action TEXT NOT NULL,measure TEXT NOT NULL,
 period_end TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 change_reason TEXT NOT NULL DEFAULT '',
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(guild,team_id),
 FOREIGN KEY(guild,author_subject) REFERENCES coach_profiles(guild,subject_id)
);
CREATE TABLE IF NOT EXISTS coach_team_challenge_history(
 guild TEXT NOT NULL,team_id TEXT NOT NULL,version INTEGER NOT NULL,
 category TEXT NOT NULL,title TEXT NOT NULL,action TEXT NOT NULL,measure TEXT NOT NULL,
 period_end TEXT NOT NULL,active INTEGER NOT NULL,change_reason TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(guild,team_id,version)
);
CREATE TRIGGER IF NOT EXISTS coach_team_challenge_capture_insert
 AFTER INSERT ON coach_team_challenges BEGIN
 INSERT INTO coach_team_challenge_history(guild,team_id,version,category,title,action,measure,period_end,active,change_reason,updated_at)
 VALUES(NEW.guild,NEW.team_id,NEW.version,NEW.category,NEW.title,NEW.action,NEW.measure,NEW.period_end,NEW.active,NEW.change_reason,NEW.updated_at);
 END;
CREATE TRIGGER IF NOT EXISTS coach_team_challenge_capture_update
 AFTER UPDATE ON coach_team_challenges BEGIN
 INSERT INTO coach_team_challenge_history(guild,team_id,version,category,title,action,measure,period_end,active,change_reason,updated_at)
 VALUES(NEW.guild,NEW.team_id,NEW.version,NEW.category,NEW.title,NEW.action,NEW.measure,NEW.period_end,NEW.active,NEW.change_reason,NEW.updated_at);
 END;
CREATE TABLE IF NOT EXISTS coach_team_member_status (
 guild TEXT NOT NULL,team_id TEXT NOT NULL,subject_id TEXT NOT NULL,owner_user TEXT NOT NULL,
 challenge_version INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 self_status TEXT NOT NULL,self_action TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL,
 PRIMARY KEY(guild,team_id,subject_id),
 FOREIGN KEY(guild,team_id) REFERENCES coach_team_challenges(guild,team_id),
 FOREIGN KEY(guild,subject_id) REFERENCES coach_profiles(guild,subject_id)
);
CREATE INDEX IF NOT EXISTS coach_team_member_status_listing
 ON coach_team_member_status(guild,team_id,challenge_version,updated_at DESC);
CREATE TRIGGER IF NOT EXISTS coach_team_member_status_owner_guard
 BEFORE UPDATE ON coach_team_member_status
 WHEN NEW.guild<>OLD.guild OR NEW.team_id<>OLD.team_id OR NEW.subject_id<>OLD.subject_id OR NEW.owner_user<>OLD.owner_user
 BEGIN SELECT RAISE(ABORT,'Team status ownership is immutable'); END;
