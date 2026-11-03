import test from 'node:test';
import assert from 'node:assert/strict';
import { minesStart, minesPick, minesCashout, minesMultiplier, playSlot, slotPayout, SLOT_SYMBOLS, SLOT_WEIGHT, vpDeal, vpDraw, vpHand, VP_PAYS, playBaccarat, baccaratDeal, baccaratPayout, hydrateMoreCasino, createMoreCasino } from '../js/casino-more.js';
import { createInitialState, hydrateState } from '../js/engine.js';

const seq = values => { let i = 0; return n => { const v = values[i++]; if (v === undefined) throw Error('ran out'); return v % n; }; };
const wallet = cash => ({ ...createInitialState(0), cash });
const c = (r, s = 0) => ({ r, s });

test('マインズ：開けるほど倍率が上がり、降りれば払戻し。地雷は開けるたびに残りの確率で決まる', () => {
  assert.equal(minesMultiplier(3, 1), 1.1); assert.equal(minesMultiplier(1, 24), 24.25); assert.equal(minesMultiplier(10, 15), 100, 'capped');
  const s = wallet(1000);
  minesStart(s, 500, 3); assert.equal(s.cash, 500);
  assert.throws(() => minesCashout(s, seq([])), /1マス以上/);
  // roll 3 of 25 left is past the 3 mines: safe.
  assert.equal(minesPick(s, 7, seq([3])).done, null); assert.deepEqual(s.mines.opened, [7]);
  assert.throws(() => minesPick(s, 7, seq([5])), /もう開いて/);
  minesPick(s, 8, seq([10]));
  const out = minesCashout(s, seq([0, 0, 0]));
  assert.equal(out.done.payout, Math.floor(500 * minesMultiplier(3, 2))); assert.equal(s.cash, 500 + out.done.payout);
  assert.equal(out.done.bombs.length, 3); assert.ok(out.done.bombs.every(b => ![7, 8].includes(b)));
  assert.equal(s.mines, null); assert.equal(s.minesHistory[0].net, out.done.payout - 500);
  // A mine: roll below the number of mines. The picked cell is one of them and the bet is lost.
  minesStart(s, 500, 5); const boom = minesPick(s, 12, seq([4, 0, 0, 0, 0]));
  assert.equal(boom.done.net, -500); assert.ok(boom.done.bombs.includes(12)); assert.equal(boom.done.bombs.length, 5);
  assert.throws(() => minesStart(s, 500, 2), /地雷の数/);
});

test('マインズ：安全なマスを全部開けるか上限に届くと自動で降りる', () => {
  const s = wallet(1000); minesStart(s, 100, 10);
  let done = null; for (let cell = 0; cell < 15 && !done; cell++) done = minesPick(s, cell, n => n - 1).done;
  assert.ok(done); assert.equal(done.multiplier, 100); assert.equal(done.payout, 10000); assert.equal(s.mines, null);
});

test('スロット：配当表とリールの重みから払戻し率は約89%（共有ジャックポットは別）', () => {
  let total = 0;
  const ids = SLOT_SYMBOLS.flatMap(([id, , w]) => Array(w).fill(id));
  assert.equal(ids.length, SLOT_WEIGHT);
  for (const a of ids) for (const b of ids) for (const d of ids) total += slotPayout([a, b, d], 100);
  const rtp = total / (100 * SLOT_WEIGHT ** 3);
  assert.ok(rtp > 0.88 && rtp < 0.90, String(rtp));
  assert.equal(slotPayout(['cherry', 'lemon', 'cherry'], 100), 150);
});

test('スロット：💎💎💎で共有ジャックポット（1,000 KP未満の賭けは割合）。デモはジャックポットなし', () => {
  const diamonds = seq([20, 20, 20]); // the last weight band is 💎
  const s = wallet(10000);
  const full = playSlot(s, 1000, diamonds, { amount: 50000, version: 3 }).done;
  assert.deepEqual(full.reels, ['diamond', 'diamond', 'diamond']); assert.equal(full.jackpot, 50000); assert.equal(full.payout, 300000 + 50000);
  assert.deepEqual(full.pool, { before: 50000, version: 3, contribution: 30 });
  const part = playSlot(wallet(1000), 100, seq([20, 20, 20]), { amount: 50000, version: 3 }).done;
  assert.equal(part.jackpot, 5000);
  const demo = playSlot(wallet(1000), 100, seq([20, 20, 20])).done;
  assert.equal(demo.jackpot, 0); assert.equal(demo.pool, undefined);
  const lose = playSlot(wallet(1000), 100, seq([0, 6, 11])).done;
  assert.deepEqual(lose.reels, ['cherry', 'lemon', 'bell']); assert.equal(lose.net, -100);
});

