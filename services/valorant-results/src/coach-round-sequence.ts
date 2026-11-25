// Round-sequence metrics derived entirely from the archived per-round
// records (valorant_match_round_events: rounds_json / kills_json) and the
// roster snapshot. No additional HenrikDev requests are needed, so these
// metrics also cover matches archived before this module existed, as far
// back as their round events were stored.
//
// What the archived records support directly:
// - alive-count progression per round (kill order + timestamps) -> number
//   advantage reached / lost, and its conversion rate
// - KAST per round: kill, assist (kill assistants), survival, or a traded
//   death. Matches whose kill records lack the assistants array are excluded
//   from KAST only, never silently treated as zero-assist matches.
// - post-plant results (plant event + round winner + attacking team)
// - ultimate rounds (per-round ability casts). A match is excluded from the
//   ultimate metric when the summed per-round ultimate casts exceed the
//   roster's match-total casts, because then the stored values cannot be
//   per-round counts for that match.
// - pistol -> round-3 flips (round winners)
// - first-blood rounds that were lost (first kill of the round + winner)
//
// The weapon-snowball criterion stays an estimate: a pickup is never recorded
// directly, so a candidate requires a high-value loadout lost, the killer
// surviving the round, the round lost, and the killer scoring again with a
// rifle-class weapon in the same or the next round. Callers must keep the
// estimate caveat next to this number.
//
// Trade window: 5,000 ms. Published coaching sources disagree (3 s, 3-4 s and
// 5 s all appear); this codebase already measures "the killer was eliminated
// within 5 s" in coach-round-analysis (firstDeathKillerEliminatedWithin5s),
// so the same window is used here for consistency.
export const COACH_TRADE_WINDOW_MS = 5_000;

const RIFLE_CLASS = ['Bulldog', 'Guardian', 'Phantom', 'Vandal', 'Operator', 'Ares', 'Odin'];
const SNOWBALL_LOADOUT_MIN = 2_900; // a rifle alone costs 2,900 credits
const REF_CAPS = { advantage: 6, postPlant: 6, ult: 6, snowball: 6, pistol: 4, firstBlood: 6 } as const;

type Row = {
  match_id: string; map: string | null; ended_at: number;
  players_json: string | null; teams_json: string | null;
  rounds_json: string | null; kills_json: string | null;
};
type Account = { puuid: string | null };
type Ref = { map: string; round: number; date: string };
type Kill = { r: number; t: number; killer: string; victim: string; assistants: string[] | null; w: string | null; idx: number };
type RoundRow = {
  r: number; winner: string; attack: string | null;
  econ: Map<string, number> | null;
  abilities: Map<string, { ultimate?: number }> | null;
  plantBy: string | null;
};

const read = (v: string | null): any => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const pct = (n: number, d: number): number | null => d > 0 ? Math.round((n / d) * 1000) / 10 : null;
const dateOf = (ms: number): string => Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : '';

