import {monitorMahjong, mahjongStatus} from './mahjong.ts';
import {monitorUnite} from './unite.ts';
import {settleRankChange,rankChangeBlock,rankChangeFor} from './rank-change.ts';
import type {RankChange} from './rank-change.ts';
import {paipuApi} from './mahjong-paipu.ts';
export {VoiceGateway} from './voice-gateway.ts';
import {ensureVoice} from './voice-api.ts';
import { claimDeathMatch } from './death-sessions.ts';
import type { KpRun } from './kp.ts';
import { initializeKp, syncKpAccounts, collectKpMatch, drainKpInbox, flushKpDirectives, prepareKpRun, kpEventId, kpCreditLine } from './kp.ts';
import { kpApi } from './kp-api.ts';
import { settleKpRaces } from './racing-kp.ts';
import { queueRacePosts, flushRacePosts, enqueue, ensurePosts } from './racing-posts.ts';
import { pollMlLineups, pollMlResults, refreshMlCards, settleMl, queueMlPosts } from './mleague.ts';
import { scheduleCrowns } from './racing-crowns.ts';
import { decideEntries, maybeGiftHorse, settleHorsePrizes } from './racing-horses.ts';
import { recordMastery } from './mastery.ts';
import { roastLevelsOf } from './racing-posts.ts';
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { openRaceStart } from '../../../js/racing.js';
import { lastDeathCheck } from './death-unrated.ts';
import { isDeathMode, isDeathNotice, sessionModeSQL } from './death-modes.ts';
import { discordInteractions } from './discord-interactions.ts';
import configuredPlayers from '../players.json' with { type: 'json' };
import { resultMessage, groupNotification } from './results.ts';
import type { Match, Notice } from './results.ts';
export { resultMessage } from './results.ts';

export interface Env {
  VOICE_GATEWAY?:DurableObjectNamespace;
  DISCORD_CLIENT_SECRET?: string;
  KP_BOOTSTRAP_PRIVATE_KEY?: string;
  KP_BOOTSTRAP_PUBLIC_KEY?: string;
  DB: D1Database;
  HENRIK_API_KEY: string;
  DISCORD_WEBHOOK_URL: string;
  KP_EARNINGS_WEBHOOK_URL?: string;
  MAHJONG_INGEST_KEY?: string;
  AMAE_KOROMO_TOKEN?: string;
  PAIPU_DISPATCH_TOKEN?: string;
}
export interface Player { riotId: string; name?: string }
interface Account { puuid: string; region: string; since: number }

function parseId(id: string): [string, string] {
  const split = id.lastIndexOf('#');
  if (split < 1 || split === id.length - 1) throw new Error('Riot IDは「名前#タグ」で登録してください。');
  return [id.slice(0, split), id.slice(split + 1)];
}

function validatePlayers(players: Player[]): void {
  if (players.length > 5) throw new Error('登録上限は5人です。');
  const ids = players.map(p => {
    if (typeof p.riotId !== 'string' || (p.name !== undefined && typeof p.name !== 'string')) throw new Error('players.jsonの形式を確認してください。');
    parseId(p.riotId);
    return p.riotId.toLowerCase();
  });
  if (new Set(ids).size !== ids.length) throw new Error('Riot IDが重複しています。');
}

const runApiBudget=new WeakMap<Env,number>();
async function state(env: Env, key: string): Promise<number> {
  if(key==='api_after'&&runApiBudget.has(env))return runApiBudget.get(env)!;
  const row = await env.DB.prepare('SELECT value FROM monitor_state WHERE key=?').bind(key).first<{ value: string }>();
  const value=Number(row?.value??0);if(key==='api_after')runApiBudget.set(env,value);return value;
}

