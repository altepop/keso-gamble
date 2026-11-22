import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const load = (path, extra = {}) => {
  const ctx = {URL, ...extra};
  vm.runInNewContext(readFileSync(new URL(path, import.meta.url), 'utf8'), ctx);
  return ctx;
};
const topCtx = load('../coach/muse-top-config.js');
const top = topCtx.KesoCoachMuseTop;
const presetsCtx = load('../coach/muse-presets.js');
const presets = presetsCtx.KesoCoachMusePresets.PRESETS;
const viewCtx = load('../coach/muse-view.js', {KesoCoachMuseTop: top, KesoCoachMusePresets: presetsCtx.KesoCoachMusePresets});
const view = viewCtx.KesoCoachMuseView;

const report = {
  person: 'テスト太郎',
  profile: 'テスト太郎',
  accounts: ['Main#001'],
  performance: {
    overall: {matches: 10, wins: 6, knownOutcomes: 10, winPct: 60, kd: 1.2, acs: 230, adr: 150, hsPct: 25},
    maps: [{value: 'Summit', matches: 4, wins: 1, losses: 3, knownOutcomes: 4, winPct: 25, acs: 210, kd: 1.0}],
    agents: [{value: 'Clove', matches: 6, wins: 4, losses: 2, knownOutcomes: 6, winPct: 66.7, acs: 250, kd: 1.3}],
    timeline: [{map: 'Summit', agent: 'Clove', outcome: 'loss', acs: 205}],
  },
  individual: [{player: 'テスト太郎', matches: 10, matchWins: 6, matchLosses: 4, totalKills: 120, totalDeaths: 100,
    firstKills: 5, firstDeaths: 4, firstKillWins: 2, firstKillLosses: 3, firstDeathKillerEliminatedWithin5s: 1}],
  fullDiagnosis: {items: [
    {subject: 'テスト太郎', title: 'トレード', status: 'focus', evidence: '成立が少ない', reason: '距離が離れています', nextAction: '味方の後ろで撃つ'},
    {subject: 'テスト太郎', title: '火力', status: 'good', evidence: 'ACSが高い', reason: '撃ち合いが安定', nextAction: '継続'},
  ]},
  roundContext: {
    bands: [{key: 'under1000', rounds: 12, knownOutcomes: 12, wins: 2}],
    pistols: {rounds: 20, knownOutcomes: 20, wins: 9},
    spike: {plant: {events: 0}, defuse: {events: 0}},
    abilities: {ultimate: {casts: 0}},
  },
  matchTrend: [{date: '2026-11-22', map: 'Summit', agent: 'Clove', outcome: 'loss', kills: 12, deaths: 15, assists: 6}],
};

test('all seven map presets pass the registry validation with verified https sources', () => {
  assert.deepEqual(Object.keys(presets).sort(), [...top.MAPS].sort());
  for (const map of top.MAPS) {
    const p = top.validatePreset(map, presets[map]);
    assert.ok(p, map);
    assert.ok(p.study.sources.length >= 1, map);
    assert.ok(p.study.sources.every(s => s.title.length > 0 && s.url.startsWith('https://')), map);
    assert.ok(presets[map].study.sources.every(s => s.verified === true), map);
    assert.ok(p.warmup.steps.length >= 3, map);
  }
});

test('model binds only real report values and never invents rank or KAST', () => {
  const m = view.model(report, {date: '2026-11-22'});
  assert.equal(m.person, 'テスト太郎');
  assert.equal(m.matches, 10);
  assert.equal(m.stats.acs, 230);
  assert.equal(m.stats.winPct, 60);
  assert.equal(m.weak.length, 1);
  assert.equal(m.strong.length, 1);
  assert.equal(m.latest.map, 'Summit');
  assert.equal(m.latest.outcome, 'loss');
  assert.equal(m.latest.acs, 205);
  assert.ok(top.MAPS.includes(m.study.map));
  assert.ok(m.study.theme.length > 0);
  assert.ok(m.study.sources.length >= 1);
  assert.equal(m.maps.length, 7);
});

test('empty report degrades to nulls the renderer shows as 未取得', () => {
  const m = view.model({}, {date: '2026-11-22'});
  assert.equal(m.person, '');
  assert.equal(m.matches, null);
  assert.equal(m.stats.acs, null);
  assert.equal(m.latest, null);
  assert.equal(m.weak.length, 0);
  assert.equal(m.accounts.length, 0);
});

test('turning points detect only what the data supports and keep the rest unknown', () => {
  const rows = view.turningPoints(report);
  assert.equal(rows.length, 7);
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(byId.economy.status, 'detected');
  assert.equal(byId.pistol.status, 'detected');
  assert.equal(byId.firstblood.status, 'detected');
  for (const id of ['advantage', 'weapon', 'postplant', 'ult']) assert.equal(byId[id].status, 'unknown', id);
  assert.ok(byId.weapon.detail.includes('推定'));
});

