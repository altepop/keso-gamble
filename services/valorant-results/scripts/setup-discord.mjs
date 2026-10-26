import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { discordCommands } from '../src/discord-command.ts';

const configPath = new URL('../discord-config.json', import.meta.url);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
let muted = false;
const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
const input = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
try {
  for (const [field, prompt, pattern] of [
    ['applicationId', 'Application ID', /^\d{15,22}$/],
    ['publicKey', 'Public Key', /^[a-f0-9]{64}$/i],
    ['guildId', '通知先のDiscordサーバーID', /^\d{15,22}$/],
  ]) {
    const value = (await input.question(prompt + (config[field] ? '（Enterで保存済みの値）' : '') + ': ')).trim() || config[field];
    if (!pattern.test(value)) throw new Error(prompt + 'の形式が違います。');
    config[field] = value;
  }
  const install = new URL('https://discord.com/oauth2/authorize');
  install.searchParams.set('client_id', config.applicationId);
  install.searchParams.set('scope', 'applications.commands');
  install.searchParams.set('integration_type', '0');
  install.searchParams.set('guild_id', config.guildId);
  install.searchParams.set('disable_guild_select', 'true');
  console.log('\n次のURLを開き、通知先サーバーにアプリを追加してください。\n' + install);
  await input.question('追加済みならEnter: ');
  process.stdout.write('Bot Tokenを入力（表示・保存しません）: ');
  muted = true;
  const token = (await input.question('')).trim();
  muted = false; process.stdout.write('\n');
  if (!token || /\s/.test(token)) throw new Error('Bot Tokenを確認してください。');
  for (const definition of discordCommands()) {
    const response = await fetch('https://discord.com/api/v10/applications/' + config.applicationId + '/guilds/' + config.guildId + '/commands', {
      method: 'POST', headers: { Authorization: 'Bot ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(definition), signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error('Discordへのコマンド登録に失敗しました（HTTP ' + response.status + '）。サーバー追加・ID・Tokenを確認してください。');
    const command = await response.json();
    if (command.name !== definition.name || command.application_id !== config.applicationId) throw new Error('登録結果を確認できませんでした。');
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log('\n/death と /valo の登録と公開設定の保存が完了しました。Bot Tokenは保存していません。');
  console.log('続けて npm.cmd run db:remote と npm.cmd run deploy を実行してください。');
  console.log('配置後、Developer PortalのGeneral InformationにあるInteractions Endpoint URLに次を設定して保存します。');
  console.log(config.workerUrl.replace(/\/$/, '') + '/interactions');
} catch (error) {
  muted = false;
  console.error(error instanceof Error && !/fetch failed|network|timeout/i.test(error.message) ? error.message : 'Discordに接続できませんでした。ネットワークを確認してください。');
  process.exitCode = 1;
} finally { input.close(); }