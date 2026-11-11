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
  CONNECT: 20,
  SPEAK: 21,
  MOVE_MEMBERS: 24,
  USE_APPLICATION_COMMANDS: 31,
  MANAGE_EVENTS: 33,
  MANAGE_THREADS: 34,
  CREATE_PUBLIC_THREADS: 35,
  CREATE_PRIVATE_THREADS: 36,
  SEND_MESSAGES_IN_THREADS: 38,
  USE_EMBEDDED_ACTIVITIES: 39,
  USE_SOUNDBOARD: 42,
  CREATE_EVENTS: 44,
  USE_EXTERNAL_SOUNDS: 45,
  SET_VOICE_CHANNEL_STATUS: 48,
  SEND_POLLS: 49,
  PIN_MESSAGES: 51,
});
const optionalPermissions = Object.freeze({MANAGE_CHANNELS: 4});
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--with-channel-management')) {
  throw Error('使用法: node scripts/discord-permission-upgrade.mjs [--with-channel-management]');
}
const full = args.includes('--with-channel-management');
const flags = {...permissions, ...(full ? optionalPermissions : {})};
const mask = Object.values(flags).reduce((acc, bit) => acc | (1n << BigInt(bit)), 0n);
for (const forbiddenBit of [1, 2, 3, 28, 30, 43]) {
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
console.log('MANAGE_CHANNELS はサーバー内のチャンネル編集・削除を許可する強い権限です。必要な場合のみ --with-channel-management を使用してください。');
