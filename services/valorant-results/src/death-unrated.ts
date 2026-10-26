import type { Match } from './results.ts';

type Check = boolean | null;
export interface DeathUnratedVerdict {
  negativeKD: Check; lastDeath: Check; bottomACS: Check;
  verdict: 'competitive' | 'safe' | 'unknown';
}
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

export function deathUnratedVerdict(raw: Match, puuid: string): DeathUnratedVerdict {
  const player = raw.players?.find(member => member.puuid === puuid);
  const team = player ? raw.players.filter(member => member.team_id === player.team_id) : [];
  const complete = team.length === 5 && new Set(team.map(member => member.puuid)).size === 5;
  const negativeKD = count(player?.stats?.kills) && count(player?.stats?.deaths)
    ? player.stats.kills < player.stats.deaths : null;
  // A common round denominator means total scores give the exact ACS order; never compare rounded ACS.
  const bottomACS = complete && team.every(member => count(member.stats?.score))
    ? team.every(member => player!.stats!.score! <= member.stats!.score!) : null;
  let lastDeath: Check = null;
  if (complete && team.every(member => count(member.stats?.deaths)) && Array.isArray(raw.rounds) && raw.rounds.length && Array.isArray(raw.kills)) {
    const roundIds = raw.rounds.map(round => round.id);
    const ids = new Set(roundIds);
    const first = Math.min(...roundIds), last = Math.max(...roundIds);
    const validRounds = roundIds.every(count) && ids.size === roundIds.length
      && (first === 0 || first === 1) && last - first + 1 === roundIds.length;
    const victims = new Set(raw.players.map(member => member.puuid));
    const validKills = raw.kills.every(kill => count(kill.round) && ids.has(kill.round)
      && count(kill.time_in_round_in_ms) && typeof kill.victim?.puuid === 'string' && victims.has(kill.victim.puuid));
    // Missing suicide/spike deaths or duplicate events make the chronology untrustworthy.
    const events = raw.kills.map(kill => kill.round + ':' + kill.time_in_round_in_ms + ':' + kill.victim?.puuid);
    const completeDeaths = validKills && new Set(events).size === events.length
      && team.every(member => raw.kills!.filter(kill => kill.victim.puuid === member.puuid).length === member.stats!.deaths);
    if (validRounds && completeDeaths) {
      const ownIds = new Set(team.map(member => member.puuid));
      const finalDeaths = raw.kills.filter(kill => kill.round === last && ownIds.has(kill.victim.puuid));
      const latest = Math.max(...finalDeaths.map(kill => kill.time_in_round_in_ms));
      lastDeath = finalDeaths.some(kill => kill.victim.puuid === puuid && kill.time_in_round_in_ms === latest);
    }
  }
  const checks = [negativeKD, lastDeath, bottomACS];
  const verdict = checks.includes(true) ? 'competitive' : checks.includes(null) ? 'unknown' : 'safe';
  return { negativeKD, lastDeath, bottomACS, verdict };
}

export function deathUnratedMessage(raw: Match, puuid: string, name: string): string {
  const result = deathUnratedVerdict(raw, puuid);
  const player = raw.players.find(member => member.puuid === puuid);
  const kd = count(player?.stats?.kills) && count(player?.stats?.deaths)
    ? '（' + player.stats.kills + 'K / ' + player.stats.deaths + 'D）' : '';
  const line = (label: string, check: Check, detail = '') => '\n' + (check === true ? '❌' : check === false ? '✅' : '❔')
    + ' ' + label + '：' + (check === true ? '該当' : check === false ? '非該当' : 'データ不足') + detail;
  const title = result.verdict === 'competitive' ? '☠️ ' + name + '、コンペ行き確定！'
    : result.verdict === 'safe' ? '🕊️ ' + name + '、今回はセーフ！' : '⏳ ' + name + '、判定保留';
  return title + '（デスアンレ）'
    + line('KDマイナス', result.negativeKD, kd)
    + line('最終R・自チーム内ラストデス', result.lastDeath)
    + line('チーム内ACS最下位', result.bottomACS)
    + (result.verdict === 'competitive' ? '\n🚨 次はコンペへ出頭してください。'
      : result.verdict === 'unknown' ? '\n判定できない条件があるため、セーフ確定にはしません。' : '');
}