import {ESCA_COMMAND} from './esca-command.ts';
import discord from '../discord-config.json' with { type: 'json' };
import {kpCommands,KP_COMMAND_VERSION} from './kp-command.ts';

export const RANK_REGISTRATION_KEY = 'kp-rank:discord:registered:v1';
export const RANK_COMMAND_VERSION = KP_COMMAND_VERSION;
export interface RankRegistrationEnv { DB: D1Database; DISCORD_CLIENT_SECRET?: string }
type HttpFetch = typeof fetch;

export async function rankRegistrationStatus(db: D1Database) {
  const row = await db.prepare('SELECT value FROM monitor_state WHERE key=?')
    .bind(RANK_REGISTRATION_KEY).first<{ value: string }>();
  return { command: 'esca rank / esca ranking', registered: row?.value === RANK_COMMAND_VERSION,
    version: RANK_COMMAND_VERSION };
}

// This job is called once every ten minutes, but usually performs just one indexed
// read. Discord writes only the owned /esca and /kp guild commands, never bulk-overwrites.
export async function ensureRankCommand(env: RankRegistrationEnv,
  request: HttpFetch = fetch): Promise<boolean> {
  const status = await rankRegistrationStatus(env.DB);
  if (status.registered) return true;
  if (!env.DISCORD_CLIENT_SECRET) return false;
  if (!/^\d{15,22}$/.test(discord.applicationId) || !/^\d{15,22}$/.test(discord.guildId))
    throw Error('Rank command configuration unavailable');
  // Short-lived application token; never store or log this or the Client Secret.
  const encoded = btoa(discord.applicationId + ':' + env.DISCORD_CLIENT_SECRET);
  const tokenReply = await request('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + encoded, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'applications.commands.update' }),
    signal: AbortSignal.timeout(15000),
  });
  if (!tokenReply.ok) throw Error('Rank OAuth exchange rejected (' + tokenReply.status + ')');
  const credentials = await tokenReply.json() as { access_token?: unknown; token_type?: unknown };
  if (typeof credentials.access_token !== 'string' || !credentials.access_token
    || credentials.token_type !== 'Bearer') throw Error('Rank command credentials invalid');
  const commands=[ESCA_COMMAND,kpCommands.find(c=>c.name==='kp')!];
  for(const command of commands){
  // Upsert only this guild-level command. No token is written to the database.
  const response = await request('https://discord.com/api/v10/applications/' + discord.applicationId
    + '/guilds/' + discord.guildId + '/commands', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + credentials.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('Rank command registration rejected (' + response.status + ')');
  const saved = await response.json() as { id?: unknown; application_id?: unknown; guild_id?: unknown; name?: unknown; type?: unknown };
  if (typeof saved.id !== 'string' || !/^\d{15,22}$/.test(saved.id)
    || saved.application_id !== discord.applicationId || saved.guild_id !== discord.guildId
    || saved.name !== command.name || saved.type !== 1) throw Error('Rank command registration not confirmed');
  }
  await env.DB.prepare('INSERT INTO monitor_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(RANK_REGISTRATION_KEY,RANK_COMMAND_VERSION).run();
  return true;
}
