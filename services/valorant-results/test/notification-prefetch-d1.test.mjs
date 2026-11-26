import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {prefetchMissingMatchNotices} from '../src/notification-indexes.ts';
test('local D1 positive notice reuse cuts repeated shared-participant reads without hiding late receipts',async()=>{
 const runtime=new Miniflare({workers:[{config:{name:'notice-read-test',compatibilityDate:'2026-10-24',env:{DB:{type:'d1'}},manifest:{mainModule:'worker.mjs',modules:{'worker.mjs':{type:'esm',contents:'export default {fetch(){return new Response("ok")}}'}}}}}]});
 try{
  const db=await runtime.getD1Database('DB','notice-read-test');
  await db.prepare('CREATE TABLE notifications(riot_id TEXT,match_id TEXT,message TEXT,PRIMARY KEY(riot_id,match_id))').run();
  await db.prepare('CREATE INDEX notifications_match_members ON notifications(match_id,riot_id)').run();
  for(let i=0;i<1000;i+=50)await db.batch(Array.from({length:50},(_,j)=>{
   const n=i+j;return db.prepare('INSERT INTO notifications VALUES(?,?,?)').bind('p'+(n%10),'m'+Math.floor(n/10),'notice');
  }));
  const ids=['m1','m2','m3','m4','m5'],riotIds=Array.from({length:10},(_,i)=>'p'+i);
  const candidates=ids.map(matchId=>({matchId,riotIds}));
  const oldSql='SELECT riot_id,match_id FROM notifications WHERE match_id IN ('+ids.map(()=>'?').join(',')+')';
  let before=0;const baseline=new Set();
  for(let i=0;i<3;i++){const r=await db.prepare(oldSql).bind(...ids).all();before+=r.meta.rows_read;for(const row of r.results)baseline.add(JSON.stringify([row.riot_id,row.match_id]));}
  let after=0,calls=0;const saved=new Set();
  const proxy={prepare(sql){return {bind(...args){return {async all(){const r=await db.prepare(sql).bind(...args).all();calls++;after+=r.meta.rows_read;return r;}};}};}};
  for(let i=0;i<3;i++)await prefetchMissingMatchNotices(proxy,candidates,saved);
  assert.deepEqual([...saved].sort(),[...baseline].sort());assert.equal(calls,1);assert.equal(saved.size,50);
  const plan=await db.prepare('EXPLAIN QUERY PLAN '+oldSql).bind(...ids).all();
  console.log('NOTICE_PREFETCH_D1_ROWS '+JSON.stringify({before,after,oldCalls:3,newCalls:calls,plan:plan.results}));
  assert.ok(after<before);
  await prefetchMissingMatchNotices(proxy,[{matchId:'late',riotIds:['p0','p1']}],saved);
  await db.prepare('INSERT INTO notifications VALUES(?,?,?)').bind('p1','late','late').run();
  await prefetchMissingMatchNotices(proxy,[{matchId:'late',riotIds:['p0','p1']}],saved);
  assert.ok(saved.has(JSON.stringify(['p1','late'])));
 }finally{await runtime.dispose();}
});
