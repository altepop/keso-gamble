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
