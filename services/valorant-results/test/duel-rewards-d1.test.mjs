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
    await db.prepare("INSERT INTO kp_duel_reward_policy_v2 VALUES('test','pvp',0,3,1,10000,0,0)").run();
    const firstAward = await finish('award');
    const pairCapped = await finish('pair-capped');
    const repeatAward = await finish('repeat-award','other-peer');

    assert.equal(disabled.written,baseline.written);
    assert.equal(pairCapped.written,baseline.written);
    // The recent-history secondary index adds one index entry per successful roll.
    assert.equal(firstAward.written-baseline.written,6);
    assert.equal(repeatAward.written-baseline.written,4);
    for (const sample of [disabled,firstAward,pairCapped,repeatAward]) {
      assert.ok(sample.read-baseline.read<=4, 'fixture quota reads must stay bounded');
    }
    console.log('Duel reward D1 rows', JSON.stringify({baseline,disabled,firstAward,pairCapped,repeatAward}));
  } finally {
    await runtime.dispose();
  }
});

test('local D1 measures recent history rows_read and index write overhead on identical fixtures',async()=>{
 const runtime=new Miniflare({workers:[{config:{name:'duel-recent-test',compatibilityDate:'2026-10-24',env:{DB:{type:'d1'}},manifest:{mainModule:'worker.mjs',modules:{'worker.mjs':{type:'esm',contents:'export default {fetch(){return new Response("ok")}}'}}}}}]});
 try{
  const db=await runtime.getD1Database('DB','duel-recent-test');
  const recentIndex=DUEL_REWARD_DDL.find(sql=>sql.includes('CREATE INDEX IF NOT EXISTS kp_duel_reward_rolls_recent'));
  assert.ok(recentIndex);
  for(const sql of DUEL_PROGRESSION_DDL)await db.prepare(sql).run();
  for(const sql of DUEL_REWARD_DDL)if(sql!==recentIndex)await db.prepare(sql).run();
  const insert=db.prepare('INSERT OR IGNORE INTO kp_duel_reward_rolls VALUES(?,?,?,?,?,?,?,?,?)');
  const add=(i)=>insert.bind('g','u',i%2?'pvp':'pve',String(i),'trio','peer',20000,i%10000,0);
  for(let i=0;i<1000;i+=50)await db.batch(Array.from({length:50},(_,j)=>add(i+j)));
  const sql='SELECT mode,match_id,game,roll,chance_bps FROM kp_duel_reward_rolls WHERE guild=? AND user=? ORDER BY rowid DESC LIMIT 20';
  const read=()=>db.prepare(sql).bind('g','u').all();
  const before=await read();
  const oldWrite=await add(1000).run();
  await db.prepare("DELETE FROM kp_duel_reward_rolls WHERE guild='g' AND user='u' AND mode='pve' AND match_id='1000'").run();
  const build=await db.prepare(recentIndex).run();
  const after=await read();
  assert.deepEqual(after.results,before.results);
  assert.equal(after.results.length,20);
  assert.ok(after.meta.rows_read<before.meta.rows_read,'local D1 latest history reads must decrease');
  const newWrite=await add(1000).run();
  assert.equal(newWrite.meta.rows_written,oldWrite.meta.rows_written+1);
  console.log('Local D1 recent index measurement',JSON.stringify({before:before.meta.rows_read,after:after.meta.rows_read,oldWrite:oldWrite.meta.rows_written,newWrite:newWrite.meta.rows_written,buildRead:build.meta.rows_read,buildWrite:build.meta.rows_written}));
 }finally{await runtime.dispose();}
});
