import assert from 'node:assert/strict';
import test from 'node:test';
import {Miniflare} from 'miniflare';
import {DUEL_PROGRESSION_DDL} from '../src/duel-progression-schema.ts';
import {DUEL_REWARD_DDL} from '../src/duel-rewards.ts';

test('local D1 measures reward rows separately from the existing progression receipt', async () => {
  const runtime = new Miniflare({workers:[{
    config:{
      name:'duel-rewards-test', compatibilityDate:'2026-10-24', env:{DB:{type:'d1'}},
      manifest:{mainModule:'worker.mjs',modules:{
        'worker.mjs':{type:'esm',contents:'export default {fetch(){return new Response("ok")}}'},
      }},
    },
  }]});
  try {
    const db = await runtime.getD1Database('DB','duel-rewards-test');
    for (const sql of DUEL_PROGRESSION_DDL) await db.prepare(sql).run();
    const finish = async (id, opponent = 'peer') => {
      const {meta} = await db.prepare(`INSERT INTO kp_duel_progress_receipts
        VALUES('test',?,'player','pvp','othello',?,'win',1,1000,1000)`).bind(id,opponent).run();
      return {read:meta.rows_read,written:meta.rows_written};
    };
    const baseline = await finish('baseline');
    for (const sql of DUEL_REWARD_DDL) await db.prepare(sql).run();
    const disabled = await finish('disabled');
    await db.prepare("INSERT INTO kp_duel_reward_policy VALUES('test','pvp',0,3,1,10000,0,0)").run();
    const firstAward = await finish('award');
    const pairCapped = await finish('pair-capped');
    const repeatAward = await finish('repeat-award','other-peer');

    assert.equal(disabled.written,baseline.written);
    assert.equal(pairCapped.written,baseline.written);
    assert.equal(firstAward.written-baseline.written,5);
    assert.equal(repeatAward.written-baseline.written,3);
    for (const sample of [disabled,firstAward,pairCapped,repeatAward]) {
      assert.ok(sample.read-baseline.read<=4, 'fixture quota reads must stay bounded');
    }
    console.log('Duel reward D1 rows', JSON.stringify({baseline,disabled,firstAward,pairCapped,repeatAward}));
  } finally {
    await runtime.dispose();
  }
});
