CREATE TABLE IF NOT EXISTS coach_profiles (
 guild TEXT NOT NULL,
 subject_id TEXT NOT NULL,
 owner_user TEXT NOT NULL,
 person_key TEXT NOT NULL,
 display_name TEXT NOT NULL,
 visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','guild-summary')),
 policy_version INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(guild,subject_id),UNIQUE(guild,owner_user),UNIQUE(guild,person_key)
);
CREATE TABLE IF NOT EXISTS coach_profile_accounts (
 guild TEXT NOT NULL,
 subject_id TEXT NOT NULL,
 puuid TEXT NOT NULL,
 account_key TEXT NOT NULL,
 verified_at INTEGER NOT NULL,
 PRIMARY KEY(guild,puuid),UNIQUE(guild,subject_id,account_key),
 FOREIGN KEY(guild,subject_id) REFERENCES coach_profiles(guild,subject_id)
);
CREATE TRIGGER IF NOT EXISTS coach_profile_owner_immutable BEFORE UPDATE ON coach_profiles
 WHEN NEW.guild<>OLD.guild OR NEW.subject_id<>OLD.subject_id OR NEW.owner_user<>OLD.owner_user OR NEW.person_key<>OLD.person_key
 BEGIN SELECT RAISE(ABORT,'Coaching owner cannot change'); END;
CREATE TRIGGER IF NOT EXISTS coach_account_owner_immutable BEFORE UPDATE ON coach_profile_accounts
 WHEN NEW.guild<>OLD.guild OR NEW.subject_id<>OLD.subject_id OR NEW.puuid<>OLD.puuid OR NEW.account_key<>OLD.account_key
 BEGIN SELECT RAISE(ABORT,'Coaching account cannot change'); END;
