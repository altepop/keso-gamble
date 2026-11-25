import test from 'node:test';
import assert from 'node:assert/strict';
import { coachRoundSequence, COACH_TRADE_WINDOW_MS } from '../src/coach-round-sequence.ts';

const P = (puuid: string, team: string, k: number, casts?: object) => ({ puuid, team_id: team, k, d: 0, a: 0, ...(casts ? { casts } : {}) });
const players = [
  P('me', 'Blue', 3, { ultimate: 2 }), P('a1', 'Blue', 0), P('a2', 'Blue', 5), P('a3', 'Blue', 2), P('a4', 'Blue', 2),
  P('e1', 'Red', 2), P('e2', 'Red', 3), P('e3', 'Red', 2), P('e4', 'Red', 3), P('e5', 'Red', 1),
];
const K = (r: number, t: number, killer: string, victim: string, extra: object = {}) => ({ r, t, killer, victim, assistants: [] as string[], ...extra });
const kills = [
  // Round 0 (pistol): first blood by me, my death traded within the window,
  // a 5v4 advantage reached, a plant by my team, and the round still lost.
  K(0, 1000, 'me', 'e1'), K(0, 2000, 'e2', 'a1'), K(0, 3000, 'e3', 'me'), K(0, 6000, 'a2', 'e3'),
  K(0, 9000, 'e4', 'a2'), K(0, 10000, 'e5', 'a3'), K(0, 11000, 'e4', 'a4'),
  // Round 1: my assist, my ultimate used, round won from a 4v3 advantage.
  K(1, 1000, 'e1', 'a1'), K(1, 2500, 'a2', 'e1', { assistants: ['me'] }), K(1, 3000, 'me', 'e2'),
  K(1, 4000, 'a3', 'e3'), K(1, 5000, 'a4', 'e4'), K(1, 6000, 'a2', 'e5'),
  // Round 2 (round 3 of the half): clean win; flips the pistol result.
  K(2, 1000, 'me', 'e1'), K(2, 2000, 'a2', 'e2'), K(2, 3000, 'a3', 'e3'), K(2, 4000, 'a4', 'e4'), K(2, 5000, 'a2', 'e5'),
  // Round 3: a full-buy teammate drops a rifle-class threat (snowball
  // estimate), my ultimate round is lost, and my death is not traded.
  K(3, 1000, 'e2', 'a3', { w: 'Ghost' }), K(3, 2000, 'e2', 'a4'), K(3, 3000, 'e1', 'me'),
  K(3, 4000, 'e3', 'a1'), K(3, 5000, 'e4', 'a2'),
];
const rounds = [
  { r: 0, winner: 'Red', attack: 'Blue', defense: 'Red', context: { v: 1, plant: { at: 1, event: { u: 'a1', t: 5000 } } } },
  { r: 1, winner: 'Blue', attack: 'Blue', defense: 'Red', context: { v: 1, a: { at: 1, p: [{ u: 'me', ultimate: 1 }] } } },
  { r: 2, winner: 'Blue', attack: 'Blue', defense: 'Red' },
  { r: 3, winner: 'Red', attack: 'Blue', defense: 'Red', context: { v: 1, e: { at: 1, p: [{ u: 'a3', v: 3900 }] }, a: { at: 1, p: [{ u: 'me', ultimate: 1 }] } } },
];
const row = (overrides: object = {}) => ({
  match_id: 'm1', map: 'Summit', ended_at: Date.parse('2026-11-22T10:00:00.000Z'),
  players_json: JSON.stringify(players),
  teams_json: JSON.stringify([{ id: 'Blue', won: false, rounds: 2 }, { id: 'Red', won: true, rounds: 2 }]),
  rounds_json: JSON.stringify(rounds), kills_json: JSON.stringify(kills), ...overrides,
});
const accounts = [{ puuid: 'me' }];

test('trade window is the documented 5 seconds', () => {
  assert.equal(COACH_TRADE_WINDOW_MS, 5_000);
});