async function setState(env: Env, key: string, value: number | string): Promise<void> {
  await env.DB.prepare('INSERT INTO monitor_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(key, String(value)).run();
  if(key==='api_after')runApiBudget.set(env,Number(value));
}

// Log fixed categories only: fetch errors can contain webhook URLs or credentials.
function diagnosticReason(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown_error';
  const status = /^Match API HTTP (\d{3})$/.exec(error.message);
  if (status) return 'henrik_http_' + status[1];
  if (/no such table|no column named|has no column/i.test(error.message)) return 'database_migration_missing';
  if (/D1_ERROR|SQLITE_/i.test(error.message)) return 'database_error';
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'request_timeout';
  const known: Record<string, string> = {
    'API cooldown': 'api_cooldown', 'Invalid account': 'invalid_account_data',
    'Invalid matches': 'invalid_match_list', 'Unexpected API data': 'invalid_api_data', 'Invalid match detail': 'invalid_match_detail',
    'Invalid match time': 'invalid_match_time', 'Invalid Discord message ID': 'invalid_discord_response',
  };
  return known[error.message] ?? 'unexpected_error';
}

export function retryAfter(response: Response, now = Date.now()): number {
  const number = (value: string | null) => value !== null && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  const retry = response.headers.get('Retry-After');
  let seconds = number(retry);
  if (!Number.isFinite(seconds) && retry) seconds = (Date.parse(retry) - now) / 1000;
  if (!Number.isFinite(seconds)) seconds = number(response.headers.get('X-RateLimit-Reset-After'));
  if (!Number.isFinite(seconds)) {
    const reset = response.headers.get('X-RateLimit-Reset');
    const value = number(reset);
    // Providers use either remaining seconds or an absolute Unix timestamp.
    seconds = Number.isFinite(value) ? value >= 1e12 ? (value - now) / 1000
      : value >= 1e9 ? value - now / 1000 : value : reset ? (Date.parse(reset) - now) / 1000 : NaN;
  }
  return Math.min(3600, Math.max(1, Number.isFinite(seconds) ? Math.ceil(seconds) : 60)) * 1000;
}

async function api<T>(env: Env, path: string): Promise<T> {
  if (await state(env, 'api_after') > Date.now()) throw new Error('API cooldown');
  const requestedAt = Date.now();
  const response = await fetch(`https://api.henrikdev.xyz${path}`, {
    headers: { Authorization: env.HENRIK_API_KEY }, signal: AbortSignal.timeout(10_000),
  });
  const remaining = response.headers.get('X-RateLimit-Remaining');
  const headerNumber = (name: string) => { const value = response.headers.get(name); return value !== null && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null; };
  console.info('henrik_response', { endpoint: path.includes('/match/') ? 'match_detail' : path.includes('/matches/') ? 'matches' : path.includes('/mmr-history/') ? 'mmr_history' : 'account', status: response.status,
    responseMs: Date.now() - requestedAt, cacheTTL: headerNumber('X-Cache-TTL'), cacheAge: headerNumber('Age'), remaining: headerNumber('X-RateLimit-Remaining') });
  if (response.status === 429 || (remaining !== null && Number(remaining) <= 1)) {
    const retryAt = Date.now() + retryAfter(response);
    await setState(env, 'api_after', retryAt);
    console.info('henrik_wait', { status: response.status, retryAt: new Date(retryAt).toISOString() });
  }
  if (!response.ok) throw new Error(`Match API HTTP ${response.status}`);
  const body = await response.json() as { data: T };
  if (body.data === undefined) throw new Error('Unexpected API data');
  return body.data;
}


async function saveMatch(env: Env, match: Match, player: Player, account: Account, kpRun:KpRun|null,reservations:Map<string,string>,saved:Set<string>,ranks:Map<string,string>=new Map()): Promise<'excluded' | 'beforeMonitoring' | 'newResults' | 'duplicates'> {
  const mode = match.metadata?.queue?.id;
  const ordinary = resultMessage(match, account.puuid, player.name?.trim() || parseId(player.riotId)[0]);
  if (!ordinary) return 'excluded';
  if (ordinary.endedAt <= account.since) return 'beforeMonitoring';
  // Only the selected queue can consume a reservation; normal games stay normal.
  const death = isDeathMode(mode) && reservations.get(player.riotId)===mode && await claimDeathMatch(env.DB,player.riotId,match.metadata.match_id,Date.parse(match.metadata.started_at),ordinary.endedAt,mode);
  let previousLastDeath: boolean | undefined;
  if (death) {
    const check = lastDeathCheck(match, account.puuid);
    const key = 'death_last:' + match.metadata.match_id + ':' + account.puuid;
    if (check.value !== null) {
      // Persist only the verified boolean, not raw match data. A later partial
      // history response must not turn a resolved post back into "data missing".
      await env.DB.prepare('INSERT INTO monitor_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE value!=excluded.value')
        .bind(key, String(check.value)).run();
    } else {
      const saved = await env.DB.prepare('SELECT value FROM monitor_state WHERE key=?').bind(key).first<{ value: string }>();
      if (saved?.value === 'true' || saved?.value === 'false') previousLastDeath = saved.value === 'true';
      console.info('death_last_check', { matchId: match.metadata.match_id, reason: check.reason, finalRound: check.finalRound, usingSavedResult: previousLastDeath !== undefined });
    }
  }
  const result = death ? resultMessage(match,account.puuid,player.name?.trim() || parseId(player.riotId)[0],true,previousLastDeath)! : ordinary;
  let kpActive = false;
  const kpId=kpRun?kpEventId(kpRun.mapping.guildId,match.metadata.match_id,account.puuid):'';
  try {
    if (kpRun && Date.parse(match.metadata.started_at)>=kpRun.startsAt) {
      const amount = kpRun.credits.get(kpId) ?? await collectKpMatch(env,kpRun.mapping,match,account.puuid);
      if (amount !== null) {
        kpRun.credits.set(kpId,amount);
        result.message=kpCreditLine(result.message,amount);
        kpActive=kpRun.messages.get(kpId)!==result.message;
      }
    }
  } catch { console.warn('kp_match_pending'); }
  // Competitive rank change from the MMR history. The history can lag the match list, so a match ended in the
  // last 6 hours is looked up on each run until it appears, and given up 45 minutes after it ended. The result is
  // kept, so every rewrite of the post carries it. A demotion costs KP once, a promotion pays once.
  if (mode === 'competitive' && kpRun) try {
    const key = 'rank2:' + match.metadata.match_id + ':' + account.puuid, now = Date.now();
    const stored = ranks.get(key);
    let change: RankChange | null = stored?.startsWith('{') ? JSON.parse(stored) as RankChange : null;
    // At most three lookups per run, and one history request per player per run.
    const lookups = Number(ranks.get('__lookups') ?? 0);
    if (!change && stored !== 'none' && result.endedAt > now - 6 * 3600_000 && lookups < 3) {
      ranks.set('__lookups', String(lookups + 1));
      const cached = ranks.get('__history:' + account.puuid);
      const history: unknown = cached !== undefined ? JSON.parse(cached) : await api<unknown>(env, `/valorant/v2/by-puuid/mmr-history/${account.region}/pc/${encodeURIComponent(account.puuid)}`);
      if (cached === undefined) ranks.set('__history:' + account.puuid, JSON.stringify(history));
      change = rankChangeFor(history, match.metadata.match_id);
      console.info('rank_change_lookup', { matchId: match.metadata.match_id, found: Boolean(change), before: change?.before, after: change?.after,
        entries: Array.isArray((history as { history?: unknown[] })?.history) ? (history as { history: unknown[] }).history.length : Array.isArray(history) ? history.length : null });
      const next = change ? JSON.stringify(change) : now > result.endedAt + 45 * 60_000 ? 'none' : 'pending';
      if (next !== stored) await env.DB.prepare('INSERT INTO monitor_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, next).run();
      ranks.set(key, next);
      const user = kpRun.mapping.accounts.find(a => a.riotId === player.riotId)?.discordUserId;
      if (change && user) await settleRankChange(env, kpRun.mapping, user, change, match.metadata.match_id, account.puuid, Date.now());
      if (change && change.after !== change.before) {
        kpActive = true;
        // Found after the result was already posted: announce it again as its own post (result bot webhook).
        if (saved.has(JSON.stringify([player.riotId, match.metadata.match_id]))) {
          await env.DB.prepare("CREATE TABLE IF NOT EXISTS mahjong_watch_posts(id TEXT PRIMARY KEY,body TEXT NOT NULL,at INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0,lease INTEGER NOT NULL DEFAULT 0,message_id TEXT)").run();
          const name = player.name?.trim() || parseId(player.riotId)[0];
          await env.DB.prepare('INSERT OR IGNORE INTO mahjong_watch_posts(id,body,at) VALUES(?,?,?)').bind('rank:' + key,
            JSON.stringify({ content: `📢 **${name}のランク速報**（${new Date(result.endedAt + 9 * 3600_000).toISOString().slice(11, 16)} 終了のコンペ）` + rankChangeBlock(change, match.metadata.match_id + ':' + account.puuid), allowed_mentions: { parse: [] } }), now).run();
        }
      }
    }
    if (change) result.message += rankChangeBlock(change, match.metadata.match_id + ':' + account.puuid);
  } catch { console.warn('rank_change_pending'); }
  const savedKey=JSON.stringify([player.riotId,match.metadata.match_id]);
  if(saved.has(savedKey)&&!kpActive&&!isDeathNotice(result.mode))return 'duplicates';
  const inserted = await env.DB.prepare('INSERT OR IGNORE INTO notifications(riot_id,match_id,message,ended_at,mode,act_id,act_name,outcome,sent,team_id) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(player.riotId, match.metadata.match_id, result.message, result.endedAt, result.mode, result.actId, result.actName,
      result.outcome, result.outcome === 'draw' && result.mode === 'escalation' ? 1 : 0, result.teamId).run();
  saved.add(savedKey);
  if(kpRun&&kpRun.credits.has(kpId))kpRun.messages.set(kpId,result.message);
  if (inserted.meta.changes) {
    // Agent mastery counts new results only; a failure never blocks the result post.
    if (kpRun) try {
      const subject = match.players.find(p => p.puuid === account.puuid), mapping = kpRun.mapping;
      await recordMastery(env, mapping, player.riotId, match.metadata.match_id, subject?.agent?.name, result.outcome, result.endedAt, () => roastLevelsOf(env, mapping));
    } catch { console.warn('mastery_pending'); }
    await env.DB.prepare('INSERT OR IGNORE INTO monitor_state(key,value) VALUES(?,?)').bind('detected:' + match.metadata.match_id, String(Date.now())).run();
    console.info('result_saved', { player: player.name || player.riotId, outcome: result.outcome, endedAt: new Date(result.endedAt).toISOString(),
      finishToDetectionMs: Math.max(0, Date.now() - result.endedAt) });
    return 'newResults';
  }
  if (kpActive || isDeathNotice(result.mode)) await env.DB.prepare("UPDATE notifications SET message=?,outcome=?,sent=CASE WHEN mode='escalation' AND ?='draw' THEN 1 ELSE 0 END WHERE riot_id=? AND match_id=? AND message!=?")
    .bind(result.message, result.outcome, result.outcome, player.riotId, match.metadata.match_id, result.message).run();
  return 'duplicates';
}

interface DeathDetails {
  remaining: number;
  matches: Map<string, Match | null>;
  reservations:Map<string,string>;
}

async function deathDetail(env: Env, match: Match, players: Player[], accounts: Map<string, Account>, details: DeathDetails): Promise<Match | null> {
  if (!isDeathMode(match.metadata?.queue?.id) || !match.metadata.is_completed || ![...details.reservations.values()].includes(match.metadata.queue.id)) return null;
  const matchId = match.metadata.match_id;
  if (details.matches.has(matchId)) return details.matches.get(matchId) ?? null;
  details.matches.set(matchId, null);
  const sessions = await env.DB.prepare(`SELECT riot_id FROM death_unrated_sessions s WHERE match_id=? AND cancelled_at IS NULL AND ${sessionModeSQL}=?`)
    .bind(matchId, match.metadata.queue.id).all<{ riot_id: string }>();
  let unresolved = false;
  for (const session of sessions.results) {
    const account = accounts.get(session.riot_id);
    if (!account || !players.some(player => player.riotId === session.riot_id) || lastDeathCheck(match, account.puuid).value !== null) continue;
    const saved = await env.DB.prepare('SELECT value FROM monitor_state WHERE key=?')
      .bind('death_last:' + matchId + ':' + account.puuid).first<{ value: string }>();
    if (saved?.value !== 'true' && saved?.value !== 'false') unresolved = true;
  }
  if (!unresolved || details.remaining <= 0 || await state(env, 'death_detail_after:' + matchId) > Date.now() || await state(env, 'api_after') > Date.now()) return null;
  const account = players.map(player => accounts.get(player.riotId)).find(account => account && match.players.some(player => player.puuid === account.puuid));
  if (!account) return null;
  details.remaining--;
  // First send the available result; a slow details endpoint must not hold the initial post.
  await flushNotifications(env, players);
  await setState(env, 'death_detail_after:' + matchId, Date.now() + 5 * 60_000);
  try {
    const detail = await api<Match>(env, '/valorant/v4/match/' + account.region + '/' + encodeURIComponent(matchId));
    if (!detail || detail.metadata?.match_id !== matchId || detail.metadata.queue?.id !== match.metadata.queue.id
      || detail.metadata.is_completed !== true || Date.parse(detail.metadata.started_at) !== Date.parse(match.metadata.started_at)
      || !Number.isFinite(detail.metadata.game_length_in_ms) || detail.metadata.game_length_in_ms <= 0
      || !Array.isArray(detail.teams) || detail.teams.length !== 2
      || detail.teams.filter(team => team.won === true).length > 1
      || !detail.teams.every(team => typeof team.won === 'boolean' && match.teams.some(other => other.team_id === team.team_id))
      || new Set(detail.teams.map(team => team.team_id)).size !== 2
      || !Array.isArray(detail.players) || detail.players.length !== match.players.length
      || new Set(detail.players.map(player => player.puuid)).size !== detail.players.length
      || !match.players.every(player => detail.players.some(other => other.puuid === player.puuid && other.team_id === player.team_id))) throw new Error('Invalid match detail');
    details.matches.set(matchId, detail);
    console.info('death_detail_received', { matchId });
    return detail;
  } catch (error) {
    console.warn('death_detail_failed', { matchId, reason: diagnosticReason(error) });
    return null;
  }
}

async function flushNotifications(env: Env, players: Player[]): Promise<void> {
  const hasPending = await env.DB.prepare('SELECT 1 AS n FROM notifications WHERE sent=0 LIMIT 1').first();
  if (!hasPending) return;
  const discordAfter = await state(env, 'discord_after');
  if (discordAfter > Date.now()) { console.info('discord_wait', { retryAt: new Date(discordAfter).toISOString() }); return; }
  const url = new URL(env.DISCORD_WEBHOOK_URL);
  if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || !url.pathname.startsWith('/api/webhooks/')) throw new Error('Invalid Discord Webhook URL');
  url.searchParams.set('wait', 'true');
  const pending = await env.DB.prepare(`SELECT match_id,MIN(ended_at) AS ended_at FROM notifications
    WHERE sent=0 AND (mode IS NULL OR (mode!='unrated' AND substr(mode,1,6)!='death_') OR EXISTS(
      SELECT 1 FROM death_unrated_sessions s WHERE s.riot_id=notifications.riot_id
      AND s.match_id=notifications.match_id AND s.cancelled_at IS NULL))
    GROUP BY match_id ORDER BY ended_at,match_id LIMIT 10`).all<{ match_id: string }>();
  for (const pendingMatch of pending.results) {
    try {
      // Include sent participants when another player's result arrives on a later poll.
      const notices = await env.DB.prepare(`SELECT * FROM notifications WHERE match_id=?
        AND (outcome IS NULL OR outcome!='draw' OR mode!='escalation')
        AND (mode IS NULL OR (mode!='unrated' AND substr(mode,1,6)!='death_') OR EXISTS(SELECT 1 FROM death_unrated_sessions s
          WHERE s.riot_id=notifications.riot_id AND s.match_id=notifications.match_id AND s.cancelled_at IS NULL)) ORDER BY riot_id`).bind(pendingMatch.match_id).all<Notice>();
      if (!notices.results.length) continue;
      const payload = await groupNotification(env.DB, notices.results, new Map(players.map(player => [player.riotId, player.name?.trim() || parseId(player.riotId)[0]])));
      const saved = await env.DB.prepare('SELECT value FROM monitor_state WHERE key=?')
        .bind('post:' + pendingMatch.match_id).first<{ value: string }>();
      // Discord snowflakes must stay strings: conversion to Number loses precision.
      const editUrl = new URL(url);
      editUrl.pathname = editUrl.pathname.replace(/\/$/, '') + '/messages/' + encodeURIComponent(saved?.value ?? '');
      editUrl.searchParams.delete('wait');
      const send = (target: URL, method: string) => fetch(target, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000),
      });
      let response = await send(saved ? editUrl : url, saved ? 'PATCH' : 'POST');
      // A deleted original message can be replaced when a late result needs to be added.
      if (saved && response.status === 404) response = await send(url, 'POST');
      if (!response.ok) {
        console.warn('discord_post_failed', { status: response.status });
        await setState(env, 'discord_after', Date.now() + retryAfter(response));
        break;
      }
      const message = await response.json() as { id?: string };
      if (typeof message.id !== 'string' || !/^\d+$/.test(message.id)) throw new Error('Invalid Discord message ID');
      await setState(env, 'post:' + pendingMatch.match_id, message.id);
      await env.DB.prepare('UPDATE notifications SET sent=1 WHERE match_id=?').bind(pendingMatch.match_id).run();
      let timing = null;
      try {
        const detected = await env.DB.prepare('SELECT value FROM monitor_state WHERE key=?')
          .bind('detected:' + pendingMatch.match_id).first<{ value: string }>();
        const detectedAt = Number(detected?.value ?? 0), deliveredAt = Date.now();
        const endedAt = Math.max(...notices.results.map(notice => notice.ended_at));
        timing = detectedAt > 0 ? { endedAt, detectedAt, deliveredAt,
          finishToDetectionMs: Math.max(0, detectedAt - endedAt), detectionToDiscordMs: Math.max(0, deliveredAt - detectedAt) } : null;
        // Late edits must not replace the timing of the initial notification.
        if (timing && !saved) await setState(env, 'delivery:last', JSON.stringify(timing));
      } catch { console.warn('delivery_timing_failed'); }
      console.info('discord_delivered', { matchId: pendingMatch.match_id, players: notices.results.length, updated: Boolean(saved), timing });
    } catch (error) { console.warn('discord_post_failed', { reason: diagnosticReason(error) }); await setState(env, 'discord_after', Date.now() + 60_000); break; }
  }
}