function parseMatch(row: Row, owned: ReadonlySet<string>) {
  const playersRaw = read(row.players_json);
  if (!Array.isArray(playersRaw) || playersRaw.length !== 10) return null;
  const players: Array<{ puuid: string; team: string; kills: number; castsUlt: number | null }> = [];
  const seen = new Set<string>();
  for (const p of playersRaw) {
    const puuid = typeof p?.puuid === 'string' ? p.puuid : typeof p?.u === 'string' ? p.u : null;
    const team = typeof p?.team_id === 'string' ? p.team_id : typeof p?.teamId === 'string' ? p.teamId : typeof p?.team === 'string' ? p.team : null;
    const kills = num(p?.k ?? p?.kills);
    if (!puuid || !team || kills === null || seen.has(puuid)) return null;
    seen.add(puuid);
    const castsUlt = num(p?.casts?.ultimate);
    players.push({ puuid, team, kills, castsUlt });
  }
  const own = players.filter(p => owned.has(p.puuid));
  if (own.length !== 1) return null;
  const me = own[0];
  const teamSizes = new Map<string, number>();
  for (const p of players) teamSizes.set(p.team, (teamSizes.get(p.team) ?? 0) + 1);
  if (teamSizes.size !== 2 || [...teamSizes.values()].some(n => n !== 5)) return null;
  const teamOf = new Map(players.map(p => [p.puuid, p.team]));
  const rosterKills = players.reduce((sum, p) => sum + p.kills, 0);

  const roundsRaw = read(row.rounds_json);
  if (!Array.isArray(roundsRaw) || !roundsRaw.length) return null;
  const rounds: RoundRow[] = [];
  const roundIds = new Set<number>();
  for (const r of roundsRaw) {
    if (!Number.isSafeInteger(r?.r) || roundIds.has(r.r)) return null;
    if (typeof r?.winner !== 'string' || !teamSizes.has(r.winner)) return null;
    roundIds.add(r.r);
    const ctx = r?.context && typeof r.context === 'object' ? r.context : null;
    let econ: Map<string, number> | null = null;
    if (Array.isArray(ctx?.e?.p)) {
      econ = new Map();
      for (const e of ctx.e.p) if (typeof e?.u === 'string' && num(e?.v) !== null) econ.set(e.u, e.v);
    }
    let abilities: Map<string, { ultimate?: number }> | null = null;
    if (Array.isArray(ctx?.a?.p)) {
      abilities = new Map();
      for (const a of ctx.a.p) if (typeof a?.u === 'string') abilities.set(a.u, { ultimate: num(a?.ultimate) ?? undefined });
    }
    const plantBy = typeof ctx?.plant?.event?.u === 'string' ? ctx.plant.event.u : null;
    rounds.push({
      r: r.r, winner: r.winner,
      attack: typeof r?.attack === 'string' && teamSizes.has(r.attack) ? r.attack : null,
      econ, abilities, plantBy,
    });
  }
  rounds.sort((a, b) => a.r - b.r);

  const killsRaw = read(row.kills_json);
  if (!Array.isArray(killsRaw) || killsRaw.length !== rosterKills) return null;
  const kills: Kill[] = [];
  for (let i = 0; i < killsRaw.length; i++) {
    const k = killsRaw[i];
    if (!Number.isSafeInteger(k?.r) || !roundIds.has(k.r)) return null;
    const t = num(k?.t); if (t === null || t < 0) return null;
    if (typeof k?.killer !== 'string' || typeof k?.victim !== 'string' || !teamOf.has(k.killer) || !teamOf.has(k.victim) || k.killer === k.victim) return null;
    kills.push({
      r: k.r, t, killer: k.killer, victim: k.victim,
      assistants: Array.isArray(k?.assistants) ? k.assistants.filter((a: unknown) => typeof a === 'string') : null,
      w: typeof k?.w === 'string' ? k.w : null, idx: i,
    });
  }
  const assistsKnown = kills.every(k => k.assistants !== null);
  return { me, teamOf, rounds, kills, assistsKnown };
}