test('KAST, advantage, post-plant, ult, snowball, pistol flip and first blood are computed from archived records', () => {
  const s = coachRoundSequence([row()], accounts);
  assert.equal(s.matches, 1);
  assert.equal(s.excludedMatches, 0);
  assert.deepEqual(
    { matches: s.kast.matches, rounds: s.kast.rounds, kastRounds: s.kast.kastRounds, pct: s.kast.pct },
    { matches: 1, rounds: 4, kastRounds: 3, pct: 75 });
  assert.deepEqual(
    { rounds: s.advantage.rounds, wins: s.advantage.wins, losses: s.advantage.losses, conversionPct: s.advantage.conversionPct },
    { rounds: 3, wins: 2, losses: 1, conversionPct: 66.7 });
  const tiers = Object.fromEntries(s.advantage.tiers.map(t => [t.key, t]));
  // Tiers are bucketed by the best advantage reached inside the round:
  // round 0 peaked at 5v4 and was lost, round 1 only reached a 4v3 edge,
  // round 2 ran up to 5v2 and was won.
  assert.deepEqual(
    { rounds: tiers['5v4'].rounds, wins: tiers['5v4'].wins, losses: tiers['5v4'].losses },
    { rounds: 1, wins: 0, losses: 1 });
  assert.deepEqual(
    { rounds: tiers['5v2'].rounds, wins: tiers['5v2'].wins, losses: tiers['5v2'].losses },
    { rounds: 1, wins: 1, losses: 0 });
  assert.deepEqual(
    { rounds: tiers['other'].rounds, wins: tiers['other'].wins, losses: tiers['other'].losses },
    { rounds: 1, wins: 1, losses: 0 });
  assert.equal(s.advantage.lossRefs.length, 1);
  assert.equal(s.advantage.lossRefs[0].round, 1);
  assert.deepEqual(
    { plants: s.postPlant.plants, wins: s.postPlant.wins, losses: s.postPlant.losses },
    { plants: 1, wins: 0, losses: 1 });
  assert.equal(s.postPlant.lossRefs[0].round, 1);
  assert.deepEqual(
    { matches: s.ult.matches, rounds: s.ult.rounds, wins: s.ult.wins, losses: s.ult.losses },
    { matches: 1, rounds: 2, wins: 1, losses: 1 });
  assert.equal(s.ult.lossRefs[0].round, 4);
  assert.equal(s.snowball.candidates, 1);
  assert.equal(s.snowball.refs[0].round, 4);
  assert.deepEqual(
    { pairs: s.pistolFlip.pairs, flips: s.pistolFlip.flips, against: s.pistolFlip.against, for: s.pistolFlip.for },
    { pairs: 1, flips: 1, against: 0, for: 1 });
  assert.equal(s.firstBlood.lostRefs.length, 1);
  assert.equal(s.firstBlood.lostRefs[0].round, 1);
  assert.deepEqual(
    { tradeDeaths: s.latest?.tradeDeaths, tradeTraded: s.latest?.tradeTraded, tradePct: s.latest?.tradePct, advRounds: s.latest?.advRounds, advWins: s.latest?.advWins, advPct: s.latest?.advPct },
    { tradeDeaths: 2, tradeTraded: 1, tradePct: 50, advRounds: 3, advWins: 2, advPct: 66.7 });
  const serialized = JSON.stringify(s);
  assert.equal(serialized.includes('m1'), false, 'match ids stay out of the sequence report');
  assert.equal(serialized.includes('puuid'), false, 'player ids stay out of the sequence report');
  assert.deepEqual(s.firstBlood.lostRefs[0], { map: 'Summit', round: 1, date: '2026-11-22' });
});

test('matches without kill assistants are excluded from KAST only, not from the other metrics', () => {
  const noAssistants = kills.map(({ assistants, ...rest }) => rest);
  const s = coachRoundSequence([row({ kills_json: JSON.stringify(noAssistants) })], accounts);
  assert.equal(s.matches, 1);
  assert.equal(s.kast.matches, 0);
  assert.equal(s.kast.excludedMatches, 1);
  assert.equal(s.kast.pct, null);
  assert.equal(s.advantage.rounds, 3);
  assert.equal(s.postPlant.losses, 1);
});

test('a kill total that disagrees with the roster excludes the match instead of guessing', () => {
  const s = coachRoundSequence([row({ kills_json: JSON.stringify(kills.slice(1)) })], accounts);
  assert.equal(s.matches, 0);
  assert.equal(s.excludedMatches, 1);
  assert.equal(s.latest, null);
});

test('per-round ultimate values above the roster match total fail the semantics guard', () => {
  const badPlayers = players.map(p => p.puuid === 'me' ? { ...p, casts: { ultimate: 0 } } : p);
  const s = coachRoundSequence([row({ players_json: JSON.stringify(badPlayers) })], accounts);
  assert.equal(s.matches, 1);
  assert.equal(s.ult.matches, 0);
  assert.equal(s.ult.rounds, 0);
  assert.equal(s.ult.losses, 0);
});
