import configuredPlayers from '../players.json' with { type: 'json' };
import type { Player } from './index.ts';
import type { Interaction } from './discord-interactions.ts';
import type { Notice, Outcome } from './results.ts';

const clean = (value: string, size = 40) => value.replace(/[\r\n`*_~|<>]/g, '').slice(0, size);
const label = (player: Player) => clean(player.name || player.riotId.split('#')[0]);
const time = (value: number) => Number.isFinite(value) && value > 0
  ? new Date(value + 9 * 3600_000).toISOString().slice(5, 16).replace('T', ' ') + ' JST' : '未記録';
interface Period { since: number; until: number }
interface Act { act_id: string; act_name: string | null }
interface Totals { wins: number; losses: number; draws: number }
const totals = (rows: { outcome: Outcome }[]): Totals => ({ wins: rows.filter(row => row.outcome === 'win').length,
  losses: rows.filter(row => row.outcome === 'loss').length, draws: rows.filter(row => row.outcome === 'draw').length });
function summary(count: Totals): string {
  const games = count.wins + count.losses;
  return `${count.wins}勝${count.losses}敗${count.draws}分｜勝率${games ? (count.wins / games * 100).toFixed(1) + '%' : '—'}（引分除く）`;
}
function streak(rows: { outcome: Outcome }[]): string {
  const last = rows[0]?.outcome;
  if (!last) return '記録なし';
  if (last === 'draw') return '連勝・連敗なし（引き分けでリセット）';
  const end = rows.findIndex(row => row.outcome !== last);
  return (end < 0 ? rows.length : end) + '連' + (last === 'win' ? '勝' : '敗');
}
async function latestAct(db: D1Database, players: Player[], mode: string): Promise<Act | null> {
  if (!players.length) return null;
  return db.prepare(`SELECT act_id,act_name FROM notifications WHERE riot_id IN (${players.map(() => '?').join(',')})
    AND mode=? AND act_id IS NOT NULL AND outcome IN ('win','loss','draw') ORDER BY ended_at DESC,match_id DESC LIMIT 1`)
    .bind(...players.map(player => player.riotId), mode).first<Act>();
}
async function history(db: D1Database, player: Player, mode: string, period: Act | Period) {
  return (await db.prepare(`SELECT outcome FROM notifications WHERE riot_id=? AND mode=?
    AND ${'since' in period ? 'ended_at>=? AND ended_at<?' : 'act_id=?'}
    AND outcome IN ('win','loss','draw') ORDER BY ended_at DESC,match_id DESC`)
    .bind(player.riotId, mode, ...('since' in period ? [period.since, period.until] : [period.act_id]))
    .all<{ outcome: Outcome }>()).results;
}
const help = `📖 コマンド一覧
/valo today [player] [mode]：今日の勝敗・勝率・今日の連勝連敗
/valo yesterday [player] [mode]：昨日の成績
/valo week [player] [mode]：今週の成績（月曜から）
/valo act [player] [mode]：最新ACTの勝敗・勝率・連勝連敗
/valo recent player [mode]：直近3試合と個人成績
/valo pair player partner [mode]：最新ACTの同チーム成績
/valo versus player partner [mode]：最新ACTの直接対決
/valo compare player partner [mode]：最新ACTの2人成績比較
/valo streaks [player] [mode]：ACT内の最長連勝・最長連敗
/valo players：登録者・Riot IDの一覧
/valo ranking [mode]：最新ACTの勝率ランキング
/valo status：監視・API待機・送信待ちの状況

☠️ デスアンレ（管理者・サーバー管理権限）
/death start player [player2…]：次のアンレ1試合だけ予約
/death stop [player]：取消（省略で全員）
/death status：予約を確認

戦績は監視開始後の記録分です。mode省略はコンペ、today/yesterday/week/act/streaksのplayer省略は全員。日付は日本時間、勝率は引き分けを除きます。返答は操作した本人だけに表示します。`;

export async function runValoCommand(db: D1Database, interaction: Interaction, players: Player[] = configuredPlayers): Promise<string> {
  const action = interaction.data?.options?.[0];
  const allowed: Record<string, string[]> = { yesterday: ['player', 'mode'], week: ['player', 'mode'], streaks: ['player', 'mode'], players: [],
    versus: ['player', 'partner', 'mode'], compare: ['player', 'partner', 'mode'], today: ['player', 'mode'], act: ['player', 'mode'], recent: ['player', 'mode'],
    pair: ['player', 'partner', 'mode'], ranking: ['mode'], status: [], help: [] };
  if (!action || action.type !== 1 || !Object.hasOwn(allowed, action.name) || interaction.data?.options?.length !== 1) return help;
  const options = action.options ?? [];
  if (options.some(option => option.type !== 3 || !allowed[action.name].includes(option.name) || typeof option.value !== 'string')
    || new Set(options.map(option => option.name)).size !== options.length) return '選択肢から指定してください。使い方は /valo help で確認できます。';
  const values = Object.fromEntries(options.map(option => [option.name, option.value!]));
  if (values.mode && !['competitive', 'escalation'].includes(values.mode)) return 'モードはコンペかエスカレーションを選んでください。';
  const mode = values.mode || 'competitive', modeName = mode === 'competitive' ? 'コンペ' : 'エスカレーション';
  for (const key of ['player', 'partner']) {
    if (values[key] && !(key === 'player' && ['today', 'yesterday', 'week', 'act', 'streaks'].includes(action.name) && values[key] === 'all')
      && !players.some(player => player.riotId === values[key])) return '対象者は登録済みの選択肢から選んでください。';
  }
  const twoPlayers = ['pair', 'versus', 'compare'].includes(action.name);
  if (((action.name === 'recent' || twoPlayers) && !values.player) || (twoPlayers && !values.partner)) return '対象者を指定してください。';
  if (twoPlayers && values.player === values.partner) return 'ペアは異なる2人を選んでください。';
  if (action.name === 'help') return help;
  if (!players.length) return '対象者が登録されていません。';
  if (action.name === 'players') return '👥 登録者\n' + players.map(player => label(player) + '：' + clean(player.riotId, 100)).join('\n');
  const targets = !values.player || values.player === 'all' ? players : players.filter(player => player.riotId === values.player);
  if (action.name === 'status') {
    const states = (await db.prepare("SELECT key,value FROM monitor_state WHERE key IN ('monitor_started','monitor_finished','api_after','discord_after') OR key LIKE 'checked:%'").all<{ key: string; value: string }>()).results;
    const state = new Map(states.map(row => [row.key, Number(row.value)]));
    const queue = await db.prepare(`SELECT COUNT(DISTINCT match_id) AS n FROM notifications WHERE sent=0 AND
      (mode IS NULL OR mode!='unrated' OR EXISTS(SELECT 1 FROM death_unrated_sessions s WHERE s.riot_id=notifications.riot_id
      AND s.match_id=notifications.match_id AND s.cancelled_at IS NULL))`).first<{ n: number }>();
    const lines = await Promise.all(players.map(async player => {
      const account = await db.prepare('SELECT since FROM tracked_players WHERE riot_id=?').bind(player.riotId).first<{ since: number }>();
      return label(player) + '：' + (account ? '最終取得 ' + time(state.get('checked:' + player.riotId) ?? 0) : 'ID解決待ち');
    }));
    let timingText = '直近の新規通知時間：未記録';
    try {
      const saved = await db.prepare("SELECT value FROM monitor_state WHERE key='delivery:last'").first<{ value: string }>();
      const timing = JSON.parse(saved?.value ?? 'null') as { finishToDetectionMs: number; detectionToDiscordMs: number; deliveredAt: number } | null;
      if (timing && [timing.finishToDetectionMs, timing.detectionToDiscordMs, timing.deliveredAt].every(value => Number.isFinite(value) && value >= 0)) {
        const elapsed = (ms: number) => { const seconds = Math.ceil(ms / 1000); return Math.floor(seconds / 60) + '分' + seconds % 60 + '秒'; };
        timingText = '直近の新規通知（' + time(timing.deliveredAt) + '）\n終了→Bot検知：' + elapsed(timing.finishToDetectionMs)
          + '\n検知→Discord送信：' + elapsed(timing.detectionToDiscordMs);
      }
    } catch { /* Older deployments may not have timing data yet. */ }
    const waiting = (key: string) => (state.get(key) ?? 0) > Date.now() ? time(state.get(key)!) + 'まで待機' : '待機なし';
    return `🔎 監視状況（全モード・毎分確認）\n最終実行開始：${time(state.get('monitor_started') ?? 0)}\n最終実行終了：${time(state.get('monitor_finished') ?? 0)}\nHenrik API：${waiting('api_after')}\nDiscord送信：${waiting('discord_after')}\n送信待ち：${queue?.n ?? 0}試合\n\n${lines.join('\n')}\n\n${timingText}\n\n最終取得は試合履歴の取得・保存処理を終えた時刻です。API反映待ちで結果が遅れる場合があります。更新直後は時刻が未記録の場合があります。`;
  }
  if (action.name === 'recent') {
    const rows = (await db.prepare(`SELECT * FROM notifications WHERE riot_id=? AND mode=? AND outcome IN ('win','loss','draw')
      ORDER BY ended_at DESC,match_id DESC LIMIT 3`).bind(targets[0].riotId, mode).all<Notice>()).results;
    return `🕒 ${label(targets[0])}の直近3試合｜${modeName}（記録分）\n\n` + (rows.length ? rows.map(row =>
      time(row.ended_at) + '\n' + row.message.split('\n').slice(0, 3).join('\n').slice(0, 430)).join('\n\n') : 'まだ試合の記録がありません。');
  }
  const date = new Date(Date.now() + 9 * 3600_000);
  const midnight = Date.parse(date.toISOString().slice(0, 10) + 'T00:00:00+09:00');
  const periodNames: Record<string, string> = { today: '今日', yesterday: '昨日', week: '今週' };
  const periodName = periodNames[action.name];
  const since = action.name === 'yesterday' ? midnight - 86400_000
    : action.name === 'week' ? midnight - ((date.getUTCDay() + 6) % 7) * 86400_000 : midnight;
  const period: Period = { since, until: action.name === 'yesterday' ? midnight : Date.now() + 1 };
  const act = periodName ? null : await latestAct(db, players, mode);
  const heading = periodName ? periodName + ' ' + new Date(since + 9 * 3600_000).toISOString().slice(0, 10) + (action.name === 'week' ? '〜現在（JST）' : '（JST）')
    : '最新の記録ACT ' + clean(act?.act_name || act?.act_id || '未取得', 60);
  if (!periodName && !act) return `${modeName}のACT情報が付いた記録はまだありません。`;
  if (action.name === 'pair' || action.name === 'versus') {
    const partner = players.find(player => player.riotId === values.partner)!;
    const versus = action.name === 'versus';
    const rows = (await db.prepare(`SELECT a.outcome FROM notifications a JOIN notifications b ON a.match_id=b.match_id
      AND ${versus ? "a.team_id!=b.team_id AND ((a.outcome='win' AND b.outcome='loss') OR (a.outcome='loss' AND b.outcome='win') OR (a.outcome='draw' AND b.outcome='draw'))" : 'a.team_id=b.team_id AND a.outcome=b.outcome'} WHERE a.riot_id=? AND b.riot_id=? AND a.mode=? AND b.mode=?
      AND a.act_id=? AND b.act_id=? AND a.team_id IS NOT NULL AND a.team_id!='' AND b.team_id IS NOT NULL AND b.team_id!='' AND a.outcome IN ('win','loss','draw')`)
      .bind(targets[0].riotId, partner.riotId, mode, mode, act!.act_id, act!.act_id).all<{ outcome: Outcome }>()).results;
    const count = totals(rows), games = count.wins + count.losses;
    if (versus) return `⚔️ ${label(targets[0])} vs ${label(partner)}\n${heading}｜${modeName}（記録分）\n${label(targets[0])}側：${summary(count)}\n` + (!rows.length ? 'このACTで敵同士だった記録はまだありません。' : '敵同士の試合だけ集計。引き分けは勝率から除外します。');
    const comment = !rows.length ? 'このACTで同じチームだった記録はまだありません。' : games < 5 ? '相性はまだ調査中！'
      : count.wins / games >= 0.7 ? 'このコンビ、解散禁止！' : count.wins / games <= 0.3 ? '友情は本物、勝ち星は別問題！' : '息は合う。勝ち星も合わせてこ！';
    return `🤝 ${label(targets[0])}＋${label(partner)}\n${heading}｜${modeName}（記録分）\n${summary(count)}\n💬 ${comment}\n同じチームで参加した試合だけを集計します。`;
  }
  const selected = action.name === 'compare' ? players.filter(player => [values.player, values.partner].includes(player.riotId)) : targets;
  const results = await Promise.all(selected.map(async player => {
    const rows = await history(db, player, mode, periodName ? period : act!);
    return { player, rows, ...totals(rows) };
  }));
  if (action.name === 'streaks') return '🔥 最長連勝・連敗｜' + heading + '｜' + modeName + '（記録分）\n\n'
    + results.map(row => {
      let wins = 0, losses = 0, maxWins = 0, maxLosses = 0;
      for (const result of [...row.rows].reverse()) {
        wins = result.outcome === 'win' ? wins + 1 : 0;
        losses = result.outcome === 'loss' ? losses + 1 : 0;
        maxWins = Math.max(maxWins, wins); maxLosses = Math.max(maxLosses, losses);
      }
      return label(row.player) + '：最長' + maxWins + '連勝／最長' + maxLosses + '連敗\n現在：' + streak(row.rows);
    }).join('\n\n') + '\n\n引き分けで連勝・連敗を区切ります。';
  if (action.name === 'ranking') {
    results.sort((a, b) => {
      const an = a.wins + a.losses, bn = b.wins + b.losses;
      if (!an || !bn) return Number(Boolean(bn)) - Number(Boolean(an));
      return b.wins * an - a.wins * bn;
    });
    let rank = 0;
    const lines = results.map((row, index) => {
      const games = row.wins + row.losses, previous = results[index - 1];
      if (!games) return '— ' + label(row.player) + '：' + summary(row);
      if (!previous || previous.wins * games !== row.wins * (previous.wins + previous.losses)) rank = index + 1;
      return `${rank}位 ${label(row.player)}：${summary(row)}${games < 5 ? ' ※5試合未満' : ''}`;
    });
    return `🏆 勝率ランキング｜${heading}｜${modeName}（記録分）\n${lines.join('\n')}\n\n勝率が同じなら同順位。勝敗の付いた記録がない人は順位対象外です。`;
  }
  return `${action.name === 'compare' ? '⚖️ 成績比較｜' : '📊 '}${heading}｜${modeName}（記録分）\n\n` + results.map(row => `${label(row.player)}：${summary(row)}\n${periodName ? periodName + 'の最後：' : '現在：'}${streak(row.rows)}`).join('\n\n')
    + (periodName ? '\n\n連勝・連敗は選んだ期間の記録内で集計します。' : '\n\n登録者の最新の記録ACTを共通で使います。導入前の履歴は含みません。');
}