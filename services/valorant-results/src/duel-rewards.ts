import type {KpEnv} from './kp.ts';
import {ensureDuelProgressionTables} from './duel-progression-schema.ts';

// No policy is seeded. Operators can install an approved policy independently
// of the offline simulation after validating the economy and the D1 budget.
export const DUEL_REWARD_DDL = [
  `CREATE TABLE IF NOT EXISTS kp_duel_reward_policy (
    guild TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('pve','pvp')),
    starts_at INTEGER NOT NULL CHECK(starts_at>=0),
    daily_cap INTEGER NOT NULL CHECK(daily_cap>0),
    pair_cap INTEGER CHECK((mode='pve' AND pair_cap IS NULL) OR
      (mode='pvp' AND pair_cap IS NOT NULL AND pair_cap>0 AND pair_cap<=daily_cap)),
    win_bps INTEGER NOT NULL CHECK(win_bps BETWEEN 0 AND 10000),
    loss_bps INTEGER NOT NULL CHECK(loss_bps BETWEEN 0 AND 10000),
    draw_bps INTEGER NOT NULL CHECK(draw_bps BETWEEN 0 AND 10000),
    PRIMARY KEY(guild,mode)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS kp_duel_reward_policy_v2 (
    guild TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('pve','pvp')),
    starts_at INTEGER NOT NULL CHECK(starts_at>=0),
    daily_cap INTEGER CHECK(daily_cap IS NULL OR daily_cap>0),
    pair_cap INTEGER CHECK(
      (mode='pve' AND pair_cap IS NULL) OR
      (mode='pvp' AND pair_cap IS NOT NULL AND pair_cap>0)),
    win_bps INTEGER NOT NULL CHECK(win_bps BETWEEN 0 AND 10000),
    loss_bps INTEGER NOT NULL CHECK(loss_bps BETWEEN 0 AND 10000),
    draw_bps INTEGER NOT NULL CHECK(draw_bps BETWEEN 0 AND 10000),
    PRIMARY KEY(guild,mode)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS kp_duel_reward_rolls (
    guild TEXT NOT NULL, user TEXT NOT NULL, mode TEXT NOT NULL, match_id TEXT NOT NULL,
    game TEXT NOT NULL, opponent TEXT, jst_day INTEGER NOT NULL,
    roll INTEGER NOT NULL CHECK(roll BETWEEN 0 AND 9999),
    chance_bps INTEGER NOT NULL CHECK(chance_bps BETWEEN 0 AND 10000),
    PRIMARY KEY(guild,user,mode,match_id)
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS kp_duel_reward_rolls_day
    ON kp_duel_reward_rolls(guild,user,mode,jst_day,opponent)`,
  // Implicit rowid order within the guild/user prefix serves the latest 20 without sorting history.
  `CREATE INDEX IF NOT EXISTS kp_duel_reward_rolls_recent
    ON kp_duel_reward_rolls(guild,user)`,
  `CREATE TABLE IF NOT EXISTS kp_duel_reward_collection (
    guild TEXT NOT NULL, user TEXT NOT NULL, mode TEXT NOT NULL, game TEXT NOT NULL,
    PRIMARY KEY(guild,user,mode,game)
  ) STRICT`,
  `CREATE TRIGGER IF NOT EXISTS kp_duel_reward_collect
    AFTER INSERT ON kp_duel_reward_rolls WHEN NEW.roll < NEW.chance_bps
    BEGIN
      INSERT OR IGNORE INTO kp_duel_reward_collection(guild,user,mode,game)
      VALUES(NEW.guild,NEW.user,NEW.mode,NEW.game);
    END`,
  `DROP TRIGGER IF EXISTS kp_duel_reward_issue`,
  // P12: the lifetime PvP 12-roll threshold needs at most 12 qualifying rows.
  // Retain the exact old >=12 decay policy and atomic receipt-trigger semantics.
  `CREATE TRIGGER kp_duel_reward_issue
    AFTER INSERT ON kp_duel_progress_receipts WHEN NEW.applied_at IS NOT NULL
    BEGIN
      INSERT OR IGNORE INTO kp_duel_reward_rolls
        (guild,user,mode,match_id,game,opponent,jst_day,roll,chance_bps)
      SELECT NEW.guild,NEW.user,NEW.mode,NEW.match_id,NEW.game,NEW.opponent,
        (NEW.occurred_at+32400000)/86400000, (random() & 9223372036854775807)%10000,
        (CASE NEW.outcome WHEN 'win' THEN policy.win_bps WHEN 'loss' THEN policy.loss_bps ELSE policy.draw_bps END) /
        (CASE WHEN NEW.mode='pvp' AND
          (SELECT COUNT(*) FROM (
            SELECT 1 FROM kp_duel_reward_rolls
            WHERE guild=NEW.guild AND user=NEW.user AND mode='pvp'
            LIMIT 12
          ))>=12
          THEN 2 ELSE 1 END)
      FROM kp_duel_reward_policy_v2 policy
      WHERE policy.guild=NEW.guild AND policy.mode=NEW.mode AND policy.starts_at<=NEW.occurred_at
        AND (policy.daily_cap IS NULL OR
          (SELECT COUNT(*) FROM kp_duel_reward_rolls
            WHERE guild=NEW.guild AND user=NEW.user AND mode=NEW.mode
              AND jst_day=(NEW.occurred_at+32400000)/86400000) < policy.daily_cap)
        AND (NEW.mode='pve' OR (SELECT COUNT(*) FROM kp_duel_reward_rolls
          WHERE guild=NEW.guild AND user=NEW.user AND mode=NEW.mode
            AND jst_day=(NEW.occurred_at+32400000)/86400000
            AND opponent=NEW.opponent) < policy.pair_cap);
    END`,
] as const;

