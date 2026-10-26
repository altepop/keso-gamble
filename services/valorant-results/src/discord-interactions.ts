import { runValoCommand } from './valo-queries.ts';
import storedConfig from '../discord-config.json' with { type: 'json' };
import configuredPlayers from '../players.json' with { type: 'json' };
import type { Env, Player } from './index.ts';
import type { DeathSession } from './death-sessions.ts';
import { deathActionKey, deathModeKey, deathName, deathQueueName, isDeathMode, sessionModeSQL } from './death-modes.ts';
import { deathRequest } from './death-request.ts';
import { deathModePicker, selectDeathMode } from './death-mode-picker.ts';
import type { ExpectedDeathAction } from './death-modes.ts';

export interface DiscordConfig { applicationId: string; publicKey: string; guildId: string; workerUrl?: string }
interface Option { type: number; name: string; value?: string; options?: Option[] }
export interface Interaction {
  id: string; application_id: string; type: number; token?: string; guild_id?: string;
  member?: { permissions?: string; user?: { id: string } };
  data?: { name?: string; options?: Option[]; custom_id?: string; values?: string[]; component_type?: number };
}
const respond = (content: string) => Response.json({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });
const unhex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], byte => parseInt(byte, 16));
const label = (player: Player) => (player.name || player.riotId.split('#')[0]).replace(/[\r\n`*_~|<>]/g, '').slice(0, 80);

export async function runDeathCommand(db: D1Database, interaction: Interaction, players: Player[] = configuredPlayers, expectedActions?: ExpectedDeathAction[]): Promise<string> {
  const request = deathRequest(interaction, players);
  if ('error' in request) return request.error;
  const { action, targets } = request, mode = request.mode ?? 'unrated';
  if (expectedActions && (action !== 'start' || expectedActions.length !== targets.length
    || targets.some((player, n) => player.riotId !== expectedActions[n].riotId))) return '対象者の登録が変わっています。/death start からやり直してください。';
  const now = Date.now();
  const receipt = await db.prepare('INSERT OR IGNORE INTO discord_command_receipts(interaction_id,expires_at) VALUES(?,?)')
    .bind(interaction.id, now + 86400_000).run();
  if (!receipt.meta.changes) {
    return (await db.prepare('SELECT response FROM discord_command_receipts WHERE interaction_id=?')
      .bind(interaction.id).first<{ response: string | null }>())?.response ?? '同じ操作を処理中です。状態は /death status で確認できます。';
  }
  try {
    // The gate and all reservation writes share one transaction. A stop or newer
    // reservation between menu validation and this batch invalidates the old menu.
    const gateKey = 'death_apply:' + interaction.id;
    const gateSQL = expectedActions ? ' AND EXISTS(SELECT 1 FROM monitor_state WHERE key=?)' : '';
    const gateArgs = expectedActions ? [gateKey] : [];
    const gate = expectedActions ? [db.prepare(`INSERT OR IGNORE INTO monitor_state(key,value) SELECT ?,'1' WHERE ${expectedActions
      .map(() => "COALESCE((SELECT value FROM monitor_state WHERE key=?),'')=?").join(' AND ')}`)
      .bind(gateKey, ...expectedActions.flatMap(entry => [deathActionKey(entry.riotId), entry.value ?? '']))] : [];
    const marks = () => targets.map(player => db.prepare(`INSERT INTO monitor_state(key,value) SELECT ?,? WHERE 1=1${gateSQL} ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .bind(deathActionKey(player.riotId), interaction.id, ...gateArgs));
    if (action === 'start') {
      const changes = targets.flatMap(player => [
        db.prepare(`UPDATE death_unrated_sessions AS s SET cancelled_at=? WHERE riot_id=?
          AND match_id IS NULL AND cancelled_at IS NULL AND (expires_at<? OR ${sessionModeSQL}!=?)${gateSQL}`).bind(now, player.riotId, now, mode, ...gateArgs),
        db.prepare(`INSERT OR IGNORE INTO death_unrated_sessions(riot_id,session_id,armed_at,expires_at)
          SELECT ?,?,?,? WHERE 1=1${gateSQL}`).bind(player.riotId, interaction.id, now, now + 2 * 3600_000, ...gateArgs),
        db.prepare(`INSERT OR IGNORE INTO monitor_state(key,value) SELECT ?,? WHERE EXISTS(
          SELECT 1 FROM death_unrated_sessions WHERE riot_id=? AND session_id=?)${gateSQL}`)
          .bind(deathModeKey(interaction.id, player.riotId), mode, player.riotId, interaction.id, ...gateArgs),
      ]);
      const applied = await db.batch([...gate, ...changes, ...marks(), ...(expectedActions ? [db.prepare('DELETE FROM monitor_state WHERE key=?').bind(gateKey)] : [])]);
      if (expectedActions && !applied[0].meta.changes) {
        const changed = '予約状態が変わっています。/death start からやり直してください。';
        await db.prepare('UPDATE discord_command_receipts SET response=? WHERE interaction_id=?').bind(changed, interaction.id).run();
        return changed;
      }
    } else if (action === 'stop') {
      await db.batch([...targets.map(player => db.prepare('UPDATE death_unrated_sessions SET cancelled_at=? WHERE riot_id=? AND cancelled_at IS NULL')
        .bind(now, player.riotId)), ...marks()]);
    }
    const lines = await Promise.all(targets.map(async player => {
      const session = await db.prepare(`SELECT s.*,${sessionModeSQL} AS mode FROM death_unrated_sessions s WHERE riot_id=? ORDER BY armed_at DESC,session_id DESC LIMIT 1`)
        .bind(player.riotId).first<DeathSession>();
      const selected = isDeathMode(session?.mode) ? session.mode : 'unrated';
      const state = !session || session.cancelled_at !== null ? '通常プレイ（予約なし）'
        : session.match_id ? deathName(selected) + '：対象試合は決定済み・次の予約はOFF'
        : session.expires_at < now ? deathName(selected) + '：予約期限切れ'
        : '次の' + deathQueueName(selected) + '1試合だけ対象（' + new Date(session.expires_at + 9 * 3600_000).toISOString().slice(11, 16) + ' JSTまで）';
      return label(player) + '：' + state;
    }));
    const content = (action === 'start' ? '☠️ ' + deathName(mode) + '予約\n予約確定より後に始めて、期限内に終了する選択モードの次の1試合だけ判定します。同じモードの待機予約は維持し、別モードの待機予約は切り替えます。'
      : action === 'stop' ? '🕊️ デス予約を取り消しました。今後の未送信・追記も停止します。' : '📋 デス予約の状態')
      + '\n\n' + lines.join('\n');
    await db.prepare('UPDATE discord_command_receipts SET response=? WHERE interaction_id=?').bind(content, interaction.id).run();
    console.info('death_command', { action, mode, players: targets.length });
    return content;
  } catch {
    // No credential, interaction token or callback URL is ever printed or stored.
    console.warn('death_command_failed');
    const failure = '操作結果を確認できませんでした。DBの更新が適用済みか確認し、/death status で状態を確認してください。';
    try { await db.prepare('UPDATE discord_command_receipts SET response=? WHERE interaction_id=?').bind(failure, interaction.id).run(); } catch { /* Keep receipt so a replay cannot change a newer reservation. */ }
    return failure;
  }
}