test('round sequences and MMR snapshots bind KAST, rank and every turning-point criterion', () => {
  const full = {
    ...report,
    roundSequence: {
      matches: 8, excludedMatches: 1,
      kast: {matches: 7, excludedMatches: 1, rounds: 160, kastRounds: 120, pct: 75},
      advantage: {rounds: 40, wins: 26, losses: 14, conversionPct: 65,
        tiers: [{key: '5v4', rounds: 30, wins: 20, losses: 10}],
        lossRefs: [{map: 'Summit', round: 7, date: '2026-11-21'}]},
      postPlant: {plants: 12, wins: 8, losses: 4, lossRefs: [{map: 'Bind', round: 15, date: '2026-11-20'}]},
      ult: {matches: 8, rounds: 9, wins: 5, losses: 4, lossRefs: [{map: 'Haven', round: 3, date: '2026-11-19'}]},
      snowball: {candidates: 2, refs: [{map: 'Lotus', round: 11, date: '2026-11-18'}]},
      pistolFlip: {pairs: 16, flips: 5, against: 3, for: 2, againstRefs: [{map: 'Summit', round: 3, date: '2026-11-21'}]},
      firstBlood: {lostRefs: [{map: 'Summit', round: 5, date: '2026-11-21'}]},
      latest: {map: 'Summit', date: '2026-11-21', tradeDeaths: 10, tradeTraded: 6, tradePct: 60, advRounds: 5, advWins: 3, advPct: 60},
    },
    mmr: {accounts: [{riotId: 'Main#001', tier: 20, tierPatched: 'Diamond 3', rankingInTier: 62, mmrChange: 17, peakTier: 23, peakPatched: 'Ascendant 3', peakSeason: 'E9 A1', fetchedAt: 1}]},
  };
  const m = view.model(full, {date: '2026-11-22'});
  assert.equal(m.stats.kast, 75);
  assert.equal(m.rank.current, 'DIAMOND 3 · 62 RR');
  assert.equal(m.rank.peak, 'ASCENDANT 3');
  assert.equal(m.seqLatest.tradePct, 60);
  const rows = view.turningPoints(full);
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(byId.advantage.status, 'detected');
  assert.ok(byId.advantage.detail.includes('該当は サミット 第7ラウンド'));
  assert.equal(byId.postplant.status, 'detected');
  assert.ok(byId.postplant.detail.includes('バインド 第15ラウンド'));
  assert.equal(byId.ult.status, 'detected');
  assert.equal(byId.weapon.status, 'estimated');
  assert.ok(byId.weapon.detail.includes('推定'));
  assert.ok(byId.pistol.detail.includes('第3ラウンドで流れが反転したのは 5 件'));
  assert.ok(byId.firstblood.detail.includes('該当は サミット 第5ラウンド'));
  assert.equal(m.topTurning.id, 'advantage');
});

test('empty report keeps rank and KAST unset', () => {
  const m = view.model({}, {date: '2026-11-22'});
  assert.equal(m.rank, null);
  assert.equal(m.stats.kast, null);
  assert.equal(m.seqLatest, null);
});

test('production template carries no prototype sample values', () => {
  const html = readFileSync(new URL('../coach.html', import.meta.url), 'utf8');
  const template = html.split('<template id="coach-muse-template">')[1].split('</template>')[0];
  for (const sample of ['88試合', '69.4%', 'DIAMOND 3', 'ASCENDANT 1', '0勝4敗', 'Aquatopia', 'Abema#ttv'])
    assert.ok(!template.includes(sample), sample);
  assert.ok(template.includes('data-mb-list="criteria"'));
  assert.ok(template.includes('推定であることを明記した上で候補として提示し、断定はしません'));
});

test('muse modules stay free of fetch and storage access', () => {
  for (const path of ['../coach/muse-view.js', '../coach/muse-presets.js']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.ok(!/fetch\(|localStorage|sessionStorage/.test(source), path);
  }
});

test('home flow bar exposes the hooks the done toggles drive', () => {
  const html = readFileSync(new URL('../coach.html', import.meta.url), 'utf8');
  const template = html.split('<template id="coach-muse-template">')[1].split('</template>')[0];
  for (const hook of ['data-mb-flow="pdca"', 'data-mb-step="today"', 'data-mb-step="comp"',
    'data-mb="flowTodaySub"', 'data-mb="flowCompSub"', 'data-mb="cycleProgress"',
    'data-mb="warmErr"', 'data-mb="studyErr"'])
    assert.ok(template.includes(hook), hook);
});

test('done state is judged through the practice records, not held locally', () => {
  const source = readFileSync(new URL('../coach/muse-view.js', import.meta.url), 'utf8');
  assert.ok(source.includes('ctx.doneState'));
  assert.ok(source.includes('ctx.onDoneChange'));
  const records = readFileSync(new URL('../coach/records.js', import.meta.url), 'utf8');
  for (const name of ['dailyJudgment', 'judgeDaily', 'unjudgeDaily'])
    assert.ok(records.includes(name), name);
  assert.ok(records.includes("save(f,'/api/kp/coach/practice/records'"));
  const html = readFileSync(new URL('../coach.html', import.meta.url), 'utf8');
  assert.ok(html.includes('coachRecords.judgeDaily'));
  assert.ok(html.includes('coachRecords.unjudgeDaily'));
  assert.ok(html.includes('coachRecords.dailyJudgment'));
  assert.ok(!html.includes('keso-coach-muse-done-v1'));
});

test('MMR rank is limited to an explicitly listed account, never another member', () => {
  const mmr = {accounts: [
    {riotId: 'Other#002', tierPatched: 'Immortal 1', rankingInTier: 80},
    {riotId: 'Main#001', tierPatched: 'Diamond 2', rankingInTier: 40},
  ]};
  const own = view.model({...report, mmr}, {date: '2026-11-22'});
  assert.equal(own.rank.current, 'DIAMOND 2 · 40 RR');

  const missing = view.model({...report, accounts: ['Missing#003'], mmr}, {date: '2026-11-22'});
  assert.equal(missing.rank, null);

  const noIdentity = view.model({...report, accounts: [], mmr}, {date: '2026-11-22'});
  assert.equal(noIdentity.rank, null);

  const singleSnapshot = view.model({...report, accounts: [], mmr: {accounts: [mmr.accounts[1]]}}, {date: '2026-11-22'});
  assert.equal(singleSnapshot.rank.current, 'DIAMOND 2 · 40 RR');
});
