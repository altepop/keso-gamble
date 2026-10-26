import { isDeathMode } from './death-modes.ts';
import type { DeathMode } from './death-modes.ts';
import type { Interaction } from './discord-interactions.ts';
import type { Player } from './index.ts';

export function deathRequest(interaction: Interaction, players: Player[]): { error: string } | { action: 'start' | 'stop' | 'status'; targets: Player[]; mode?: DeathMode } {
  const action = interaction.data?.options?.[0];
  if (!action || action.type !== 1 || !['start', 'stop', 'status'].includes(action.name) || interaction.data?.options?.length !== 1) return { error: '使い方：/death start、/death stop、/death status' };
  const options = action.options ?? [];
  if (new Set(options.map(option => option.name)).size !== options.length || options.some(option => option.type !== 3
    || !(/^player[2-5]?$/.test(option.name) || (action.name === 'start' && option.name === 'mode')) || typeof option.value !== 'string')) return { error: '対象者とモードは選択肢から選んでください。' };
  const mode = options.find(option => option.name === 'mode')?.value;
  if (mode !== undefined && !isDeathMode(mode)) return { error: 'モードは表示された選択肢から選んでください。' };
  const ids = options.filter(option => option.name !== 'mode').map(option => option.value!);
  if (action.name === 'start' && !ids.length) return { error: 'playerで対象者を選んでください。' };
  if (ids.some(id => id !== 'all' && !players.some(player => player.riotId === id))) return { error: '登録から外れた対象者が含まれています。コマンドの選択肢を更新してください。' };
  const targets = action.name === 'status' || !ids.length || ids.includes('all') ? players : players.filter(player => ids.includes(player.riotId));
  if (!targets.length) return { error: '対象者が登録されていません。' };
  return { action: action.name as 'start' | 'stop' | 'status', targets, ...(isDeathMode(mode) ? { mode } : {}) };
}
