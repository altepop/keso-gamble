import test from 'node:test';
import assert from 'node:assert/strict';
import settings from '../rewards-config.json' with { type: 'json' };
import { createMatchRewardEvent, isMatchRewardEvent, quoteMatchReward, rewardEventId } from '../src/reward-contract.ts';
import type { RewardPolicy } from '../src/reward-contract.ts';

const now = Date.parse('2026-10-26T09:00:00Z');
const subject = { guildId: '100000000000000100', puuid: 'player-puuid', eligibleSince: now - 10000 };
const match = (mode = 'competitive', outcome = 'win') => ({
  metadata: { match_id: 'match-uuid', queue: { id: mode }, is_completed: true, started_at: new Date(now - 2000).toISOString(), game_length_in_ms: 1000 },
  players: [{ puuid: subject.puuid, team_id: 'red' }],
  teams: [{ team_id: 'red', won: outcome === 'win' }, { team_id: 'blue', won: outcome === 'loss' }],
});
const policy: RewardPolicy = { enabled: true, currency: 'KC', version: 'test-only', modes: {
  competitive: { participation: 100, winBonus: 50 }, escalation: { participation: 20, winBonus: 10 }, unrated: { participation: 40, winBonus: 15 },
} };

test('the reward template cannot grant anything while disabled or amounts remain undecided', () => {
  const event = createMatchRewardEvent(match(), subject, now)!;
  assert.deepEqual(quoteMatchReward(event, settings), { status: 'disabled' });
  assert.deepEqual(quoteMatchReward(event, { ...settings, enabled: true }), { status: 'unconfigured' });
});

test('participation is mode-specific and only a win adds its bonus; draws keep participation', () => {
  for (const mode of ['competitive', 'escalation', 'ggteam', 'unrated']) {
    for (const outcome of ['win', 'loss', 'draw']) {
      const event = createMatchRewardEvent(match(mode, outcome), subject, now)!;
      const result = quoteMatchReward(event, policy);
      assert.equal(result.status, 'ready');
      if (result.status !== 'ready') throw new Error('Expected a reward quote');
      const amounts = policy.modes[mode === 'ggteam' ? 'escalation' : mode as keyof RewardPolicy['modes']];
      assert.equal(result.total, amounts.participation! + (outcome === 'win' ? amounts.winBonus! : 0));
      assert.equal(event.match.outcome, outcome);
    }
  }
});

test('renames, refetches, mode aliases and reward-policy updates keep the same per-player match event key', () => {
  const raw = match('ggteam');
  const first = createMatchRewardEvent(raw, subject, now)!;
  const renamed = { ...raw, players: [{ ...raw.players[0], name: 'new name' }] };
  const second = createMatchRewardEvent(renamed, subject, now + 1000)!;
  assert.equal(first.eventId, second.eventId);
  assert.equal(first.eventId, createMatchRewardEvent(match('escalation'), subject, now)!.eventId);
  const quote = quoteMatchReward(first, { ...policy, version: 'changed-policy' });
  if (quote.status !== 'ready') throw new Error('Expected a reward quote');
  assert.equal(quote.eventId, first.eventId);
  assert.notEqual(rewardEventId(subject.guildId, 'x:y', 'z'), rewardEventId(subject.guildId, 'x', 'y:z'));
  assert.notEqual(rewardEventId('100000000000000101', 'match-uuid', subject.puuid), first.eventId);
});

test('unfinished, unsupported, pre-cutoff, inconsistent and unassociated matches cannot create reward events', () => {
  assert.equal(createMatchRewardEvent(match('deathmatch'), subject, now), null);
  const unfinished = match(); unfinished.metadata.is_completed = false;
  assert.equal(createMatchRewardEvent(unfinished, subject, now), null);
  assert.equal(createMatchRewardEvent(match(), { ...subject, puuid: 'unrelated' }, now), null);
  assert.equal(createMatchRewardEvent(match(), { ...subject, eligibleSince: now }, now), null);
  const impossible = match(); impossible.teams.forEach(team => { team.won = true; });
  assert.equal(createMatchRewardEvent(impossible, subject, now), null);
  const duplicated = match(); duplicated.players.push(duplicated.players[0]);
  assert.equal(createMatchRewardEvent(duplicated, subject, now), null);
  const badTime = match(); badTime.metadata.game_length_in_ms = -1;
  assert.equal(createMatchRewardEvent(badTime, subject, now), null);
});

test('receiver validation rejects swapped identities, forged keys and malformed payouts', () => {
  const event = createMatchRewardEvent(match(), subject, now)!;
  assert.equal(isMatchRewardEvent(event), true);
  assert.equal(isMatchRewardEvent({ ...event, subject: { puuid: 'other' } }), false);
  assert.equal(isMatchRewardEvent({ ...event, eventId: event.eventId + 'x' }), false);
  assert.equal(isMatchRewardEvent({ ...event, match: { ...event.match, outcome: 'unknown' } }), false);
  assert.equal(isMatchRewardEvent({ ...event, match: { ...event.match, endedAt: NaN } }), false);
  for (const amount of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => quoteMatchReward(event, { ...policy, modes: { ...policy.modes, competitive: { participation: amount, winBonus: 100 } } }), /amounts/);
  }
});