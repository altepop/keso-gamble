import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const {scripts} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const commands = name => scripts[name].split(' && ').map(command => command.trim());

test('parallel browser shards cover all existing tests in the same order, exactly once', () => {
  const complete = commands('test:browser:all');
  const sharded = [...commands('test:browser:core'), ...commands('test:browser:extended')];
  assert.equal(complete.length, 30);
  assert.deepEqual(sharded, complete);
  assert.ok(complete.includes('node scripts/coach-browser-check.cjs webkit'));
  assert.ok(complete.includes('node scripts/coach-browser-check.cjs'));
  assert.equal(new Set(sharded).size, sharded.length);
});
