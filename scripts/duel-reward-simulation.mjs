// Offline P9.5 comparison. Inputs are scenarios and candidate policies, not live reward settings.
import { pathToFileURL } from 'node:url';

const jstOffsetMs = 9 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

export function simulateDuelRewards(receipts, policy) {
  const seen = new Set();
  const playerDays = new Map();
  const pairDays = new Map();
  const result = {
    pve: { eligible: 0, capped: 0, expectedRewards: 0, maxRewardRecords: 0 },
    pvp: { eligible: 0, capped: 0, expectedRewards: 0, maxRewardRecords: 0 },
  };

  for (const receipt of [...receipts].sort((a, b) => a.at - b.at)) {
    const { guild, user, match, mode, opponent, outcome, at } = receipt;
    const identity = JSON.stringify([guild, user, match, mode]);
    if (seen.has(identity)) continue;
    seen.add(identity);

    const rules = policy[mode];
    const totals = result[mode];
    const day = Math.floor((at + jstOffsetMs) / dayMs);
    const playerKey = JSON.stringify([guild, user, mode, day]);
    const playerCount = playerDays.get(playerKey) ?? 0;
    const pairKey = JSON.stringify([guild, user, opponent, day]);
    const pairCount = pairDays.get(pairKey) ?? 0;

    if (playerCount >= rules.dailyCap || (mode === 'pvp' && pairCount >= rules.pairCap)) {
      totals.capped++;
      continue;
    }
    playerDays.set(playerKey, playerCount + 1);
    if (mode === 'pvp') pairDays.set(pairKey, pairCount + 1);
    const probability = rules.probability[outcome];
    totals.eligible++;
    totals.expectedRewards += probability;
    if (probability > 0) totals.maxRewardRecords++;
  }
  return result;
}

function makeReceipts(mode, outcomes, opponents = 1) {
  const start = Date.parse('2026-11-20T00:00:00+09:00');
  return outcomes.map((outcome, index) => ({
    guild: 'simulation',
    user: 'player',
    match: 'match-' + index,
    mode,
    opponent: mode === 'pvp' ? 'opponent-' + (index % opponents) : null,
    outcome,
    at: start + index * 60_000,
  }));
}

function runExamples() {
  const candidates = [
    { pveDaily: 10, pvpDaily: 8, pair: 2 },
    { pveDaily: 20, pvpDaily: 12, pair: 4 },
  ];
  const alternating = Array.from({ length: 24 }, (_, i) => i % 2 === 0 ? 'win' : 'loss');
  const scenarios = [
    ['PvE wins', 'pve', makeReceipts('pve', Array(30).fill('win'))],
    ['PvP regular play', 'pvp', makeReceipts('pvp', alternating.slice(0, 6), 3)],
    ['PvP one opponent', 'pvp', makeReceipts('pvp', alternating)],
    ['PvP rotating opponents', 'pvp', makeReceipts('pvp', alternating, 12)],
  ];
  const rows = [];
  for (const candidate of candidates) {
    const policy = {
      pve: { dailyCap: candidate.pveDaily, probability: { win: 0.1, loss: 0, draw: 0 } },
      pvp: {
        dailyCap: candidate.pvpDaily,
        pairCap: candidate.pair,
        probability: { win: 0.1, loss: 0.05, draw: 0.05 },
      },
    };
    for (const [scenario, mode, receipts] of scenarios) {
      const result = simulateDuelRewards(receipts, policy)[mode];
      rows.push({
        scenario,
        dailyCap: policy[mode].dailyCap,
        pairCap: policy[mode].pairCap ?? '—',
        eligible: result.eligible,
        capped: result.capped,
        expectedRewards: Number(result.expectedRewards.toFixed(2)),
        maxRewardRecords: result.maxRewardRecords,
      });
    }
  }
  console.table(rows);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runExamples();
}
