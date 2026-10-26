import type { Match } from './results.ts';
import { deathName, isDeathMode } from './death-modes.ts';

type Check = boolean | null;
export interface DeathUnratedVerdict {
  negativeKD: Check; lastDeath: Check; bottomACS: Check;
  verdict: 'competitive' | 'safe' | 'unknown';
}
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

export type LastDeathReason = 'complete' | 'no_final_death' | 'later_teammate_death'
  | 'missing_team' | 'missing_rounds' | 'invalid_rounds' | 'missing_kills'
  | 'invalid_kills' | 'duplicate_kills' | 'missing_personal_deaths' | 'missing_team_deaths';
export interface LastDeathCheck {
  value: Check;
  reason: LastDeathReason;
  finalRound: number | null;
}

export function lastDeathCheck(raw: Match, puuid: string): LastDeathCheck {
  const unknown = (reason: LastDeathReason, finalRound: number | null = null): LastDeathCheck => ({ value: null, reason, finalRound });
  const player = raw.players?.find(member => member.puuid === puuid);
  const team = player ? raw.players.filter(member => member.team_id === player.team_id) : [];
  if (!player?.team_id || team.length !== 5 || new Set(team.map(member => member.puuid)).size !== 5) return unknown('missing_team');
  if (!Array.isArray(raw.rounds) || !raw.rounds.length) return unknown('missing_rounds');
  const roundIds = raw.rounds.map(round => round?.id);
  if (!roundIds.every(count)) return unknown('invalid_rounds');
  const ids = new Set(roundIds), first = Math.min(...roundIds), last = Math.max(...roundIds);
  if (ids.size !== roundIds.length || (first !== 0 && first !== 1) || last - first + 1 !== roundIds.length) return unknown('invalid_rounds');
  // A partial list must not make an earlier round look like the final round.
  const scores = raw.teams?.map(member => member.rounds?.won);
  if (scores?.length === 2 && scores.every(count) && scores[0] + scores[1] > 0 && scores[0] + scores[1] !== roundIds.length) return unknown('invalid_rounds');
  if (!Array.isArray(raw.kills)) return unknown('missing_kills', last);
  const victims = new Set(raw.players.map(member => member.puuid));
  if (!raw.kills.every(kill => count(kill?.round) && ids.has(kill.round)
    && count(kill.time_in_round_in_ms) && typeof kill.victim?.puuid === 'string' && victims.has(kill.victim.puuid))) return unknown('invalid_kills', last);
  const events = raw.kills.map(kill => kill.round + ':' + kill.time_in_round_in_ms + ':' + kill.victim.puuid);
  if (new Set(events).size !== events.length) return unknown('duplicate_kills', last);
  const complete = (member: Match['players'][number]) => count(member.stats?.deaths)
    && raw.kills!.filter(kill => kill.victim.puuid === member.puuid).length === member.stats.deaths;
  // Only this player's completeness is needed to prove a non-last-death result.
  // An unrelated teammate's missing death must not invalidate that proof.
  if (!complete(player)) return unknown('missing_personal_deaths', last);
  const ownFinal = raw.kills.filter(kill => kill.round === last && kill.victim.puuid === puuid);
  if (!ownFinal.length) return { value: false, reason: 'no_final_death', finalRound: last };
  const ownLast = Math.max(...ownFinal.map(kill => kill.time_in_round_in_ms));
  const ownIds = new Set(team.map(member => member.puuid));
  if (raw.kills.some(kill => kill.round === last && ownIds.has(kill.victim.puuid) && kill.time_in_round_in_ms > ownLast)) {
    return { value: false, reason: 'later_teammate_death', finalRound: last };
  }
  // A positive verdict still needs complete teammate histories: a missing later
  // spike/suicide/revive death must never send somebody to competitive by guesswork.
  if (!team.every(complete)) return unknown('missing_team_deaths', last);
  return { value: true, reason: 'complete', finalRound: last };
}

const lastDeathReasons: Record<LastDeathReason, string> = {
  complete: '', no_final_death: '', later_teammate_death: '',
  missing_team: '味方の情報が不足', missing_rounds: 'ラウンド履歴が未取得',
  invalid_rounds: '最終ラウンドを特定できない', missing_kills: 'デス履歴が未取得',
  invalid_kills: 'デス履歴・時刻が不整合', duplicate_kills: 'デス履歴に重複あり',
  missing_personal_deaths: '本人のデス履歴が不足・不整合', missing_team_deaths: '味方のデス履歴が不足・不整合',
};

export function deathUnratedVerdict(raw: Match, puuid: string, previousLastDeath?: boolean): DeathUnratedVerdict {
  const player = raw.players?.find(member => member.puuid === puuid);
  const team = player ? raw.players.filter(member => member.team_id === player.team_id) : [];
  const complete = team.length === 5 && new Set(team.map(member => member.puuid)).size === 5;
  const negativeKD = count(player?.stats?.kills) && count(player?.stats?.deaths)
    ? player.stats.kills < player.stats.deaths : null;
  // A common round denominator means total scores give the exact ACS order; never compare rounded ACS.
  const bottomACS = complete && team.every(member => count(member.stats?.score))
    ? team.every(member => player!.stats!.score! <= member.stats!.score!) : null;
  const observed = lastDeathCheck(raw, puuid).value;
  const lastDeath = observed ?? (typeof previousLastDeath === 'boolean' ? previousLastDeath : null);
  const checks = [negativeKD, lastDeath, bottomACS];
  const verdict = checks.includes(true) ? 'competitive' : checks.includes(null) ? 'unknown' : 'safe';
  return { negativeKD, lastDeath, bottomACS, verdict };
}

export function deathUnratedMessage(raw: Match, puuid: string, name: string, previousLastDeath?: boolean): string {
  const result = deathUnratedVerdict(raw, puuid, previousLastDeath);
  const player = raw.players.find(member => member.puuid === puuid);
  const kd = count(player?.stats?.kills) && count(player?.stats?.deaths)
    ? '（' + player.stats.kills + 'K / ' + player.stats.deaths + 'D）' : '';
  const line = (label: string, check: Check, detail = '') => '\n' + (check === true ? '❌' : check === false ? '✅' : '❔')
    + ' ' + label + '：' + (check === true ? '該当' : check === false ? '非該当' : 'データ不足') + detail;
  const title = result.verdict === 'competitive' ? '☠️ ' + name + '、コンペ行き確定！'
    : result.verdict === 'safe' ? '🕊️ ' + name + '、今回はセーフ！' : '⏳ ' + name + '、判定保留';
  return title + '（' + deathName(isDeathMode(raw.metadata.queue.id) ? raw.metadata.queue.id : 'unrated') + '）'
    + line('KDマイナス', result.negativeKD, kd)
    + line('最終R・自チーム内ラストデス', result.lastDeath,
      result.lastDeath === null ? '（' + lastDeathReasons[lastDeathCheck(raw, puuid).reason] + '）' : '')
    + line('チーム内ACS最下位', result.bottomACS)
    + (result.verdict === 'competitive' ? '\n🚨 次はコンペへ出頭してください。'
      : result.verdict === 'unknown' ? '\n判定できない条件があるため、セーフ確定にはしません。' : '');
}