test('ビデオポーカー：役の判定と配当、交換は手札にないカードから', () => {
  assert.equal(vpHand([c(10), c(11), c(12), c(13), c(1)]), 'royal');
  assert.equal(vpHand([c(1), c(2), c(3), c(4), c(5)]), 'straight-flush');
  assert.equal(vpHand([c(1, 0), c(2, 1), c(3, 2), c(4, 3), c(5, 0)]), 'straight');
  assert.equal(vpHand([c(9, 0), c(9, 1), c(9, 2), c(9, 3), c(2)]), 'four');
  assert.equal(vpHand([c(9, 0), c(9, 1), c(9, 2), c(2, 3), c(2)]), 'full-house');
  assert.equal(vpHand([c(11, 0), c(11, 1), c(3, 2), c(4, 3), c(8)]), 'jacks');
  assert.equal(vpHand([c(10, 0), c(10, 1), c(3, 2), c(4, 3), c(8)]), 'none');
  assert.equal(vpHand([c(1, 0), c(1, 1), c(3, 2), c(4, 3), c(8)]), 'jacks', 'aces are high');
  const s = wallet(1000);
  vpDeal(s, 200, seq([0, 0, 0, 0, 0])); // 52 cards: always the first free card
  assert.deepEqual(s.vp.cards, [c(1, 0), c(2, 0), c(3, 0), c(4, 0), c(5, 0)]); assert.equal(s.cash, 800);
  const out = vpDraw(s, [true, true, true, true, false], seq([0]));
  assert.deepEqual(out.done.cards.at(-1), c(6, 0), 'the replacement is not a card already dealt');
  assert.equal(out.done.hand, 'flush'); assert.equal(out.done.payout, 200 * VP_PAYS.flush); assert.equal(s.vp, null);
  assert.throws(() => vpDraw(s, [true, true, true, true, true], seq([])), /配られている手/);
});

test('バカラ：3枚目のルールと配当（バンカーは5%手数料、引き分けでプレイヤー・バンカーは返金）', () => {
  const deal = cards => { let i = 0; return () => cards[i++]; };
  // Natural: no third card.
  assert.deepEqual(baccaratDeal(deal([c(8), c(13), c(3), c(4)])).points, { player: 8, banker: 7 });
  // Player 4 draws an 8 (2); banker 3 stands only on a third 8.
  const d = baccaratDeal(deal([c(2), c(2), c(1), c(2), c(8), c(9)]));
  assert.equal(d.player.length, 3); assert.equal(d.banker.length, 2); assert.equal(d.winner, 'banker');
  // Player stands on 6; banker 5 draws.
  const e = baccaratDeal(deal([c(3), c(3), c(2), c(3), c(4)]));
  assert.equal(e.player.length, 2); assert.equal(e.banker.length, 3); assert.equal(e.points.banker, 9);
  assert.equal(baccaratPayout('banker', 'banker', 1000), 1950); assert.equal(baccaratPayout('player', 'tie', 1000), 1000);
  assert.equal(baccaratPayout('tie', 'tie', 1000), 9000); assert.equal(baccaratPayout('player', 'banker', 1000), 0);
  const s = wallet(5000); const out = playBaccarat(s, 1000, 'banker', deal([c(3), c(3), c(2), c(3), c(4)])).done;
  assert.equal(out.net, 950); assert.equal(s.cash, 5950); assert.equal(s.baccarat.length, 1);
  assert.throws(() => playBaccarat(s, 1000, 'dealer', deal([])), /プレイヤー・バンカー/);
});

test('勝負中の手と履歴は保存・復元され、壊れた値は捨てる。賭け金の範囲と所持KPを守る', () => {
  const s = wallet(5000); minesStart(s, 500, 3); minesPick(s, 4, seq([10])); vpDeal(s, 300, seq([7, 7, 7, 7, 7]));
  playSlot(s, 100, seq([0, 0, 0]));
  const back = hydrateState(JSON.parse(JSON.stringify(s)), Date.now());
  assert.deepEqual(back.mines, s.mines); assert.deepEqual(back.vp, s.vp); assert.equal(back.slots.length, 1);
  assert.deepEqual(hydrateMoreCasino({ mines: { bet: 500, mines: 3, opened: [1, 1], time: 1 }, vp: { bet: 50, cards: [], time: 1 } }), createMoreCasino());
  assert.throws(() => playSlot(wallet(50), 100, seq([0, 0, 0])), /不足/);
  assert.throws(() => playSlot(wallet(50000), 20100, seq([0, 0, 0])), /100〜20,000/);
});
