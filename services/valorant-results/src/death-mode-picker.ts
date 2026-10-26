import { deathActionKey, deathModes, isDeathMode } from './death-modes.ts';
import { deathRequest } from './death-request.ts';
import type { Interaction } from './discord-interactions.ts';
import type { Player } from './index.ts';
import type { ExpectedDeathAction } from './death-modes.ts';

interface Picker { kind: 'death-mode-picker'; userId: string; targets: string[]; actions: Array<string | null>; selected?: { id: string; mode: string } }
const expired = 'このモード選択は期限切れです。/death start からやり直してください。';
const used = 'このメニューは選択済みです。/death status で確認してください。変更する場合は /death start をもう一度実行してください。';
const clean = (value: string) => value.replace(/[\r\n`*_~|<>]/g, '').slice(0, 80);

export async function deathModePicker(db: D1Database, interaction: Interaction, players: Player[]) {
  const request = deathRequest(interaction, players);
  if ('error' in request) return { content: request.error, components: [] };
  const userId = interaction.member?.user?.id;
  if (!userId || !/^\d+$/.test(userId)) return { content: '操作した本人を確認できませんでした。/death start からやり直してください。', components: [] };
  const actions = await Promise.all(request.targets.map(async player => (await db.prepare('SELECT value FROM monitor_state WHERE key=?')
    .bind(deathActionKey(player.riotId)).first<{ value: string }>())?.value ?? null));
  const state: Picker = { kind: 'death-mode-picker', userId, targets: request.targets.map(player => player.riotId), actions };
  await db.prepare('INSERT OR IGNORE INTO discord_command_receipts(interaction_id,expires_at,response) VALUES(?,?,?)')
    .bind(interaction.id, Date.now() + 10 * 60_000, JSON.stringify(state)).run();
  const stored = await db.prepare('SELECT response,expires_at FROM discord_command_receipts WHERE interaction_id=?')
    .bind(interaction.id).first<{ response: string; expires_at: number }>();
  if (!stored || stored.expires_at < Date.now()) return { content: expired, components: [] };
  let saved: Picker;
  try { saved = JSON.parse(stored.response) as Picker; } catch { return { content: stored.response, components: [] }; }
  if (saved.kind !== 'death-mode-picker' || saved.userId !== userId || saved.selected) return { content: used, components: [] };
  const names = saved.targets.map(id => players.find(player => player.riotId === id)).filter((player): player is Player => Boolean(player))
    .map(player => clean(player.name || player.riotId.split('#')[0]));
  return { content: '☠️ 対象：' + names.join('・') + '\nモードを選んで予約を確定してください（10分以内）。選択するまでは予約されません。\nカスタム等はAPIの履歴が必要です。最終R・味方5人などが取得できない条件は判定保留になります。',
    components: [{ type: 1, components: [{ type: 3, custom_id: 'death_mode:' + interaction.id, placeholder: '判定対象のモードを選択', min_values: 1, max_values: 1,
      options: deathModes.map(mode => ({ label: mode.name, value: mode.value, description: ['unrated','swiftplay','competitive','spikerush','onefa'].includes(mode.value) ? '次の1試合を判定（予約後2時間以内）' : 'APIの履歴が必要。ラウンド・味方情報がない条件は保留' })) }] }] };
}

export async function selectDeathMode(db: D1Database, interaction: Interaction, players: Player[], apply: (db: D1Database, interaction: Interaction, players: Player[], expectedActions?: ExpectedDeathAction[]) => Promise<string>): Promise<string> {
  const id = /^death_mode:(\d+)$/.exec(interaction.data?.custom_id ?? '')?.[1];
  const mode = interaction.data?.values?.[0];
  if (!id || interaction.data?.component_type !== 3 || interaction.data.values?.length !== 1 || !isDeathMode(mode)) return 'モードは表示された選択肢から選んでください。';
  const row = await db.prepare('SELECT response,expires_at FROM discord_command_receipts WHERE interaction_id=?')
    .bind(id).first<{ response: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return expired;
  let state: Picker;
  try { state = JSON.parse(row.response) as Picker; } catch { return used; }
  if (state.kind !== 'death-mode-picker' || state.userId !== interaction.member?.user?.id) return 'モードを選べるのは /death start を実行した本人だけです。';
  if (!Array.isArray(state.targets) || !state.targets.length || state.targets.some(id => !players.some(player => player.riotId === id))) return '対象者の登録が変わっています。/death start からやり直してください。';
  if (state.selected && (state.selected.id !== interaction.id || state.selected.mode !== mode)) return used;
  if (!state.selected) {
    const actions = await Promise.all(state.targets.map(async riotId => (await db.prepare('SELECT value FROM monitor_state WHERE key=?')
      .bind(deathActionKey(riotId)).first<{ value: string }>())?.value ?? null));
    if (JSON.stringify(actions) !== JSON.stringify(state.actions)) return '予約状態が変わっています。/death start からやり直してください。';
    state.selected = { id: interaction.id, mode };
    const claimed = await db.prepare('UPDATE discord_command_receipts SET response=? WHERE interaction_id=? AND response=? AND expires_at>=?')
      .bind(JSON.stringify(state), id, row.response, Date.now()).run();
    if (!claimed.meta.changes) return used;
  }
  return apply(db, { ...interaction, type: 2, data: { name: 'death', options: [{ type: 1, name: 'start', options: [
    ...state.targets.map((value, n) => ({ type: 3, name: n ? 'player' + (n + 1) : 'player', value })),
    { type: 3, name: 'mode', value: mode },
  ] }] } }, players, state.targets.map((riotId, n) => ({ riotId, value: state.actions[n] })));
}
