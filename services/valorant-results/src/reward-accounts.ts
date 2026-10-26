import stored from '../reward-accounts.json' with { type: 'json' };
import discord from '../discord-config.json' with { type: 'json' };
import players from '../players.json' with { type: 'json' };
import type { Player } from './index.ts';

export interface RewardAccountConfig {
  guildId: string;
  accounts: Array<{ riotId: string; discordUserId: string }>;
}
export const rewardAccounts: RewardAccountConfig = stored;
export function validateRewardAccounts(config: RewardAccountConfig = stored, registered: Player[] = players, guildId = discord.guildId): void {
  const snowflake = (value: unknown) => typeof value === 'string' && /^\d{15,22}$/.test(value);
  if (!snowflake(config.guildId) || config.guildId !== guildId || !Array.isArray(config.accounts) || config.accounts.length > 5) throw new Error('Invalid reward server configuration');
  const ids = new Set<string>(), users = new Set<string>();
  for (const account of config.accounts) {
    if (typeof account.riotId !== 'string' || !snowflake(account.discordUserId)) throw new Error('Reward IDs must be strings');
    const id = account.riotId.toLowerCase();
    if (!registered.some(player => player.riotId.toLowerCase() === id)) throw new Error('Reward account is not a monitored player');
    if (ids.has(id) || users.has(account.discordUserId)) throw new Error('Duplicate reward account');
    ids.add(id); users.add(account.discordUserId);
  }
}

/** Internal setup only. New links become eligible from this server-side registration time. */
export async function syncRewardAccounts(db: D1Database, options: {
  config?: RewardAccountConfig; players?: Player[]; guildId?: string; currency?: string; now?: number;
} = {}): Promise<{ linked: string[]; pending: string[] }> {
  const config = options.config ?? stored, registered = options.players ?? players;
  const guildId = options.guildId ?? discord.guildId, currency = options.currency ?? 'KC', now = options.now ?? Date.now();
  validateRewardAccounts(config, registered, guildId);
  if (!/^[A-Z][A-Z0-9_]{0,15}$/.test(currency) || !Number.isSafeInteger(now) || now < 0) throw new Error('Invalid wallet setup');
  const tracked = (await db.prepare('SELECT riot_id,puuid FROM tracked_players').all<{ riot_id: string; puuid: string }>()).results;
  const byRiotId = new Map(tracked.map(account => [account.riot_id.toLowerCase(), account.puuid]));
  const linked: string[] = [], pending: string[] = [];
  const statements: D1PreparedStatement[] = [db.prepare('UPDATE reward_accounts SET active=0 WHERE guild_id=?').bind(guildId)];
  for (const account of config.accounts) {
    statements.push(db.prepare(`INSERT INTO reward_wallets(guild_id,discord_user_id,currency,created_at,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(guild_id,discord_user_id) DO NOTHING`).bind(guildId, account.discordUserId, currency, now, now));
    const puuid = byRiotId.get(account.riotId.toLowerCase());
    if (!puuid) { pending.push(account.riotId); continue; }
    linked.push(account.riotId);
    statements.push(db.prepare(`INSERT INTO reward_accounts(guild_id,puuid,discord_user_id,riot_id,linked_at,active)
      VALUES(?,?,?,?,?,1) ON CONFLICT(guild_id,puuid) DO UPDATE SET
      discord_user_id=excluded.discord_user_id,riot_id=excluded.riot_id,active=1`)
      .bind(guildId, puuid, account.discordUserId, account.riotId, now));
  }
  await db.batch(statements);
  return { linked, pending };
}