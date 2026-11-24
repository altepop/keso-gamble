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
    db.exec(`INSERT INTO kp_duel_reward_policy_v2 VALUES
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
    db.prepare("INSERT INTO kp_duel_reward_policy_v2 VALUES('guild','pvp',0,?,1,10000,0,0)")
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

test('approved unlimited PvE and PvP per-opponent cap with 13th lifetime roll decay', () => {
  const db = new DatabaseSync(':memory:');
  const day = Date.parse('2026-11-20T12:00:00+09:00');
  try {
    for (const sql of [...DUEL_PROGRESSION_DDL,...DUEL_REWARD_DDL]) db.exec(sql);
    db.exec("INSERT INTO kp_duel_reward_policy_v2 VALUES ('guild','pve',0,NULL,NULL,1000,0,0),('guild','pvp',0,NULL,4,1000,500,500)");
    const receipt = db.prepare(`INSERT INTO kp_duel_progress_receipts
      VALUES('guild',?,'player',?,?,?,'win',1,?,?)`);
    for (let i=0;i<120;i++) receipt.run('pve-'+i,'pve','othello',null,day,day);
    assert.equal(db.prepare("SELECT count(*) n FROM kp_duel_reward_rolls WHERE mode='pve'").get()?.n,120);
    for (let i=0;i<16;i++) receipt.run('pvp-'+i,'pvp','othello','opponent-'+Math.floor(i/4),day,day);
    assert.equal(db.prepare("SELECT count(*) n FROM kp_duel_reward_rolls WHERE mode='pvp'").get()?.n,16);
    assert.deepEqual(db.prepare("SELECT chance_bps FROM kp_duel_reward_rolls WHERE mode='pvp' ORDER BY match_id").all().map(r=>Number(r.chance_bps)).sort((a,b)=>a-b), [500,500,500,500,...Array(12).fill(1000)]);
    receipt.run('blocked','pvp','othello','opponent-0',day,day);
    assert.equal(db.prepare("SELECT count(*) n FROM kp_duel_reward_rolls WHERE mode='pvp'").get()?.n,16);
    for (let i=0;i<40;i++) receipt.run('new-'+i,'pvp','othello','fresh-'+i,day,day);
    assert.equal(db.prepare("SELECT count(*) n FROM kp_duel_reward_rolls WHERE mode='pvp'").get()?.n,56);
    assert.equal(db.prepare("SELECT count(*) n FROM kp_duel_reward_rolls WHERE mode='pvp' AND chance_bps=500").get()?.n,44);
  } finally {db.close();}
});

test('PvP lifetime decay persists across JST midnight, while pair cap resets daily', () => {
  const db = new DatabaseSync(':memory:');
  const before = Date.parse('2026-11-20T23:59:00+09:00');
  const after = Date.parse('2026-11-21T00:01:00+09:00');
  try {
    for (const sql of [...DUEL_PROGRESSION_DDL,...DUEL_REWARD_DDL]) db.exec(sql);
    db.exec("INSERT INTO kp_duel_reward_policy_v2 VALUES ('guild','pvp',0,NULL,4,1000,500,500)");
    const receipt = db.prepare(`INSERT INTO kp_duel_progress_receipts
      VALUES('guild',?,'player','pvp','othello',?,'win',1,?,?)`);
    for (let i = 0; i < 12; i++) receipt.run('old-'+i,'opponent-'+Math.floor(i/4),before,before);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM kp_duel_reward_rolls WHERE user='player' AND mode='pvp'").get()?.n,12);
    receipt.run('new-day-first','opponent-0',after,after);
    assert.equal(db.prepare("SELECT chance_bps FROM kp_duel_reward_rolls WHERE match_id='new-day-first'").get()?.chance_bps,500);
    for (let i = 0; i < 4; i++) receipt.run('next-'+i,'fresh',after,after);
    receipt.run('blocked','fresh',after,after);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM kp_duel_reward_rolls WHERE user='player' AND mode='pvp'").get()?.n,17);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM kp_duel_reward_rolls WHERE user='player' AND mode='pvp' AND chance_bps=500").get()?.n,5);
  } finally { db.close(); }
});


test('PvP lifetime 12-roll decay uses a bounded candidate count and keeps its exact threshold', () => {
  const trigger = DUEL_REWARD_DDL.find(sql => sql.includes('CREATE TRIGGER kp_duel_reward_issue'));
  assert.ok(trigger);
  assert.match(trigger, /SELECT COUNT\(\*\) FROM \(\s*SELECT 1 FROM kp_duel_reward_rolls[\s\S]*?mode='pvp'\s+LIMIT 12\s*\)\)>=12/);
  const db = new DatabaseSync(':memory:');
  try {
    for (const sql of [...DUEL_PROGRESSION_DDL,...DUEL_REWARD_DDL]) db.exec(sql);
    db.exec("INSERT INTO kp_duel_reward_policy_v2 VALUES ('guild','pvp',0,NULL,99,1000,0,0)");
    const add = db.prepare('INSERT INTO kp_duel_progress_receipts VALUES(?,?,?,?,?,?,?,?,?,?)');
    const record = (id: string, user: string, opponent: string) =>
      add.run('guild',id,user,'pvp','othello',opponent,'win',1,1000,1000);
    for (let n=0; n<18; n++) {
      const opponent='other-'+n;
      record('m'+n,'alice',opponent);
      const value=db.prepare('SELECT chance_bps AS value FROM kp_duel_reward_rolls WHERE guild=? AND user=? AND mode=? AND match_id=?')
        .get('guild','alice','pvp','m'+n) as {value:number}|undefined;
      assert.equal(value?.value,n>=12?500:1000,'before the 13th roll remains unhalved');
    }
    record('bob1','bob','alice');
    const bob=db.prepare("SELECT chance_bps AS value FROM kp_duel_reward_rolls WHERE user='bob'").get() as {value:number};
    assert.equal(bob.value,1000,'other user must not inherit lifetime decay');
    const plan=db.prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) FROM (SELECT 1 FROM kp_duel_reward_rolls WHERE guild=? AND user=? AND mode='pvp' LIMIT 12)")
      .all('guild','alice');
    assert.match(JSON.stringify(plan),/USING COVERING INDEX/);
  } finally { db.close(); }
});
