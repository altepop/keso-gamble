import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDefinitionCatalogue, validateDefinitionBundle} from '../../../js/pachinko/definitions.js';

const fixture = () => Object.fromEntries(['machine', 'board', 'effects', 'assets'].map(kind => [
  kind, JSON.parse(readFileSync(new URL('../../../tests/fixtures/pachinko/' + kind + '.json', import.meta.url), 'utf8')),
]));
const refs = bundle => Object.fromEntries(Object.entries(bundle).map(([kind, value]) => [kind, {id: value.id, version: value.version}]));

test('four independent definitions form a deeply frozen fixture without changing the source', () => {
  const input = fixture();
  const output = validateDefinitionBundle(input);
  assert.deepEqual(output, input);
  assert.throws(() => { output.board.pins[0].center.xUm = 0; }, TypeError);
  input.board.pins[0].center.xUm = 0;
  assert.notEqual(output.board.pins[0].center.xUm, input.board.pins[0].center.xUm);
});

test('rejects missing, unknown, non-integer, out-of-bounds and unsupported values', () => {
  const cases = [
    [b => { delete b.machine.economy.rounding; }, /rounding: missing field/],
    [b => { b.machine.title = 'unknown'; }, /title: unknown field/],
    [b => { b.machine.lottery.normal.numerator = 11; }, /normal.numerator/],
    [b => { b.machine.lottery.normal.denominator = 0; }, /normal.denominator/],
    [b => { b.machine.economy.maxBalls = 1; }, /exceeds maxBalls/],
    [b => { b.machine.status = 'live'; }, /machine.status/],
    [b => { b.board.schemaVersion = 99; }, /unsupported schema version/],
    [b => { b.board.physics.stepUs = 0.5; }, /stepUs/],
    [b => { b.board.launch.left.xUm = b.board.widthUm + 1; }, /launch.left.xUm/],
    [b => { b.board.pins[0].radiusUm = b.board.widthUm; }, /radiusUm/],
    [b => { b.board.rails[0].id = b.board.pins[0].id; }, /duplicate board object/],
    [b => { b.board.pockets.pop(); }, /requires one drain/],
    [b => { b.board.gates[0].pocketId = 'missing'; }, /unknown pocket/],
    [b => { b.machine.board.version++; }, /reference version/],
  ];
  for (const [modify, error] of cases) {
    const bundle = fixture();
    modify(bundle);
    assert.throws(() => validateDefinitionBundle(bundle), error);
  }
});

test('effect targets, times, result compatibility and asset provenance are checked', () => {
  const cases = [
    [b => { b.effects.entries[0].tracks[0].target = 'outside'; }, /tracks.target/],
    [b => { b.effects.entries[0].tracks[0].property = 'script'; }, /tracks.property/],
    [b => { b.effects.entries[0].tracks[0].keyframes[1].atMs = 0; }, /tracks.atMs/],
    [b => { b.effects.entries[0].tracks[0].keyframes[1].value = 1001; }, /tracks.value/],
    [b => { b.effects.entries[0].assetIds.push('missing'); }, /unknown asset/],
    [b => { b.effects.entries[1].resultClasses = ['jackpot']; }, /same results/],
    [b => { b.effects.entries[1].fallbackId = 'settled'; }, /fallback cycle/],
  ];
  for (const [modify, error] of cases) {
    const bundle = fixture();
    modify(bundle);
    assert.throws(() => validateDefinitionBundle(bundle), error);
  }
  const bundle = fixture();
  const asset = {id:'fixture-art', path:'assets/pachinko/fixture-art.png', sha256:'a'.repeat(64), bytes:1, license:'test', source:'fixture', credit:'fixture', consent:'not-required', fallbackId:null};
  bundle.assets.entries.push(asset);
  bundle.effects.entries[0].assetIds.push(asset.id);
  validateDefinitionBundle(bundle);
  asset.path = 'assets/pachinko/../other.png';
  assert.throws(() => validateDefinitionBundle(bundle), /local asset path/);
  asset.path = 'assets/pachinko/fixture-art.png';
  asset.source = '';
  assert.throws(() => validateDefinitionBundle(bundle), /missing provenance/);
});

test('restores exact old versions and rejects missing, mixed and silently changed versions', () => {
  const old = fixture();
  const next = fixture();
  next.machine.version++;
  next.board.version++;
  next.machine.board.version++;
  next.board.pins[0].center.xUm++;
  const catalogue = createDefinitionCatalogue([old, next]);
  assert.equal(catalogue.restore(refs(old)).board.pins[0].center.xUm, old.board.pins[0].center.xUm);
  assert.equal(catalogue.restore(refs(next)).board.pins[0].center.xUm, next.board.pins[0].center.xUm);
  assert.throws(() => createDefinitionCatalogue([next]).restore(refs(old)), /version unavailable/);
  assert.throws(() => catalogue.restore({...refs(old), board: refs(next).board}), /version unavailable/);
  assert.throws(() => createDefinitionCatalogue([old, old]), /duplicate machine version/);
  next.board.version--;
  next.machine.board.version--;
  assert.throws(() => createDefinitionCatalogue([old, next]), /changed without a new version/);
});
