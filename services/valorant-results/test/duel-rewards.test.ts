import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {DUEL_REWARD_DDL} from '../src/duel-rewards.ts';
import {DUEL_PROGRESSION_DDL} from '../src/duel-progression-schema.ts';

test('reward issuance is opt-in, capped across games, isolated by mode, and idempotent', () => {
  const db = new DatabaseSync(':memory:');
  const midnight = Date.parse('2026-11-21T00:00:00+09:00');
  try {
    for (const sql of [...DUEL_PROGRESSION_DDL,...DUEL_REWARD_DDL]) db.exec(sql);
    const receipt = db.prepare(`INSERT OR IGNORE INTO kp_duel_progress_receipts
      VALUES('guild',?,'player',?,?,?,'win',1,?,?)`);
    const finish = (id: string, opponent: string|null, game = 'othello', at = midnight-1) =>
      receipt.run(id,opponent ? 'pvp' : 'pve',game,opponent,at,at);
    const count = (table: 'rolls'|'collection') =>
      db.prepare('SELECT count(*) AS n FROM kp_duel_reward_'+table).get()?.n;

    finish('unconfigured','a');
    assert.equal(count('rolls'),0);
    db.exec(`INSERT INTO kp_duel_reward_policy VALUES
      ('guild','pvp',0,2,1,10000,0,0),('guild','pve',0,1,NULL,10000,0,0)`);
    finish('unconfigured','a');
    assert.equal(count('rolls'),0);
    finish('first','a');
    finish('first','a');
    finish('same-person','a','gomoku');
    finish('second','b','gomoku');
    finish('daily-cap','c','poker');
    finish('pve-first',null);
    finish('pve-cap',null,'poker');
    assert.equal(count('rolls'),3);
    assert.equal(count('collection'),3);
    db.exec('BEGIN');
    finish('rolled-back','a','poker',midnight);
    db.exec('ROLLBACK');
    assert.equal(count('rolls'),3);
    finish('new-day','a','poker',midnight);
    assert.equal(count('rolls'),4);
    assert.equal(count('collection'),4);
  } finally {
    db.close();
  }
});

test('a 30-day rotated-opponent workload keeps reward writes and quota reads bounded', () => {
  const db = new DatabaseSync(':memory:');
  const days = 30;
  const dailyCap = 4;
  const start = Date.parse('2026-11-20T00:00:00+09:00');
  try {
    for (const sql of [...DUEL_PROGRESSION_DDL,...DUEL_REWARD_DDL]) db.exec(sql);
    db.prepare("INSERT INTO kp_duel_reward_policy VALUES('guild','pvp',0,?,1,10000,0,0)")
      .run(dailyCap);
    const finish = db.prepare(`INSERT INTO kp_duel_progress_receipts
      VALUES('guild',?,'player','pvp','othello',?,'win',1,?,?)`);
    db.exec('BEGIN');
    for (let day = 0; day < days; day++) {
      for (let round = 0; round < 240; round++) {
        const at = start + day * 86400000 + round * 360000;
        finish.run(`${day}-${round}`,`opponent-${round % 12}`,at,at);
      }
    }
    db.exec('COMMIT');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_progress_receipts').get()?.n,7200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_reward_rolls').get()?.n,days*dailyCap);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kp_duel_reward_collection').get()?.n,1);
    for (const predicate of ['', " AND opponent='opponent-0'"]) {
      const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT COUNT(*) FROM kp_duel_reward_rolls
        WHERE guild='guild' AND user='player' AND mode='pvp' AND jst_day=20780${predicate}`).all();
      assert.match(JSON.stringify(plan),/SEARCH .* USING COVERING INDEX kp_duel_reward_rolls_day/);
    }
  } finally {
    db.close();
  }
});
