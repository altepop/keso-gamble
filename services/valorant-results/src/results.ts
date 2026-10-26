import { deathUnratedMessage } from './death-unrated.ts';
import taunts from '../taunts.json' with { type: 'json' };

export type Outcome = 'win' | 'loss' | 'draw';
export interface Match {
  metadata: {
    match_id: string; is_completed: boolean; started_at: string;
    game_length_in_ms: number; queue: { id: string };
    season?: { id?: string; short?: string } | null;
    map?: { name?: string } | null;
  };
  players: Array<{
    puuid: string; team_id: string; agent?: { name?: string } | null;
    stats?: { kills?: number; deaths?: number; assists?: number; score?: number; headshots?: number; bodyshots?: number; legshots?: number } | null;
  }>;
  rounds?: Array<{ id: number }>;
  kills?: Array<{ round: number; time_in_round_in_ms: number; victim: { puuid: string } }>;
  teams: Array<{ team_id: string; won: boolean; rounds?: { won: number } }>;
}
export interface Notice {
  riot_id: string; match_id: string; message: string; ended_at: number;
  mode: string | null; act_id: string | null; act_name: string | null; outcome: Outcome | null; team_id?: string | null;
}
interface Result {
  message: string; endedAt: number; mode: string; outcome: Outcome;
  actId: string | null; actName: string | null; teamId: string;
}

function defeatComment(matchId: string, puuid: string, group: keyof typeof taunts = 'default', streak = 0): string {
  // A seeded choice stays the same across repeated API fetches and delivery retries.
  let seed = 2166136261;
  for (const char of matchId + ':' + puuid) {
    seed = Math.imul(seed ^ char.codePointAt(0)!, 16777619);
  }
  const choices = taunts[group].length ? taunts[group] : taunts.default;
  return choices.length ? '\n💬 ' + choices[(seed >>> 0) % choices.length].replaceAll('{streak}', String(streak)) : '';
}

export function resultMessage(raw: Match, puuid: string, label: string, deathUnrated = false): Result | null {
  const mode = raw.metadata?.queue?.id;
  if (!['competitive', 'ggteam', 'escalation', ...(deathUnrated ? ['unrated'] : [])].includes(mode) || raw.metadata.is_completed !== true) return null;
  const player = raw.players?.find(p => p.puuid === puuid);
  if (!player) return null;
  const team = raw.teams?.find(t => t.team_id === player.team_id);
  const enemy = raw.teams?.find(t => t.team_id !== player.team_id);
  if (!team || !enemy || typeof team.won !== 'boolean' || typeof enemy.won !== 'boolean' || (team.won && enemy.won)) return null;
  const start = Date.parse(raw.metadata.started_at);
  const duration = raw.metadata.game_length_in_ms;
  if (!raw.metadata.match_id || !Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) throw new Error('Invalid match time');
  const name = label.replace(/[\r\n`*_~|<>]/g, '').slice(0, 80);
  const modeName = mode === 'competitive' ? 'コンペ' : 'エスカレーション';
  const outcome = team.won ? 'win' : enemy.won ? 'loss' : 'draw';
  const ownScore = team.rounds?.won;
  const enemyScore = enemy.rounds?.won;
  // A reported 0-0 is not an actual final score for a completed match.
  const hasScore = Number.isInteger(ownScore) && Number.isInteger(enemyScore)
    && ownScore! >= 0 && enemyScore! >= 0 && ownScore! + enemyScore! > 0;
  const score = hasScore ? `${ownScore}対${enemyScore}で` : '';
  const result = outcome === 'win' ? '勝ち！！' : outcome === 'loss' ? '負け！' : '引き分け';
  const clean = (value?: string) => value?.replace(/[\r\n`*_~|<>]/g, '').slice(0, 80);
  const location = [clean(raw.metadata.map?.name), clean(player.agent?.name)].filter(Boolean).join('｜');
  const stats = player.stats;
  const nonnegative = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0;
  const details: string[] = [];
  if (nonnegative(stats?.kills) && nonnegative(stats?.deaths) && nonnegative(stats?.assists)) {
    details.push(stats.kills + 'K / ' + stats.deaths + 'D / ' + stats.assists + 'A');
  }
  if (['competitive', 'unrated'].includes(mode) && hasScore && nonnegative(stats?.score)) {
    details.push('ACS ' + Math.round(stats.score / (ownScore! + enemyScore!)));
  }
  if (nonnegative(stats?.headshots) && nonnegative(stats?.bodyshots) && nonnegative(stats?.legshots)) {
    const hits = stats.headshots + stats.bodyshots + stats.legshots;
    if (hits > 0) details.push('HS命中率 ' + (stats.headshots / hits * 100).toFixed(1) + '%');
  }
  const teammates = raw.players.filter(member => member.team_id === player.team_id);
  const completeTeam = teammates.length === 5 && new Set(teammates.map(member => member.puuid)).size === 5
    && teammates.every(member => nonnegative(member.stats?.kills));
  const topKills = completeTeam && nonnegative(stats?.kills) && stats.kills > 0
    && teammates.every(member => member.stats!.kills! <= stats.kills!);
  const tied = topKills && teammates.some(member => member.puuid !== puuid && member.stats?.kills === stats?.kills);
  const award = outcome === 'loss' && topKills
    ? '\n🏅 負けても健闘賞：チーム最多キル' + (tied ? '（同率）' : '') + '！ ようやった、勝ち星だけ迷子や！' : '';
  const performance = (location ? '\n🗺️ ' + location : '') + (details.length ? '\n🔫 ' + details.join('｜') : '');
  if (mode === 'unrated') return {
    message: deathUnratedMessage(raw, puuid, name) + performance,
    endedAt: start + duration, mode: 'unrated', outcome,
    actId: raw.metadata.season?.id || null, actName: raw.metadata.season?.short || null, teamId: player.team_id,
  };
  let tauntGroup: keyof typeof taunts = 'default';
  if (nonnegative(stats?.kills) && nonnegative(stats?.deaths) && stats.kills >= 20 && stats.kills > stats.deaths) tauntGroup = 'high_kills';
  else if (nonnegative(stats?.kills) && nonnegative(stats?.deaths) && stats.deaths >= 10 && stats.kills / stats.deaths <= 0.5) tauntGroup = 'low_kd';
  else if (mode === 'competitive' && hasScore && enemyScore! > ownScore! && enemyScore! - ownScore! <= 2) tauntGroup = 'close_loss';
  else if (mode === 'competitive' && hasScore && enemyScore! - ownScore! >= 8) tauntGroup = 'blowout';
  return {
    message: `${outcome === 'win' ? '🎉' : '📢'} ${name}は${score}${result}（${modeName}）${hasScore ? '' : ' ※スコア未取得'}` + performance + award + (outcome === 'loss' ? defeatComment(raw.metadata.match_id, puuid, tauntGroup) : ''),
    endedAt: start + duration, mode: mode === 'competitive' ? 'competitive' : 'escalation', outcome,
    actId: raw.metadata.season?.id || null, actName: raw.metadata.season?.short || null, teamId: player.team_id,
  };
}

