-- New reward tables are independent of tracked-player deletion and Discord delivery state.
CREATE TABLE reward_wallets (
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0 CHECK(typeof(balance)='integer' AND balance BETWEEN 0 AND 9007199254740991),
  version INTEGER NOT NULL DEFAULT 0 CHECK(typeof(version)='integer' AND version>=0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(guild_id,discord_user_id)
);
CREATE TABLE reward_accounts (
  guild_id TEXT NOT NULL,
  puuid TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  riot_id TEXT NOT NULL,
  linked_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  PRIMARY KEY(guild_id,puuid),
  UNIQUE(guild_id,discord_user_id),
  FOREIGN KEY(guild_id,discord_user_id) REFERENCES reward_wallets(guild_id,discord_user_id)
);
CREATE TRIGGER reward_account_owner_immutable BEFORE UPDATE OF discord_user_id ON reward_accounts
WHEN NEW.discord_user_id!=OLD.discord_user_id
BEGIN
  SELECT RAISE(ABORT,'reward account owner cannot be reassigned automatically');
END;
CREATE TABLE reward_events (
  event_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  puuid TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('competitive','escalation','unrated')),
  outcome TEXT NOT NULL CHECK(outcome IN ('win','loss','draw')),
  policy_version TEXT NOT NULL,
  participation INTEGER NOT NULL CHECK(typeof(participation)='integer' AND participation>=0),
  win_bonus INTEGER NOT NULL CHECK(typeof(win_bonus)='integer' AND win_bonus>=0),
  amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount BETWEEN 0 AND 9007199254740991 AND amount=participation+win_bonus),
  source_payload TEXT NOT NULL,
  applied_at INTEGER NOT NULL,
  UNIQUE(guild_id,match_id,puuid),
  FOREIGN KEY(guild_id,puuid) REFERENCES reward_accounts(guild_id,puuid),
  FOREIGN KEY(guild_id,discord_user_id) REFERENCES reward_wallets(guild_id,discord_user_id)
);
CREATE TABLE wallet_entries (
  entry_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  delta INTEGER NOT NULL CHECK(typeof(delta)='integer' AND delta BETWEEN -9007199254740991 AND 9007199254740991),
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(guild_id,discord_user_id) REFERENCES reward_wallets(guild_id,discord_user_id)
);
CREATE INDEX wallet_entries_account ON wallet_entries(guild_id,discord_user_id,created_at);
-- An event, its ledger entry, and its balance update succeed or roll back together.
CREATE TRIGGER reward_event_to_ledger AFTER INSERT ON reward_events
BEGIN
  INSERT INTO wallet_entries(entry_id,guild_id,discord_user_id,delta,kind,created_at)
    VALUES(NEW.event_id,NEW.guild_id,NEW.discord_user_id,NEW.amount,'valorant_match',NEW.applied_at);
END;
CREATE TRIGGER wallet_entry_to_balance AFTER INSERT ON wallet_entries
BEGIN
  UPDATE reward_wallets SET balance=balance+NEW.delta,version=version+1,updated_at=NEW.created_at
    WHERE guild_id=NEW.guild_id AND discord_user_id=NEW.discord_user_id;
END;
CREATE TRIGGER wallet_currency_immutable BEFORE UPDATE OF currency ON reward_wallets
WHEN NEW.currency!=OLD.currency
BEGIN
  SELECT RAISE(ABORT,'wallet currency requires an explicit migration');
END;