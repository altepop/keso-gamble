import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateDuelRewards } from '../scripts/duel-reward-simulation.mjs';

const policy = {
  pve: { dailyCap: 1, probability: { win: 0.5 } },
  pvp: { dailyCap: 2, pairCap: 1, probability: { win: 0.25 } },
};
const start = Date.parse('2026-11-20T23:59:00+09:00');
const pvp = (match, opponent, at = start) => ({
  guild: 'guild', user: 'user', mode: 'pvp', outcome: 'win', match, opponent, at,
});

test('the simulation counts distinct receipts and applies both PvP limits across games', () => {
  const first = { ...pvp('first', 'a'), game: 'othello' };
  const results = simulateDuelRewards([
    first, first, { ...pvp('second', 'a'), game: 'gomoku' },
    pvp('third', 'b'), pvp('fourth', 'c'),
  ], policy);
  assert.deepEqual(results.pvp, {
    eligible: 2, capped: 2, expectedRewards: 0.5, maxRewardRecords: 2,
  });
});

test('JST midnight resets the pair allowance and PvE tracks its own allowance', () => {
  const first = pvp('first', 'a');
  const next = pvp('next', 'a', start + 60_000);
  const results = simulateDuelRewards([
    next, first, { ...first, mode: 'pve', opponent: null },
    { ...pvp('pve-second', null), mode: 'pve' },
  ], policy);
  assert.equal(results.pvp.eligible, 2);
  assert.equal(results.pvp.capped, 0);
  assert.equal(results.pve.eligible, 1);
  assert.equal(results.pve.capped, 1);
});