const initialized = new WeakMap<D1Database,Promise<void>>();
export async function ensureDuelRewards(env: Pick<KpEnv,'DB'>) {
  const prior = initialized.get(env.DB);
  if (prior) return prior;
  const task = (async () => {
    await ensureDuelProgressionTables(env);
    for (const sql of DUEL_REWARD_DDL) await env.DB.prepare(sql).run();
  })();
  initialized.set(env.DB, task);
  try {
    await task;
  } catch (error) {
    initialized.delete(env.DB);
    throw error;
  }
}

type Mode = 'pve' | 'pvp';
type Skill = {mode: Mode; game: string; wins: number; losses: number; draws: number};

export const DUEL_REWARD_RECENT_SQL = 'SELECT mode,match_id,game,roll,chance_bps FROM kp_duel_reward_rolls WHERE guild=? AND user=? ORDER BY rowid DESC LIMIT 20';

export async function duelRewardProfile(env: KpEnv, guild: string, user: string) {
  await ensureDuelRewards(env);
  const [policy, collection, skills, rolls] = await env.DB.batch([
    env.DB.prepare('SELECT mode,win_bps,loss_bps,draw_bps,daily_cap,starts_at FROM kp_duel_reward_policy_v2 WHERE guild=? AND starts_at<=?').bind(guild,Date.now()),
    env.DB.prepare('SELECT mode,game FROM kp_duel_reward_collection WHERE guild=? AND user=?').bind(guild,user),
    env.DB.prepare('SELECT mode,game,wins,losses,draws FROM kp_duel_mode_skill WHERE guild=? AND user=?').bind(guild,user),
    env.DB.prepare(DUEL_REWARD_RECENT_SQL).bind(guild,user),
  ]);
  return {
    enabled: (policy.results as {mode:Mode}[]).map(({mode})=>mode),
    policy: policy.results as {mode:Mode;win_bps:number;loss_bps:number;draw_bps:number;daily_cap:number|null;starts_at:number}[],
    rolls: rolls.results as {mode:Mode;match_id:string;game:string;roll:number;chance_bps:number}[],
    collection: collection.results as {mode:Mode;game:string}[],
    skills: skills.results as Skill[],
  };
}