async function actSummary(db: D1Database, notice: Notice): Promise<{ text: string; streak: number }> {
  // Old queued notifications from before the migration remain deliverable as-is.
  if (!notice.outcome) return { text: '', streak: 0 };
  const day = new Date(notice.ended_at + 9 * 3600_000).toISOString().slice(0, 10);
  const midnight = Date.parse(day + 'T00:00:00+09:00');
  const today = await db.prepare(`SELECT
    SUM(CASE WHEN outcome='win' THEN 1 ELSE 0 END) AS wins,
    SUM(CASE WHEN outcome='loss' THEN 1 ELSE 0 END) AS losses,
    SUM(CASE WHEN outcome='draw' THEN 1 ELSE 0 END) AS draws
    FROM notifications WHERE riot_id=? AND mode=? AND ended_at>=?
    AND (ended_at<? OR (ended_at=? AND match_id<=?))`)
    .bind(notice.riot_id, notice.mode, midnight, notice.ended_at, notice.ended_at, notice.match_id)
    .first<{ wins: number | null; losses: number | null; draws: number | null }>();
  const dayLabel = Math.abs(Date.now() - notice.ended_at) < 86400_000
    && day === new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10) ? '今日' : day;
  const daily = '\n' + dayLabel + '（記録分）：' + (today?.wins ?? 0) + '勝' + (today?.losses ?? 0) + '敗'
    + (today?.draws ? today.draws + '分' : '');
  if (!notice.act_id) return { text: daily + '\nACT情報未取得（集計なし）', streak: 0 };
  const rows = await db.prepare(`SELECT outcome FROM notifications
    WHERE riot_id=? AND mode=? AND act_id=? AND outcome IS NOT NULL
    AND (ended_at<? OR (ended_at=? AND match_id<=?))
    ORDER BY ended_at DESC,match_id DESC`)
    .bind(notice.riot_id, notice.mode, notice.act_id, notice.ended_at, notice.ended_at, notice.match_id)
    .all<{ outcome: Outcome }>();
  const results = rows.results.map(row => row.outcome);
  const wins = results.filter(outcome => outcome === 'win').length;
  const losses = results.filter(outcome => outcome === 'loss').length;
  const draws = results.length - wins - losses;
  let streak = 0;
  for (const outcome of results) {
    if (notice.outcome === 'draw' || outcome !== notice.outcome) break;
    streak++;
  }
  const act = notice.act_name?.replace(/[\r\n`*_~|<>]/g, '').slice(0, 40);
  const text = daily + `\nACT${act ? ` ${act}` : ''}（記録分）：${wins}勝${losses}敗${draws ? `${draws}分` : ''}`
    + (notice.outcome === 'draw' ? '\n現在：連勝・連敗なし（引き分けでリセット）' : `\n現在：${streak}連${notice.outcome === 'win' ? '勝' : '敗'}`);
  let stoppedLosses = 0;
  if (notice.outcome === 'win') {
    for (const outcome of results.slice(1)) {
      if (outcome !== 'loss') break;
      stoppedLosses++;
    }
  }
  const special = stoppedLosses >= 3 ? '\n🎊 ' + stoppedLosses + '連敗ストップ！ 勝利画面、おかえり！！' : '';
  return { text: text + special, streak };
}

export async function notificationContent(db: D1Database, notice: Notice): Promise<string> {
  if (notice.mode === 'unrated') return notice.message;
  const summary = await actSummary(db, notice);
  const split = notice.message.lastIndexOf('\n💬 ');
  const base = split < 0 ? notice.message : notice.message.slice(0, split);
  let comment = split < 0 ? '' : notice.message.slice(split);
  if (notice.outcome === 'loss' && summary.streak >= 3) {
    comment = defeatComment(notice.match_id, notice.riot_id, summary.streak >= 5 ? 'long_losing_streak' : 'losing_streak', summary.streak);
  }
  return base + summary.text + comment;
}

async function pairSummaries(db: D1Database, notices: Notice[], labels: ReadonlyMap<string, string>): Promise<string[]> {
  const lines: string[] = [];
  const name = (notice: Notice) => (labels.get(notice.riot_id) ?? notice.riot_id.split('#')[0]).replace(/[\r\n`*_~|<>]/g, '').slice(0, 24);
  for (let i = 0; i < notices.length; i++) {
    for (let j = i + 1; j < notices.length; j++) {
      const a = notices[i], b = notices[j];
      if (a.mode === 'unrated' || !a.team_id || a.team_id !== b.team_id || !a.act_id || a.act_id !== b.act_id
        || !a.mode || a.mode !== b.mode || !a.outcome || a.outcome !== b.outcome) continue;
      const total = await db.prepare(`SELECT
        SUM(CASE WHEN a.outcome='win' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN a.outcome='loss' THEN 1 ELSE 0 END) AS losses,
        SUM(CASE WHEN a.outcome='draw' THEN 1 ELSE 0 END) AS draws
        FROM notifications a JOIN notifications b ON a.match_id=b.match_id AND a.team_id=b.team_id AND a.outcome=b.outcome
        WHERE a.riot_id=? AND b.riot_id=? AND a.act_id=? AND b.act_id=? AND a.mode=? AND b.mode=?
        AND (a.ended_at<? OR (a.ended_at=? AND a.match_id<=?))`)
        .bind(a.riot_id, b.riot_id, a.act_id, a.act_id, a.mode, a.mode, a.ended_at, a.ended_at, a.match_id)
        .first<{ wins: number | null; losses: number | null; draws: number | null }>();
      const wins = total?.wins ?? 0, losses = total?.losses ?? 0, draws = total?.draws ?? 0;
      const games = wins + losses;
      if (!games && !draws) continue;
      const rate = games ? Math.round(wins / games * 100) : null;
      const comment = games < 5 ? '相性はまだ調査中！'
        : rate! >= 70 ? 'このコンビ、解散禁止！'
        : rate! <= 30 ? '友情は本物、勝ち星は別問題！' : '息は合う。勝ち星も合わせてこ！';
      lines.push('🤝 ' + name(a) + '＋' + name(b) + '｜今ACT・同モード（記録分）：'
        + wins + '勝' + losses + '敗' + (draws ? draws + '分' : '')
        + (rate === null ? '' : '／勝率' + rate + '%（引分除く）') + '\n💬 ' + comment);
    }
  }
  return lines;
}

export async function groupNotification(db: D1Database, notices: Notice[], labels: ReadonlyMap<string, string> = new Map()) {
  const blocks = await Promise.all(notices.map(notice => notificationContent(db, notice)));
  const pairs = await pairSummaries(db, notices, labels);
  const heading = notices.length > 1 ? (notices.every(notice => notice.mode === 'unrated') ? '☠️ デスアンレ判定（' : '👥 同じ試合の結果（') + notices.length + '人）' : '';
  const pairText = pairs.length ? '\n\n' + pairs.join('\n\n') : '';
  const content = (heading ? heading + '\n\n' : '') + blocks.join('\n\n') + pairText;
  // Compact pair names keep up to ten pairs in content; full player names remain in their blocks.
  return content.length <= 2000
    ? { content, embeds: [], allowed_mentions: { parse: [] } }
    : {
      content: (heading || '📊 試合の結果') + pairText,
      embeds: blocks.map(description => ({ description })),
      allowed_mentions: { parse: [] },
    };
}