export async function discordInteractions(request: Request, env: Env, ctx: ExecutionContext, config: DiscordConfig = storedConfig): Promise<Response> {
  if (new URL(request.url).pathname !== '/interactions') return new Response('Not found', { status: 404 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  if (!/^\d+$/.test(config.applicationId) || !/^\d+$/.test(config.guildId) || !/^[0-9a-f]{64}$/i.test(config.publicKey)) {
    return new Response('Discord commands are not configured', { status: 503 });
  }
  const signature = request.headers.get('X-Signature-Ed25519') ?? '';
  const timestamp = request.headers.get('X-Signature-Timestamp') ?? '';
  if (!/^[0-9a-f]{128}$/i.test(signature) || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return new Response('Unauthorized', { status: 401 });
  }
  const body = await request.text();
  if (body.length > 65536) return new Response('Request too large', { status: 413 });
  try {
    const key = await crypto.subtle.importKey('raw', unhex(config.publicKey), { name: 'Ed25519' }, false, ['verify']);
    if (!await crypto.subtle.verify('Ed25519', key, unhex(signature), new TextEncoder().encode(timestamp + body))) return new Response('Unauthorized', { status: 401 });
  } catch { return new Response('Unauthorized', { status: 401 }); }
  let interaction: Interaction;
  try { interaction = JSON.parse(body) as Interaction; } catch { return new Response('Invalid JSON', { status: 400 }); }
  if (interaction.application_id !== config.applicationId) return new Response('Unauthorized', { status: 401 });
  if (interaction.type === 1) return Response.json({ type: 1 });
  if (interaction.guild_id !== config.guildId) return respond('このサーバーでは利用できません。');
  let permissions = 0n;
  try { permissions = BigInt(interaction.member?.permissions ?? '0'); } catch { /* Deny invalid permission fields. */ }
  const deathSelect = interaction.type === 3 && /^death_mode:\d+$/.test(interaction.data?.custom_id ?? '');
  if ((interaction.data?.name === 'death' || deathSelect) && !(permissions & (8n | 32n))) return respond('開始・終了・状態確認には「管理者」または「サーバー管理」権限が必要です。');
  if (!deathSelect && (interaction.type !== 2 || !['death', 'valo'].includes(interaction.data?.name ?? ''))) return respond('対応していないコマンドです。');
  if (!/^\d+$/.test(interaction.id) || typeof interaction.token !== 'string' || !interaction.token.length || interaction.token.length > 4096) return new Response('Invalid interaction', { status: 400 });
  // Defer immediately so database work never consumes Discord's three-second acknowledgement window.
  ctx.waitUntil((async () => {
    let result: { content: string; components?: unknown[] };
    try {
      if (deathSelect) result = { content: await selectDeathMode(env.DB, interaction, configuredPlayers, runDeathCommand), components: [] };
      else if (interaction.data?.name === 'death' && interaction.data.options?.[0]?.name === 'start'
        && !interaction.data.options[0].options?.some(option => option.name === 'mode')) result = await deathModePicker(env.DB, interaction, configuredPlayers);
      else result = { content: interaction.data!.name === 'valo' ? await runValoCommand(env.DB, interaction) : await runDeathCommand(env.DB, interaction) };
    } catch { console.warn('discord_command_failed'); result = { content: '操作できませんでした。/death status または /valo status で状態を確認してください。', components: [] }; }
    try {
      const response = await fetch('https://discord.com/api/v10/webhooks/' + config.applicationId + '/' + encodeURIComponent(interaction.token!) + '/messages/@original', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...result, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) console.warn('discord_command_reply_failed', { status: response.status });
    } catch { console.warn('discord_command_reply_failed'); }
  })());
  return Response.json(deathSelect ? { type: 6 } : { type: 5, data: { flags: 64 } });
}
