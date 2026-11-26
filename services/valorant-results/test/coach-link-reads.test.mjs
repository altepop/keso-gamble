import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {knownCoachMemberMatchIds} from '../src/coach-member-archive.ts';

test('coach refresh uses bounded composite-key lookups with identical known links and fewer D1 reads',async()=>{
 const runtime=new Miniflare({workers:[{config:{name:'coach-link-reads',compatibilityDate:'2026-10-24',env:{DB:{type:'d1'}},manifest:{mainModule:'worker.mjs',modules:{'worker.mjs':{type:'esm',contents:'export default {fetch(){return new Response("ok")}}'}}}}}]});
 try{
  const db=await runtime.getD1Database('DB','coach-link-reads');
  await db.prepare('CREATE TABLE coach_member_links(riot_id TEXT NOT NULL,match_id TEXT NOT NULL,PRIMARY KEY(riot_id,match_id))').run();
  for(let i=0;i<1000;i+=50)await db.batch(Array.from({length:50},(_,j)=>db.prepare('INSERT INTO coach_member_links VALUES(?,?)').bind('member','match-'+(i+j))));
  await db.prepare('INSERT INTO coach_member_links VALUES(?,?)').bind('other','only-other').run();
  const ids=[...Array.from({length:48},(_,i)=>'match-'+i),'not-known','only-other'];
  const legacy="SELECT match_id FROM coach_member_links WHERE riot_id=? AND match_id IN (SELECT json_extract(value,'$.id') FROM json_each(?))";
  const oldArgs=['member',JSON.stringify(ids.map(id=>({id,started:123})))];
  const before=await db.prepare(legacy).bind(...oldArgs).all();
  let calls=0,reads=0,plan=[];
  const wrap={prepare(sql){const stmt=db.prepare(sql);return {bind(...args){return {async all(){calls++;const r=await stmt.bind(...args).all();reads+=r.meta.rows_read;plan=(await db.prepare('EXPLAIN QUERY PLAN '+sql).bind(...args).all()).results;return r;}};}};}};
  const known=await knownCoachMemberMatchIds(wrap,'member',ids);
  assert.deepEqual([...known].sort(),before.results.map(r=>r.match_id).sort());
  assert.equal(known.size,48);assert.equal(calls,1);
  assert.match(plan.map(r=>r.detail).join(' '),/riot_id=\? AND match_id=\?/);
  console.log('COACH_LINK_D1_ROWS '+JSON.stringify({before:before.meta.rows_read,after:reads,calls,plan}));
  assert.ok(reads<before.meta.rows_read,'require actual same-fixture D1 savings');
  const many=[...Array.from({length:101},(_,i)=>'match-'+i),'match-0'];
  assert.equal((await knownCoachMemberMatchIds(wrap,'member',many)).size,101);
  assert.equal(calls,4,'all unique IDs, including a page above 50, use bounded chunks');
  assert.equal((await knownCoachMemberMatchIds(wrap,'member',[])).size,0);
  assert.equal(calls,4);
 }finally{await runtime.dispose();}
});
