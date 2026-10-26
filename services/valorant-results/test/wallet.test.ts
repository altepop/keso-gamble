import fixturePlayers from '../players.example.json' with { type: 'json' };
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { URL as NodeURL } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import accounts from '../reward-accounts.example.json' with { type: 'json' };
import { syncRewardAccounts, validateRewardAccounts } from '../src/reward-accounts.ts';
import { grantMatchReward, readWallet } from '../src/wallet.ts';
import { createMatchRewardEvent } from '../src/reward-contract.ts';
import type { RewardPolicy } from '../src/reward-contract.ts';

const guildId = accounts.guildId, user = accounts.accounts[0].discordUserId, linkedAt = 1000;
const policy: RewardPolicy & { startsAt: number } = { enabled: true, currency: 'KC', version: 'test', startsAt: linkedAt, modes: {
  competitive: { participation: 100, winBonus: 50 }, escalation: { participation: 20, winBonus: 10 }, unrated: { participation: 40, winBonus: 15 },
} };
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  const folder = new NodeURL('../migrations/', import.meta.url);
  for (const name of readdirSync(folder).filter(name => name.endsWith('.sql')).sort()) sql.exec(readFileSync(new NodeURL(name, folder), 'utf8'));
  class Query {
    text: string; values: Array<string | number | null> = [];
    constructor(text: string) { this.text = text; }
    bind(...values: Array<string | number | null>) { this.values = values; return this; }
    async first() { const row = sql.prepare(this.text).get(...this.values); return row ? { ...row } : null; }
    async all() { return { results: sql.prepare(this.text).all(...this.values) }; }
    async run() { return { meta: { changes: Number(sql.prepare(this.text).run(...this.values).changes) } }; }
  }
  const db = { prepare(text: string) { return new Query(text); }, async batch(queries: Query[]) {
    sql.exec('BEGIN');
    try { const results = []; for (const query of queries) results.push(await query.run()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
  return { sql, db };
}
async function setup() {
  const fixture = database();
  await fixture.db.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind(accounts.accounts[0].riotId, 'subject', 'ap', 0).run();
  const sync = await syncRewardAccounts(fixture.db, { config: accounts, players: fixturePlayers, guildId, now: linkedAt });
  return { ...fixture, sync };
}
function event(id = 'match', mode = 'competitive', outcome = 'win', endedAt = 5000, puuid = 'subject') {
  return createMatchRewardEvent({
    metadata: { match_id: id, queue: { id: mode }, is_completed: true, started_at: new Date(endedAt - 1000).toISOString(), game_length_in_ms: 1000 },
    players: [{ puuid, team_id: 'red' }],
    teams: [{ team_id: 'red', won: outcome === 'win' }, { team_id: 'blue', won: outcome === 'loss' }],
  }, { guildId, puuid, eligibleSince: 0 }, 10000)!;
}
const grant = (db: D1Database, value = event(), selected = policy) => grantMatchReward(db, value, { policy: selected, guildId, now: 10000 });
const count = (sql: DatabaseSync, table: string) => Number(sql.prepare('SELECT COUNT(*) AS n FROM ' + table).get()!.n);

test('the four supplied Discord IDs remain exact strings; duplicate or unmonitored bindings fail', () => {
  validateRewardAccounts(accounts, fixturePlayers, guildId);
  assert.deepEqual(accounts.accounts.map(account => account.discordUserId), ['100000000000000001','100000000000000002','100000000000000003','100000000000000004']);
  assert.throws(() => validateRewardAccounts({ ...accounts, accounts: [accounts.accounts[0], accounts.accounts[0]] }, fixturePlayers, guildId), /Duplicate/);
  assert.throws(() => validateRewardAccounts({ ...accounts, accounts: [{ ...accounts.accounts[0], riotId: 'stranger#JP1' }] }, fixturePlayers, guildId), /monitored/);
  assert.throws(() => validateRewardAccounts({ ...accounts, accounts: [{ ...accounts.accounts[0], discordUserId: Number(user) as unknown as string }] }, fixturePlayers, guildId), /strings/);
});

test('setup creates zero-balance wallets and waits for unresolved PUUIDs without resetting first registration', async () => {
  const { sql, db, sync } = await setup();
  try {
    assert.deepEqual(sync.linked, [accounts.accounts[0].riotId]);
    assert.equal(sync.pending.length, 3);
    assert.equal(count(sql, 'reward_wallets'), 4);
    assert.deepEqual(await readWallet(db, guildId, user), { currency: 'KC', balance: 0, version: 0 });
    await syncRewardAccounts(db, { config: accounts, players: fixturePlayers, guildId, now: 7000 });
    assert.equal(sql.prepare('SELECT linked_at FROM reward_accounts').get()!.linked_at, linkedAt);
    const changed = structuredClone(accounts); changed.accounts[0].discordUserId = '100000000000000099';
    await assert.rejects(syncRewardAccounts(db, { config: changed, players: fixturePlayers, guildId, now: 8000 }), /reassigned/);
    assert.equal(count(sql, 'reward_wallets'), 4);
    assert.equal(sql.prepare('SELECT active FROM reward_accounts').get()!.active, 1);
  } finally { sql.close(); }
});

test('concurrent retries and policy edits credit a match once, preserving the first amount', async () => {
  const { sql, db } = await setup();
  try {
    const results = await Promise.all(Array.from({ length: 8 }, () => grant(db)));
    assert.equal(results.filter(result => result.status === 'credited').length, 1);
    assert.equal(results.filter(result => result.status === 'duplicate').length, 7);
    assert.deepEqual(await readWallet(db, guildId, user), { currency: 'KC', balance: 150, version: 1 });
    const retry = await grant(db, event(), { ...policy, version: 'changed', modes: { ...policy.modes, competitive: { participation: 1000, winBonus: 500 } } });
    assert.equal(retry.status, 'duplicate');
    if (retry.status === 'duplicate') assert.equal(retry.amount, 150);
    assert.equal(count(sql, 'reward_events'), 1); assert.equal(count(sql, 'wallet_entries'), 1);
  } finally { sql.close(); }
});

test('each mode uses its own reward and draws receive participation only', async () => {
  const { sql, db } = await setup();
  try {
    await grant(db, event('loss', 'competitive', 'loss'));
    await grant(db, event('draw', 'escalation', 'draw'));
    await grant(db, event('win', 'unrated', 'win'));
    assert.deepEqual(await readWallet(db, guildId, user), { currency: 'KC', balance: 175, version: 3 });
  } finally { sql.close(); }
});

test('disabled or unconfigured payouts need no DB, and unknown identities or old matches receive nothing', async () => {
  const inaccessible = { prepare() { throw new Error('DB must not be accessed'); } } as unknown as D1Database;
  assert.equal((await grantMatchReward(inaccessible, event())).status, 'disabled');
  assert.equal((await grantMatchReward(inaccessible, event(), { policy: { ...policy, startsAt: null } })).status, 'unconfigured');
  const { sql, db } = await setup();
  try {
    assert.equal((await grant(db, event('unknown', 'competitive', 'win', 5000, 'stranger'))).status, 'unlinked');
    assert.equal((await grant(db, event('old', 'competitive', 'win', 1000))).status, 'ineligible');
    assert.equal((await grant(db, event(), { ...policy, startsAt: 5000 })).status, 'ineligible');
    await assert.rejects(grantMatchReward(db, event(), { policy, guildId: '100000000000000101' }), /Wrong/);
    sql.exec('UPDATE reward_accounts SET active=0');
    assert.equal((await grant(db)).status, 'ineligible');
    assert.equal(count(sql, 'reward_events'), 0);
  } finally { sql.close(); }
});

test('a failed ledger entry or overflowing balance rolls back the entire credit', async () => {
  const { sql, db } = await setup();
  try {
    sql.exec("CREATE TRIGGER reject_test_entry BEFORE INSERT ON wallet_entries BEGIN SELECT RAISE(ABORT,'test rejection'); END;");
    await assert.rejects(grant(db), /test rejection/);
    assert.equal(count(sql, 'reward_events'), 0);
    assert.equal((await readWallet(db, guildId, user))!.balance, 0);
    sql.exec('DROP TRIGGER reject_test_entry');
    sql.prepare('UPDATE reward_wallets SET balance=? WHERE discord_user_id=?').run(Number.MAX_SAFE_INTEGER - 100, user);
    await assert.rejects(grant(db), /CHECK constraint/);
    assert.equal(count(sql, 'reward_events'), 0); assert.equal(count(sql, 'wallet_entries'), 0);
    assert.equal((await readWallet(db, guildId, user))!.balance, Number.MAX_SAFE_INTEGER - 100);
  } finally { sql.close(); }
});

test('removing monitored players preserves the reward history and currency cannot silently change', async () => {
  const { sql, db } = await setup();
  try {
    await grant(db);
    sql.exec('DELETE FROM tracked_players');
    assert.equal((await readWallet(db, guildId, user))!.balance, 150);
    assert.equal(count(sql, 'reward_events'), 1);
    assert.throws(() => sql.exec("UPDATE reward_wallets SET currency='KP'"), /explicit migration/);
  } finally { sql.close(); }
});
