import discord from '../discord-config.json' with { type: 'json' };
import { predictionCommand } from './discord-command.ts';
import players from '../players.json' with { type: 'json' };

export const PREDICT_REGISTRATION_KEY = 'predict:discord:registered:v1';
export const PREDICT_COMMAND_VERSION = 'predict-v1';
export interface PredictionRegistrationEnv { DB: D1Database; DISCORD_CLIENT_SECRET?: string }
type HttpFetch = typeof fetch;

export async function predictionRegistrationStatus(db: D1Database) {
  const row = await db.prepare('SELECT value FROM monitor_state WHERE key=?')
    .bind(PREDICT_REGISTRATION_KEY).first<{ value: string }>();
  return { command: 'predict', registered: row?.value === PREDICT_COMMAND_VERSION,
    version: PREDICT_COMMAND_VERSION };
}

// This job is called once every ten minutes, but usually performs just one indexed
// read. Discord writes only the single /predict guild command, never bulk-overwrites.
export async function ensurePredictionCommand(env: PredictionRegistrationEnv,
  request: HttpFetch = fetch): Promise<boolean> {
  const status = await predictionRegistrationStatus(env.DB);
  if (status.registered) return true;
  if (!env.DISCORD_CLIENT_SECRET) return false;
  if (!/^\d{15,22}$/.test(discord.applicationId) || !/^\d{15,22}$/.test(discord.guildId))
    throw Error('Prediction command configuration unavailable');
  // Short-lived application token; never store or log this or the Client Secret.
  const encoded = btoa(discord.applicationId + ':' + env.DISCORD_CLIENT_SECRET);
  const tokenReply = await request('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + encoded, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'applications.commands.update' }),
    signal: AbortSignal.timeout(15000),
  });
  if (!tokenReply.ok) throw Error('Prediction OAuth exchange rejected (' + tokenReply.status + ')');
  const credentials = await tokenReply.json() as { access_token?: unknown; token_type?: unknown };
  if (typeof credentials.access_token !== 'string' || !credentials.access_token
    || credentials.token_type !== 'Bearer') throw Error('Prediction command credentials invalid');
  const command = predictionCommand(players);
  // Upsert only this guild-level command. No token is written to the database.
  const response = await request('https://discord.com/api/v10/applications/' + discord.applicationId
    + '/guilds/' + discord.guildId + '/commands', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + credentials.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('Prediction command registration rejected (' + response.status + ')');
  const saved = await response.json() as { id?: unknown; application_id?: unknown; guild_id?: unknown; name?: unknown; type?: unknown };
  if (typeof saved.id !== 'string' || !/^\d{15,22}$/.test(saved.id)
    || saved.application_id !== discord.applicationId || saved.guild_id !== discord.guildId
    || saved.name !== 'predict' || saved.type !== 1) throw Error('Prediction command registration not confirmed');
  await env.DB.prepare('INSERT INTO monitor_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(PREDICT_REGISTRATION_KEY,PREDICT_COMMAND_VERSION).run();
  return true;
}