export function coachRoundSequence(rows: readonly Row[], accounts: readonly Account[]) {
  const owned = new Set(accounts.map(a => a.puuid).filter((p): p is string => typeof p === 'string' && p.length > 0));
  let matches = 0, excludedMatches = 0;
  const kast = { matches: 0, excludedMatches: 0, rounds: 0, kastRounds: 0, pct: null as number | null };
  const tiers = new Map<string, { rounds: number; wins: number; losses: number }>(
    ['5v4', '5v3', '5v2', 'other'].map(k => [k, { rounds: 0, wins: 0, losses: 0 }]));
  const advantage = { rounds: 0, wins: 0, losses: 0, conversionPct: null as number | null };
  const advantageLossRefs: Array<Ref & { severity: number }> = [];
  const postPlant = { plants: 0, wins: 0, losses: 0, lossRefs: [] as Ref[] };
  const ult = { matches: 0, rounds: 0, wins: 0, losses: 0, lossRefs: [] as Ref[] };
  const snowball = { candidates: 0, refs: [] as Ref[] };
  const pistolFlip = { pairs: 0, flips: 0, against: 0, for: 0, againstRefs: [] as Ref[] };
  const firstBlood = { lostRefs: [] as Ref[] };
  let latest: {
    map: string; date: string; tradeDeaths: number; tradeTraded: number; tradePct: number | null;
    advRounds: number; advWins: number; advPct: number | null;
  } | null = null;

  for (const row of rows) {
    const parsed = owned.size ? parseMatch(row, owned) : null;
    if (!parsed) { excludedMatches++; continue; }
    matches++;
    const { me, teamOf, rounds, kills, assistsKnown } = parsed;
    const myTeam = me.team;
    const map = typeof row.map === 'string' && row.map ? row.map : '不明';
    const date = dateOf(row.ended_at);
    const byRound = new Map<number, Kill[]>();
    for (const k of kills) { const list = byRound.get(k.r) ?? []; list.push(k); byRound.set(k.r, list); }
    for (const list of byRound.values()) list.sort((a, b) => a.t - b.t || a.idx - b.idx);
    const roundById = new Map(rounds.map(r => [r.r, r]));
    let ultSum = 0, ultDataRounds = 0;
    const matchUlt = { rounds: 0, wins: 0, losses: 0, lossRefs: [] as Ref[] };
    let matchTradeDeaths = 0, matchTradeTraded = 0, matchAdvRounds = 0, matchAdvWins = 0;

    for (const round of rounds) {
      const list = byRound.get(round.r) ?? [];
      const won = round.winner === myTeam;
      // Alive-count progression and the player's round involvement.
      let ownAlive = 5, enemyAlive = 5, best = 0, bestWithFive = 0;
      let iKilled = false, iAssisted = false, iDied = false, iTraded = false;
      for (let i = 0; i < list.length; i++) {
        const k = list[i];
        if (teamOf.get(k.victim) === myTeam) ownAlive--; else enemyAlive--;
        const diff = ownAlive - enemyAlive;
        if (diff > best) best = diff;
        if (ownAlive === 5 && diff > bestWithFive) bestWithFive = diff;
        if (k.killer === me.puuid) iKilled = true;
        if (k.assistants?.includes(me.puuid)) iAssisted = true;
        if (k.victim === me.puuid) {
          iDied = true;
          matchTradeDeaths++;
          const avenged = list.slice(i + 1).some(l => l.victim === k.killer && teamOf.get(l.killer) === myTeam && l.t - k.t <= COACH_TRADE_WINDOW_MS);
          if (avenged) { iTraded = true; matchTradeTraded++; }
        }
      }
      if (assistsKnown) {
        kast.rounds++;
        if (iKilled || iAssisted || !iDied || iTraded) kast.kastRounds++;
      }
      if (best > 0) {
        advantage.rounds++;
        matchAdvRounds++;
        if (won) { advantage.wins++; matchAdvWins++; } else advantage.losses++;
        const tierKey = bestWithFive >= 3 ? '5v2' : bestWithFive === 2 ? '5v3' : bestWithFive === 1 ? '5v4' : 'other';
        const tier = tiers.get(tierKey)!;
        tier.rounds++;
        if (won) tier.wins++; else { tier.losses++; advantageLossRefs.push({ map, round: round.r + 1, date, severity: bestWithFive }); }
      }
      // Post-plant: the plant event belongs to the attacking team.
      if (round.plantBy && round.attack === myTeam && teamOf.get(round.plantBy) === myTeam) {
        postPlant.plants++;
        if (won) postPlant.wins++; else { postPlant.losses++; if (postPlant.lossRefs.length < REF_CAPS.postPlant) postPlant.lossRefs.push({ map, round: round.r + 1, date }); }
      }
      // Ultimate rounds from the per-round ability record. Counted into a
      // per-match bucket first; merged only after the semantics guard below.
      if (round.abilities) {
        ultDataRounds++;
        const mine = round.abilities.get(me.puuid);
        if (mine?.ultimate) ultSum += mine.ultimate;
        if (mine?.ultimate && mine.ultimate > 0) {
          matchUlt.rounds++;
          if (won) matchUlt.wins++; else { matchUlt.losses++; if (matchUlt.lossRefs.length < REF_CAPS.ult) matchUlt.lossRefs.push({ map, round: round.r + 1, date }); }
        }
      }
      // First blood taken by the player in a round the team then lost.
      if (list.length && list[0].killer === me.puuid && !won && firstBlood.lostRefs.length < REF_CAPS.firstBlood)
        firstBlood.lostRefs.push({ map, round: round.r + 1, date });
      // Weapon-snowball candidates (estimate; see the header note).
      if (!won && round.econ) {
        const refDone = snowball.refs.length >= REF_CAPS.snowball;
        for (let i = 0; i < list.length; i++) {
          const k = list[i];
          if (teamOf.get(k.victim) !== myTeam || teamOf.get(k.killer) === myTeam) continue;
          const loadout = round.econ.get(k.victim);
          if (loadout === undefined || loadout < SNOWBALL_LOADOUT_MIN) continue;
          if (list.slice(i + 1).some(l => l.victim === k.killer)) continue; // killer died later that round
          const againSameRound = list.slice(i + 1).some(l => l.killer === k.killer);
          const next = roundById.get(round.r + 1);
          const againNextRound = !againSameRound && next !== undefined &&
            (byRound.get(next.r) ?? []).some(l => l.killer === k.killer && l.w !== null && RIFLE_CLASS.some(w => w.toLowerCase() === l.w!.toLowerCase()));
          if (!againSameRound && !againNextRound) continue;
          snowball.candidates++;
          if (!refDone) snowball.refs.push({ map, round: round.r + 1, date });
          break; // one candidate per round is enough for a VOD pointer
        }
      }
    }
    if (assistsKnown) kast.matches++; else kast.excludedMatches++;
    // Ultimate semantics guard: per-round casts cannot exceed the match total.
    // When the guard fails the stored values were not per-round counts, so the
    // match contributes nothing to the ultimate metric instead of wrong data.
    if (ultDataRounds > 0 && (me.castsUlt === null || ultSum <= me.castsUlt)) {
      ult.matches++;
      ult.rounds += matchUlt.rounds; ult.wins += matchUlt.wins; ult.losses += matchUlt.losses;
      for (const ref of matchUlt.lossRefs) if (ult.lossRefs.length < REF_CAPS.ult) ult.lossRefs.push(ref);
    }
    // Pistol -> round 3 flips for both halves.
    for (const [pistolId, thirdId] of [[0, 2], [12, 14]] as const) {
      const pistol = roundById.get(pistolId), third = roundById.get(thirdId);
      if (!pistol || !third) continue;
      pistolFlip.pairs++;
      if (pistol.winner === third.winner) continue;
      pistolFlip.flips++;
      if (pistol.winner === myTeam) { pistolFlip.against++; if (pistolFlip.againstRefs.length < REF_CAPS.pistol) pistolFlip.againstRefs.push({ map, round: thirdId + 1, date }); }
      else pistolFlip.for++;
    }
    if (!latest) latest = {
      map, date, tradeDeaths: matchTradeDeaths, tradeTraded: matchTradeTraded,
      tradePct: pct(matchTradeTraded, matchTradeDeaths),
      advRounds: matchAdvRounds, advWins: matchAdvWins, advPct: pct(matchAdvWins, matchAdvRounds),
    };
  }

  kast.pct = pct(kast.kastRounds, kast.rounds);
  advantage.conversionPct = pct(advantage.wins, advantage.rounds);
  advantageLossRefs.sort((a, b) => b.severity - a.severity);
  return {
    matches, excludedMatches, kast, advantage: { ...advantage, tiers: [...tiers.entries()].map(([key, v]) => ({ key, ...v })), lossRefs: advantageLossRefs.slice(0, REF_CAPS.advantage).map(({ severity, ...ref }) => ref) },
    postPlant, ult, snowball, pistolFlip, firstBlood, latest,
  };
}
