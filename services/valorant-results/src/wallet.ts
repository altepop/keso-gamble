import settings from '../rewards-config.json' with { type: 'json' };
import discord from '../discord-config.json' with { type: 'json' };
import { quoteMatchReward } from './reward-contract.ts';
import type { MatchRewardEvent, RewardPolicy } from './reward-contract.ts';

export interface Wallet { currency: string; balance: number; version: number }
export type GrantResult = { status: 'disabled' | 'unconfigured' | 'unlinked' | 'ineligible' }
  | { status: 'credited' | 'duplicate'; amount: number; discordUserId: string; wallet: Wallet };

/** For a verified server-side Discord identity; not a public arbitrary-user lookup endpoint. */
export async function readWallet(db: D1Database, guildId: string, discordUserId: string): Promise<Wallet | null> {
  return db.prepare('SELECT currency,balance,version FROM reward_wallets WHERE guild_id=? AND discord_user_id=?')
    .bind(guildId, discordUserId).first<Wallet>();
}

/** Internal collector only. Payload validation alone is not permission to grant rewards. */
export async function grantMatchReward(db: D1Database, event: MatchRewardEvent, options: {
  policy?: RewardPolicy & { startsAt?: number | null }; guildId?: string; now?: number;
} = {}): Promise<GrantResult> {
  const policy = options.policy ?? settings, guildId = options.guildId ?? discord.guildId, now = options.now ?? Date.now();
  const quote = quoteMatchReward(event, policy);
  if (quote.status !== 'ready') return quote;
  if (!Number.isSafeInteger(policy.startsAt) || Number(policy.startsAt) < 0) return { status: 'unconfigured' };
  if (event.guildId !== guildId) throw new Error('Wrong reward server');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid reward timestamp');
  const link = await db.prepare(`SELECT a.discord_user_id,a.linked_at,a.active,w.currency FROM reward_accounts a
    JOIN reward_wallets w ON a.guild_id=w.guild_id AND a.discord_user_id=w.discord_user_id WHERE a.guild_id=? AND a.puuid=?`)
    .bind(guildId, event.subject.puuid).first<{ discord_user_id: string; linked_at: number; active: number; currency: string }>();
  if (!link) return { status: 'unlinked' };
  if (link.currency !== quote.currency) throw new Error('Reward currency does not match wallet');
  // A completed event keeps its original recipient and amount across policy edits or retries.
  const existing = await db.prepare('SELECT discord_user_id,amount FROM reward_events WHERE event_id=?')
    .bind(event.eventId).first<{ discord_user_id: string; amount: number }>();
  if (existing) return { status: 'duplicate', amount: existing.amount, discordUserId: existing.discord_user_id,
    wallet: (await readWallet(db, guildId, existing.discord_user_id))! };
  if (!link.active || event.match.endedAt <= Math.max(link.linked_at, policy.startsAt!)) return { status: 'ineligible' };
  const inserted = await db.prepare(`INSERT INTO reward_events(event_id,guild_id,puuid,discord_user_id,match_id,mode,outcome,
    policy_version,participation,win_bonus,amount,source_payload,applied_at)
    SELECT ?,guild_id,puuid,discord_user_id,?,?,?,?,?,?,?,?,? FROM reward_accounts
    WHERE guild_id=? AND puuid=? AND active=1 AND linked_at<?
    ON CONFLICT(event_id) DO NOTHING`)
    .bind(event.eventId, event.match.id, event.match.mode, event.match.outcome, quote.policyVersion,
      quote.participation, quote.winBonus, quote.total, JSON.stringify(event), now,
      guildId, event.subject.puuid, event.match.endedAt).run();
  const applied = await db.prepare('SELECT discord_user_id,amount FROM reward_events WHERE event_id=?')
    .bind(event.eventId).first<{ discord_user_id: string; amount: number }>();
  if (!applied) return { status: 'ineligible' };
  return { status: inserted.meta.changes ? 'credited' : 'duplicate', amount: applied.amount, discordUserId: applied.discord_user_id,
    wallet: (await readWallet(db, guildId, applied.discord_user_id))! };
}