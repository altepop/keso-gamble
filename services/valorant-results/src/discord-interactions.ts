import { runValoCommand } from './valo-queries.ts';
import storedConfig from '../discord-config.json' with { type: 'json' };
import configuredPlayers from '../players.json' with { type: 'json' };
import type { Env, Player } from './index.ts';
import type { DeathSession } from './death-sessions.ts';

export interface DiscordConfig { applicationId: string; publicKey: string; guildId: string; workerUrl?: string }
interface Option { type: number; name: string; value?: string; options?: Option[] }
export interface Interaction {
  id: string; application_id: string; type: number; token?: string; guild_id?: string;
  member?: { permissions?: string }; data?: { name: string; options?: Option[] };
}
const respond = (content: string) => Response.json({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });
const unhex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], byte => parseInt(byte, 16));
const label = (player: Player) => (player.name || player.riotId.split('#')[0]).replace(/[\r\n`*_~|<>]/g, '').slice(0, 80);

export async function runDeathCommand(db: D1Database, interaction: Interaction, players: Player[] = configuredPlayers): Promise<string> {
  const action = interaction.data?.options?.[0];
  if (!action || action.type !== 1 || !['start', 'stop', 'status'].includes(action.name)) return '使い方：/death start、/death stop、/death status';
  const options = action.options ?? [];
  if (options.some(option => option.type !== 3 || !/^player[2-5]?$/.test(option.name) || typeof option.value !== 'string')) return '対象者は登録済みの選択肢から選んでください。';
  if (action.name === 'start' && !options.length) return 'playerで対象者を選んでください。';
  const ids = options.map(option => option.value!);
  if (ids.some(id => id !== 'all' && !players.some(player => player.riotId === id))) return '登録から外れた対象者が含まれています。コマンドの選択肢を更新してください。';
  const targets = action.name === 'status' || !ids.length || ids.includes('all') ? players : players.filter(player => ids.includes(player.riotId));
  if (!targets.length) return '対象者が登録されていません。';
  const now = Date.now();
  const receipt = await db.prepare('INSERT OR IGNORE INTO discord_command_receipts(interaction_id,expires_at) VALUES(?,?)')
    .bind(interaction.id, now + 86400_000).run();
  if (!receipt.meta.changes) {
    return (await db.prepare('SELECT response FROM discord_command_receipts WHERE interaction_id=?')
      .bind(interaction.id).first<{ response: string | null }>())?.response ?? '同じ操作を処理中です。状態は /death status で確認できます。';
  }
  try {
    if (action.name === 'start') {
      const changes = targets.flatMap(player => [
        db.prepare(`UPDATE death_unrated_sessions SET cancelled_at=? WHERE riot_id=?
          AND match_id IS NULL AND cancelled_at IS NULL AND expires_at<?`).bind(now, player.riotId, now),
        db.prepare(`INSERT OR IGNORE INTO death_unrated_sessions(riot_id,session_id,armed_at,expires_at)
          VALUES(?,?,?,?)`).bind(player.riotId, interaction.id, now, now + 2 * 3600_000),
      ]);
      await db.batch(changes);
    } else if (action.name === 'stop') {
      await db.batch(targets.map(player => db.prepare('UPDATE death_unrated_sessions SET cancelled_at=? WHERE riot_id=? AND cancelled_at IS NULL')
        .bind(now, player.riotId)));
    }
    const lines = await Promise.all(targets.map(async player => {
      const session = await db.prepare('SELECT * FROM death_unrated_sessions WHERE riot_id=? ORDER BY armed_at DESC,session_id DESC LIMIT 1')
        .bind(player.riotId).first<DeathSession>();
      const state = !session || session.cancelled_at !== null ? '通常アンレ（予約なし）'
        : session.match_id ? '対象試合は決定済み・次の予約はOFF'
        : session.expires_at < now ? '通常アンレ（予約期限切れ）'
        : '次のアンレ1試合だけ対象（' + new Date(session.expires_at + 9 * 3600_000).toISOString().slice(11, 16) + ' JSTまで）';
      return label(player) + '：' + state;
    }));
    const content = (action.name === 'start' ? '☠️ デスアンレ予約\n開始操作より後に始めて、期限内に終了する次の1試合だけ判定します。既存の待機予約は維持します。'
      : action.name === 'stop' ? '🕊️ デスアンレを取り消しました。今後の未送信・追記も停止します。' : '📋 デスアンレの状態')
      + '\n\n' + lines.join('\n');
    await db.prepare('UPDATE discord_command_receipts SET response=? WHERE interaction_id=?').bind(content, interaction.id).run();
    console.info('death_command', { action: action.name, players: targets.length });
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
  if (interaction.data?.name === 'death' && !(permissions & (8n | 32n))) return respond('開始・終了・状態確認には「管理者」または「サーバー管理」権限が必要です。');
  if (interaction.type !== 2 || !['death', 'valo'].includes(interaction.data?.name ?? '')) return respond('対応していないコマンドです。');
  if (!/^\d+$/.test(interaction.id) || typeof interaction.token !== 'string' || !interaction.token.length || interaction.token.length > 4096) return new Response('Invalid interaction', { status: 400 });
  // Defer immediately so database work never consumes Discord's three-second acknowledgement window.
  ctx.waitUntil((async () => {
    let content: string;
    try { content = interaction.data!.name === 'valo' ? await runValoCommand(env.DB, interaction) : await runDeathCommand(env.DB, interaction); }
    catch { console.warn('discord_command_failed'); content = '操作できませんでした。DBの更新を適用し、/valo status で確認してください。'; }
    try {
      const response = await fetch('https://discord.com/api/v10/webhooks/' + config.applicationId + '/' + encodeURIComponent(interaction.token!) + '/messages/@original', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) console.warn('discord_command_reply_failed', { status: response.status });
    } catch { console.warn('discord_command_reply_failed'); }
  })());
  return Response.json({ type: 5, data: { flags: 64 } });
}