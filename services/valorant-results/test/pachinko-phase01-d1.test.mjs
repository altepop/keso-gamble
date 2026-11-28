import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {Miniflare} from 'miniflare';
import {initializeKp, syncKpAccounts} from '../src/kp.ts';
import {operateKp, readKpState} from '../src/kp-api.ts';

const guild = '100000000000000100';
const accounts = Array.from({length: 10}, (_, index) => ({
  riotId: 'Fixture' + index + '#JP1',
  discordUserId: String(100000000000000101n + BigInt(index)),
}));
const mapping = {guildId: guild, accounts};
const identifier = value => '"' + value.replaceAll('"', '""') + '"';

async function migrateFixture(db) {
  // Compile complete migration files with SQLite, then copy their final
  // schema and seed data. Install triggers last to avoid replaying seed effects.
  const source = new DatabaseSync(':memory:');
  try {
    const dir = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) {
      source.exec(readFileSync(new URL(file, dir), 'utf8'));
    }
    const schema = source.prepare("SELECT name,type,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
    for (const entry of schema.filter(item => item.type === 'table')) {
      await db.prepare(entry.sql).run();
    }
    for (const entry of schema.filter(item => item.type === 'table')) {
      const rows = source.prepare('SELECT * FROM ' + identifier(entry.name)).all();
      for (const row of rows) {
        const keys = Object.keys(row);
        const sql = 'INSERT INTO ' + identifier(entry.name) + '(' + keys.map(identifier).join(',') + ') VALUES (' + keys.map(() => '?').join(',') + ')';
        await db.prepare(sql).bind(...keys.map(key => row[key])).run();
      }
    }
    for (const entry of schema.filter(item => item.type !== 'table')) {
      await db.prepare(entry.sql).run();
    }
  } finally {
    source.close();
  }
}

function measuredDatabase(db, totals) {
  const capture = result => {
    assert.ok(Number.isSafeInteger(result.meta?.rows_read), 'D1 rows_read must be available');
    assert.ok(Number.isSafeInteger(result.meta?.rows_written), 'D1 rows_written must be available');
    totals.statements++;
    totals.rowsRead += result.meta.rows_read;
    totals.rowsWritten += result.meta.rows_written;
    return result;
  };
  function wrap(statement) {
    return {
      statement,
      bind: (...values) => wrap(statement.bind(...values)),
      all: async () => capture(await statement.all()),
      run: async () => capture(await statement.run()),
      async first(column) {
        const row = capture(await statement.all()).results[0] ?? null;
        return column === undefined || row === null ? row : row[column];
      },
    };
  }
  return {
    prepare: sql => wrap(db.prepare(sql)),
    batch: async statements => (await db.batch(statements.map(value => value.statement))).map(capture),
  };
}

const operationId = (action, user) => 'phase01-' + action + '-' + user;
const p = (values, percentile) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * percentile) - 1];
function aggregate(samples) {
  const sums = Object.fromEntries(['statements', 'rowsRead', 'rowsWritten'].map(key => [
    key, samples.reduce((total, item) => total + item[key], 0),
  ]));
  return {...sums, samples: samples.length, p50Ms: +p(samples.map(item => item.ms), 0.5).toFixed(2), p95Ms: +p(samples.map(item => item.ms), 0.95).toFixed(2)};
}

test('Phase 01 isolated D1 baseline for casino settlement, replay and wallet state', async () => {
  for (const size of [1, 10]) {
    const runtime = new Miniflare({workers: [{config: {
      name: 'pachinko-phase01-baseline',
      compatibilityDate: '2026-10-24',
      env: {DB: {type: 'd1'}},
      manifest: {mainModule: 'worker.mjs', modules: {'worker.mjs': {
        type: 'esm', contents: 'export default {fetch(){return new Response("fixture only")}}',
      }}},
    }}]});
    try {
      const db = await runtime.getD1Database('DB', 'pachinko-phase01-baseline');
      await migrateFixture(db);
      const fixtureMapping = {...mapping, accounts: accounts.slice(0, size)};
      for (const [index, account] of fixtureMapping.accounts.entries()) {
        await db.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind(account.riotId, 'fixture-' + index, 'ap', 0).run();
      }
      const setup = {DB: db, KP_BOOTSTRAP_PRIVATE_KEY: 'fixture-only'};
      assert.ok(await initializeKp(setup, fixtureMapping));
      await syncKpAccounts(setup, fixtureMapping);
      for (const account of fixtureMapping.accounts) {
        await db.prepare("INSERT INTO kp_ledger VALUES(?,?,?,?,'baseline-fixture',0)").bind('fund-' + account.discordUserId, guild, account.discordUserId, 20000).run();
      }

      // Keep one stable DB adapter for each synthetic participant so isolate
      // caches survive repeated operations, without mixing per-user counters.
      const users = fixtureMapping.accounts.map(account => {
        const totals = {statements: 0, rowsRead: 0, rowsWritten: 0};
        return {id: account.discordUserId, totals, env: {...setup, DB: measuredDatabase(db, totals)}};
      });
      const results = {};
      async function measure(name, action) {
        const samples = await Promise.all(users.map(async user => {
          Object.assign(user.totals, {statements: 0, rowsRead: 0, rowsWritten: 0});
          const start = performance.now();
          const value = await action(user);
          return {...user.totals, ms: performance.now() - start, value};
        }));
        results[name] = aggregate(samples);
        return samples.map(sample => sample.value);
      }
      const operation = (user, action, args) => operateKp(user.env, fixtureMapping, user.id, operationId(action, user.id), action, args);
      await measure('initialState', user => readKpState(user.env, fixtureMapping, user.id));
      await measure('warmState', user => readKpState(user.env, fixtureMapping, user.id));
      const first = await measure('chinchiro', user => operation(user, 'chinchiro', {amount: 100}));
      const replay = await measure('chinchiroReplay', user => operation(user, 'chinchiro', {amount: 100}));
      assert.deepEqual(replay, first);
      assert.equal(results.chinchiroReplay.rowsWritten, 0);
      await measure('minesStart', user => operation(user, 'mines-start', {amount: 100, mines: 3}));
      // Start each cashout from the same eligible state. This fixture write
      // stands in for one successful pick and is excluded from all measurements.
      for (const user of users) {
        await db.prepare("UPDATE kp_state SET data=json_set(data,'$.mines.opened',json('[12]')) WHERE guild=? AND user=?").bind(guild, user.id).run();
      }
      await measure('minesCashout', user => operation(user, 'mines-cashout', {}));
      await measure('stateAfterSettlement', user => readKpState(user.env, fixtureMapping, user.id));
      const actual = await db.prepare('SELECT COUNT(*) AS n FROM kp_operations WHERE guild=?').bind(guild).first('n');
      assert.equal(actual, size * 3);
      console.log('PACHINKO_PHASE01_D1 ' + JSON.stringify({users: size, results}));
    } finally {
      await runtime.dispose();
    }
  }
});
