import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {preloadKpRunMatches} from '../src/kp.ts';

test('local D1 KP batch uses bounded primary-key reads on the same durable receipt fixture',async()=>{
 const runtime=new Miniflare({workers:[{config:{name:'kp-batch-read-test',compatibilityDate:'2026-10-24',env:{DB:{type:'d1'}},manifest:{mainModule:'worker.mjs',modules:{'worker.mjs':{type:'esm',contents:'export default {fetch(){return new Response("ok")}}'}}}}}]});
 try{
  const db=await runtime.getD1Database('DB','kp-batch-read-test');
  for(const sql of [
   'CREATE TABLE kp_events(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,puuid TEXT NOT NULL,match TEXT NOT NULL,mode TEXT NOT NULL,outcome TEXT,amount INTEGER NOT NULL,policy TEXT NOT NULL,at INTEGER NOT NULL,UNIQUE(guild,match,puuid))',
   'CREATE INDEX kp_events_member_latest ON kp_events(guild,user,at DESC,id ASC)',
   'CREATE TABLE kp_ledger(id TEXT PRIMARY KEY,delta INTEGER)',
   'CREATE TABLE kp_escalation_power_matches(id TEXT PRIMARY KEY)',
   'CREATE TABLE kp_reward_notes(id TEXT PRIMARY KEY,note TEXT)',
   'CREATE TABLE kp_accounts(guild TEXT NOT NULL,puuid TEXT NOT NULL,user TEXT NOT NULL,riot TEXT NOT NULL,linked_at INTEGER NOT NULL,PRIMARY KEY(guild,puuid),UNIQUE(guild,user))',
   'CREATE TABLE notifications(riot_id TEXT,match_id TEXT,message TEXT,PRIMARY KEY(riot_id,match_id))',
  ])await db.prepare(sql).run();
  for(let i=0;i<1000;i+=50)await db.batch(Array.from({length:50},(_,j)=>{
   const n=i+j;return db.prepare('INSERT INTO kp_events VALUES(?,?,?,?,?,?,?,?,?,?)').bind('id'+n,'g','u','p','m'+n,'competitive','win',100,'legacy',n);
  }));
  const ids=['id1','id2','id3','absent'],run={mapping:{guildId:'g'},credits:new Map(),relicBonuses:new Map(),messages:new Map(),notes:new Map(),loaded:new Set(),pendingPower:new Set()};
  let actualSql='',actualArgs=[],after;
  const env={DB:{prepare(sql){actualSql=sql;return {bind(...args){actualArgs=args;return {async all(){after=await db.prepare(sql).bind(...args).all();return after;}};}};}}};
  await preloadKpRunMatches(env,run,ids);
  const oldSql=actualSql.replace('AND +e.guild=?','AND e.guild=?');
  assert.notEqual(oldSql,actualSql);
  const before=await db.prepare(oldSql).bind(...actualArgs).all();
  const sort=rows=>[...rows].sort((a,b)=>String(a.event_id).localeCompare(String(b.event_id)));
  assert.deepEqual(sort(before.results),sort(after.results));
  assert.equal(run.credits.size,3);
  assert.equal(run.loaded.size,4);
  const oldPlan=await db.prepare('EXPLAIN QUERY PLAN '+oldSql).bind(...actualArgs).all();
  const newPlan=await db.prepare('EXPLAIN QUERY PLAN '+actualSql).bind(...actualArgs).all();
  console.log('KP_BATCH_D1_ROWS '+JSON.stringify({before:before.meta.rows_read,after:after.meta.rows_read,oldPlan:oldPlan.results,newPlan:newPlan.results}));
  assert.ok(after.meta.rows_read<before.meta.rows_read,'same-fixture D1 rows_read must decrease');
  assert.ok(newPlan.results.some(r=>/SEARCH e USING .*\(id=\?\)/.test(r.detail)));
 }finally{await runtime.dispose();}
});
