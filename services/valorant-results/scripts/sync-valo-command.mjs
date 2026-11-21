import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { valoCommand } from '../src/valo-command.ts';

const base = 'https://discord.com/api/v10/applications/';
const snowflake = /^\d{15,22}$/;
function shapeOption(o) {
  return { name: o.name, type: o.type, description: o.description ?? '',
    required: o.required === true,
    choices: (o.choices ?? []).map(c => ({name:c.name,value:c.value})),
    options: (o.options ?? []).map(shapeOption) };
}
const shape = d => ({name:d.name,type:d.type,description:d.description,options:(d.options??[]).map(shapeOption)});
export async function syncValoCommand({config, token, request=fetch}) {
  if (!snowflake.test(config?.applicationId??'') || !snowflake.test(config?.guildId??'')) throw Error('Discordのアプリ・サーバー設定を確認してください。');
  if (typeof token !== 'string' || !token || /\s/.test(token)) throw Error('Discordコマンド登録用Bot Tokenが設定されていません。');
  const endpoint = base + config.applicationId + '/guilds/' + config.guildId + '/commands';
  const headers = { Authorization: 'Bot ' + token, 'Content-Type': 'application/json' };
  async function call(url,method,body) {
    const response = await request(url,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw Error('Discordの/valoコマンド確認・登録に失敗しました（HTTP '+response.status+'）');
    return response.json();
  }
  const registered = await call(endpoint,'GET');
  if (!Array.isArray(registered)) throw Error('Discordコマンド一覧を確認できませんでした。');
  const original = registered.find(c=>c.name==='valo'&&c.type===1);
  const desired = valoCommand();
  if (!desired.options?.some(o=>o.name==='coach')) throw Error('coachサブコマンドが未定義です。');
  if (original && JSON.stringify(shape(original))===JSON.stringify(shape(desired))) return 'unchanged';
  if (original && !snowflake.test(original.id??'')) throw Error('更新対象コマンドのIDを確認できません。');
  const updated = await call(original?endpoint+'/'+original.id:endpoint,original?'PATCH':'POST',desired);
  if (updated.name!=='valo'||updated.application_id!==config.applicationId||!updated.options?.some(o=>o.name==='coach')) throw Error('Discordの/valo coach登録結果を確認できませんでした。');
  return original?'updated':'created';
}

if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  const config = JSON.parse(readFileSync(new URL('../discord-config.json',import.meta.url),'utf8'));
  const result = await syncValoCommand({config,token:process.env.DISCORD_BOT_TOKEN});
  console.log('valo_coach_command_sync='+result);
}
