import { valoCommand } from './valo-command.ts';
import players from '../players.json' with { type: 'json' };
import { deathModes } from './death-modes.ts';

export function deathCommand(configured = players) {
  const choices = configured.map(player => ({ name: player.name || player.riotId.split('#')[0], value: player.riotId }));
  const targets = (required: boolean) => Array.from({ length: configured.length }, (_, n) => ({
    type: 3, name: n ? 'player' + (n + 1) : 'player',
    description: n ? '追加の対象者' : '対象者を選択（全員も選べます）', required: required && n === 0,
    choices: n ? choices : [{ name: '登録者全員', value: 'all' }, ...choices],
  }));
  return {
    name: 'death', description: 'アンレ／スイフトの次の1試合をデス判定として予約・取消・状態確認',
    type: 1, default_member_permissions: '32',
    options: [
      { type: 1, name: 'start', description: '対象者を選び、モード選択で次の1試合を予約（2時間で期限切れ）', options: [...targets(true),
        { type: 3, name: 'mode', description: '省略時は選択メニューを表示', required: false, choices: deathModes.map(mode => ({ name: mode.name, value: mode.value })) }] },
      { type: 1, name: 'stop', description: '選んだ人のデス予約を取り消す（省略で全員）', options: targets(false) },
      { type: 1, name: 'status', description: '対象者・予約モード・期限を確認' },
    ],
  };
}
export function discordCommands(configured = players) { return [deathCommand(configured), valoCommand(configured)] as const; }
