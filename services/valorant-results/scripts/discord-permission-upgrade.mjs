// Generate a guild-specific Discord OAuth2 permission upgrade link without changing production.
// No Discord API calls are performed; the server owner must approve the requested permissions.
import {readFileSync} from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../discord-config.json', import.meta.url), 'utf8'));
const appId = String(config.applicationId ?? '');
const guildId = String(config.guildId ?? '');
if (!/^\d{15,22}$/.test(appId) || !/^\d{15,22}$/.test(guildId)) {
  throw Error('discord-config.json に正しい applicationId と guildId が必要です。');
}

// Values from Discord's official permissions reference (1n << bit).
// Role management, custom emojis/stickers, moderation, kick, ban and admin are intentionally absent.
const permissions = Object.freeze({
  ADD_REACTIONS: 6,
  VIEW_CHANNEL: 10,
  SEND_MESSAGES: 11,
  EMBED_LINKS: 14,
  ATTACH_FILES: 15,
  READ_MESSAGE_HISTORY: 16,
  MENTION_EVERYONE: 17,
  MOVE_MEMBERS: 24,
  CONNECT: 20,
  SPEAK: 21,
  USE_APPLICATION_COMMANDS: 31,
  CREATE_PUBLIC_THREADS: 35,
  SEND_MESSAGES_IN_THREADS: 38,
  USE_EMBEDDED_ACTIVITIES: 39,
  USE_SOUNDBOARD: 42,
  CREATE_EVENTS: 44,
  USE_EXTERNAL_SOUNDS: 45,
  SET_VOICE_CHANNEL_STATUS: 48,
  SEND_POLLS: 49,
  PIN_MESSAGES: 51,
});
// Extra capabilities must be explicitly opted in; none has server-wide moderation power.
const optionalPermissions = Object.freeze({CREATE_PRIVATE_THREADS: 36});
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--with-private-threads')) {
  throw Error('使用法: node scripts/discord-permission-upgrade.mjs [--with-private-threads]');
}
const flags = {...permissions, ...(args.includes('--with-private-threads') ? {CREATE_PRIVATE_THREADS: optionalPermissions.CREATE_PRIVATE_THREADS} : {})};
const mask = Object.values(flags).reduce((acc, bit) => acc | (1n << BigInt(bit)), 0n);
for (const forbiddenBit of [1, 2, 3, 4, 5, 13, 17, 22, 23, 27, 28, 29, 30, 33, 34, 40, 43]) {
  if ((mask & (1n << BigInt(forbiddenBit))) !== 0n) throw Error('禁止した権限が含まれています。');
}
const link = new URL('https://discord.com/oauth2/authorize');
link.searchParams.set('client_id', appId);
link.searchParams.set('scope', 'bot applications.commands');
link.searchParams.set('permissions', mask.toString());
link.searchParams.set('guild_id', guildId);
link.searchParams.set('disable_guild_select', 'true');
console.log('選択した権限:', Object.keys(flags).join(', '));
console.log('権限整数:', mask.toString());
console.log('承認用リンク（操作は管理者がDiscord上で行います）:\n' + link);
console.log('注意: 権限承認だけでは未実装の機能は動作しません。Gateway Privileged Intentsも別途設定が必要です。');
console.log('メンバー移動は参加者の明示的同意があるチーム分けに限ります。非公開スレッドは --with-private-threads を明示した場合だけ追加します。');
console.log('管理系の権限 (MANAGE_CHANNELS / MANAGE_EVENTS / MANAGE_THREADS 等) は要求しません。');