export async function monitor(env: Env, players: Player[] = configuredPlayers): Promise<void> {
  validatePlayers(players);
  runApiBudget.delete(env);
  console.info('monitor_start', { players: players.length, time: new Date().toISOString() });
  const lease = Date.now() + 5 * 60_000;
  const lock = await env.DB.prepare(`INSERT INTO monitor_state(key,value) VALUES('lock',?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(monitor_state.value AS INTEGER)<?`)
    .bind(String(lease), Date.now()).run();
  if (!lock.meta.changes) { console.info('monitor_skipped', { reason: 'previous_run_active' }); return; }
  try {
    await setState(env, 'monitor_started', Date.now());
    const marks = players.map(() => '?').join(',');
    await env.DB.prepare(`DELETE FROM tracked_players${players.length ? ` WHERE riot_id NOT IN (${marks})` : ''}`)
      .bind(...players.map(p => p.riotId)).run();
    await env.DB.prepare(`DELETE FROM death_unrated_sessions${players.length ? ` WHERE riot_id NOT IN (${marks})` : ''}`)
      .bind(...players.map(p => p.riotId)).run();
    await env.DB.prepare('DELETE FROM discord_command_receipts WHERE expires_at<?').bind(Date.now()).run();
    const accounts = new Map<string, Account>((await env.DB.prepare('SELECT riot_id,puuid,region,since FROM tracked_players')
      .all<Account & { riot_id: string }>()).results.map(account => [account.riot_id, account]));
    let kpRun:KpRun|null=null;
    try { const mapping = await initializeKp(env); if (mapping) { await syncKpAccounts(env,mapping); await drainKpInbox(env); await flushKpDirectives(env,mapping);kpRun=await prepareKpRun(env,mapping); } }
    catch { console.warn('kp_setup_pending'); }
    // Bound extra API traffic: one reserved match per run, one attempt per match per five minutes.
    const reservations=new Map((await env.DB.prepare(`SELECT s.riot_id,${sessionModeSQL} AS mode FROM death_unrated_sessions s WHERE s.cancelled_at IS NULL`).all<{riot_id:string;mode:string}>()).results.map(r=>[r.riot_id,r.mode]));
    const saved=new Set((await env.DB.prepare('SELECT riot_id,match_id FROM notifications ORDER BY ended_at DESC LIMIT 200').all<{riot_id:string;match_id:string}>()).results.map(r=>JSON.stringify([r.riot_id,r.match_id])));
    const ranks=new Map((await env.DB.prepare("SELECT key,value FROM monitor_state WHERE key LIKE 'rank2:%' ORDER BY rowid DESC LIMIT 300").all<{key:string;value:string}>()).results.map(r=>[r.key,r.value]));
    const deathDetails: DeathDetails = { remaining: 1, matches: new Map(),reservations };
    // Deliver a previously queued result before spending time polling the API again.
    if (players.length) await flushNotifications(env, players);
    const offset = await state(env, 'cursor') % Math.max(1, players.length);
    // Rotate the first player so a shared API limit cannot starve later players.
    for (let n = 0; n < players.length; n++) {
      const index = (offset + n) % players.length;
      const player = players[index];
      const apiAfter = await state(env, 'api_after');
      if (apiAfter > Date.now()) { console.info('henrik_wait', { retryAt: new Date(apiAfter).toISOString() }); break; }
      await setState(env, 'cursor', (index + 1) % players.length);
      let stage = 'account';
      try {
        let account = accounts.get(player.riotId);
        const newlyTracked=!account;
        if (!account) {
          const [name, tag] = parseId(player.riotId);
          const found = await api<Account>(env, `/valorant/v2/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
          if (!found.puuid || !['ap', 'na', 'eu', 'kr', 'br', 'latam'].includes(found.region)) throw new Error('Invalid account');
          account = { puuid: found.puuid, region: found.region, since: Date.now() };
          await env.DB.prepare('INSERT INTO tracked_players(riot_id,puuid,region,since) VALUES(?,?,?,?)')
            .bind(player.riotId, account.puuid, account.region, account.since).run();
          console.info('player_registered', { player: player.name || player.riotId, since: new Date(account.since).toISOString() });
        }
        accounts.set(player.riotId, account);
        try { if(newlyTracked&&kpRun){await syncKpAccounts(env,kpRun.mapping);kpRun=await prepareKpRun(env,kpRun.mapping);} }
        catch { console.warn('kp_link_pending'); }
        stage = 'match_history';
        const matches = await api<Match[]>(env, `/valorant/v4/by-puuid/matches/${account.region}/pc/${encodeURIComponent(account.puuid)}?size=5`);
        if (!Array.isArray(matches)) throw new Error('Invalid matches');
        const counts = { fetched: matches.length, newResults: 0, duplicates: 0, beforeMonitoring: 0, excluded: 0 };
        stage = 'save_result';
        for (const match of [...matches].sort((a, b) => Date.parse(a.metadata.started_at) - Date.parse(b.metadata.started_at))) {
          counts[await saveMatch(env, match, player, account,kpRun,reservations,saved,ranks)]++;
          // A full match already contains other registered players; do not wait for their history to catch up.
          for (const other of players) {
            if (other.riotId === player.riotId) continue;
            const otherAccount = accounts.get(other.riotId);
            if (otherAccount && match.players?.some(member => member.puuid === otherAccount.puuid)) await saveMatch(env, match, other, otherAccount,kpRun,reservations,saved,ranks);
          }
          const detail = await deathDetail(env, match, players, accounts, deathDetails);
          if (detail) for (const target of players) {
            const targetAccount = accounts.get(target.riotId);
            if (targetAccount && detail.players.some(member => member.puuid === targetAccount.puuid)) await saveMatch(env, detail, target, targetAccount,kpRun,reservations,saved,ranks);
          }
        }
        await setState(env, 'checked:' + player.riotId, Date.now());
        console.info('player_checked', { player: player.name || player.riotId, ...counts });
      } catch (error) { console.warn('player_poll_failed', { player: player.name || player.riotId, stage, reason: diagnosticReason(error) }); }
      await flushNotifications(env, players);
    }
    if (!players.length) return;
    await flushNotifications(env, players);
    try {const mapping=await initializeKp(env);if(mapping)await flushKpDirectives(env,mapping);}catch{console.warn('kp_directive_delivery_pending');}

  } finally {
    runApiBudget.delete(env);
    await env.DB.prepare("DELETE FROM monitor_state WHERE key='lock' AND value=?").bind(String(lease)).run();
    await setState(env, 'monitor_finished', Date.now());
    console.info('monitor_finish');
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if(request.method==='GET'&&new URL(request.url).pathname==='/api/mahjong/status')return mahjongStatus(env).then(status=>Response.json(status,{headers:{'Cache-Control':'no-store'}})).catch(()=>Response.json({enabled:false,error:'configuration_unavailable'},{status:503}));
    if(new URL(request.url).pathname.startsWith('/api/mahjong/paipu/'))return paipuApi(request,env).catch(()=>new Response('Unavailable',{status:503}));
    return new URL(request.url).pathname.startsWith('/api/kp/') ? kpApi(request, env) : discordInteractions(request, env, ctx);
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(monitorMahjong(env).catch(()=>console.warn('mahjong_watch_pending')));
    ctx.waitUntil(monitorUnite(env).catch(()=>console.warn('unite_watch_pending')));
    ctx.waitUntil(ensureVoice(env).catch(()=>console.warn('voice_ensure_pending')));
    ctx.waitUntil(monitor(env));
    ctx.waitUntil((async()=>{
      const mapping=await initializeKp(env);if(!mapping)return;
      // Owned horses run even when nobody opens the Activity.
      try{await decideEntries(env,mapping,openRaceStart(Date.now()));await settleHorsePrizes(env,mapping);}catch{console.warn('horse_race_pending');}
      // A very rare free horse for someone, drawn once per race slot and announced in the earnings channel.
      try{const gift=await maybeGiftHorse(env,mapping,openRaceStart(Date.now()));if(gift&&env.KP_EARNINGS_WEBHOOK_URL){await ensurePosts(env);await enqueue(env,'horse-gift:'+gift.horse.id,gift.text,Date.now());}}catch{console.warn('horse_gift_pending');}
      try{await settleKpRaces(env,mapping);}catch{console.warn('race_settlement_pending');}
      // Results are queued after settlement in the same run, then sent.
      let crowns:Awaited<ReturnType<typeof scheduleCrowns>>=[];
      try{crowns=await scheduleCrowns(env,mapping);}catch{console.warn('crown_schedule_pending');}
      // M.LEAGUE: official results, then settlement, then posts (flushed together with the racing ones).
      try{await refreshMlCards(env);await pollMlLineups(env,mapping);await pollMlResults(env);await settleMl(env,mapping);await queueMlPosts(env,mapping);}catch{console.warn('mleague_pending');}
      try{await queueRacePosts(env,mapping,Date.now(),crowns);await flushRacePosts(env);}catch{console.warn('earnings_post_pending');}
    })().catch(()=>console.warn('race_settlement_pending')));
  },
};
