import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {ML_DATA,mlDataForDates,mlData,storeCards} from '../src/mleague.ts';

test('date-scoped M.LEAGUE view preserves official matchups and bounds D1 rows on the same fixture',async()=>{
 const runtime=new Miniflare({workers:[{config:{name:'ml-card-reads',compatibilityDate:'2026-10-24',env:{DB:{type:'d1'}},manifest:{mainModule:'worker.mjs',modules:{'worker.mjs':{type:'esm',contents:'export default {fetch(){return new Response("ok")}}'}}}}}]});
 try{
  const db=await runtime.getD1Database('DB','ml-card-reads'),env={DB:db};
  const fixtures=ML_DATA.fixtures.filter(f=>f.game===1);
  const rows=fixtures.map(f=>({date:f.date,table:f.table,teams:f.teams}));
  // Include earlier-season rows that must not affect the scoped current view.
  for(let i=0;i<500;i++)rows.push({date:new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10),table:1,teams:fixtures[0].teams});
  for(let i=0;i<rows.length;i+=50)await storeCards(env,rows.slice(i,i+50),1);
  const target=fixtures[0].date;
  const before=await db.prepare('SELECT date,tbl,teams FROM ml_cards').all();
  const full=await mlData(env);
  let reads=0,calls=0,plan=[];
  const wrapped={DB:{prepare(sql){const stmt=db.prepare(sql);if(!sql.startsWith('SELECT date,tbl,teams FROM ml_cards WHERE'))return stmt;
   return {bind(...args){return {async all(){calls++;const r=await stmt.bind(...args).all();reads+=r.meta.rows_read;plan=(await db.prepare('EXPLAIN QUERY PLAN '+sql).bind(...args).all()).results;return r;}};}};
  },batch:db.batch.bind(db)}};
  const scoped=await mlDataForDates(wrapped,[target,target,'1900-01-01']);
  assert.deepEqual(scoped,{teams:full.teams,fixtures:full.fixtures.filter(f=>f.date===target)});
  assert.ok(scoped.fixtures.length>0&&scoped.fixtures.every(f=>f.confirmed));
  assert.equal(calls,1);
  assert.match(plan.map(r=>r.detail).join(' '),/date=\?/);
  assert.ok(reads<before.meta.rows_read);
  console.log('ML_CARD_D1_ROWS '+JSON.stringify({before:before.meta.rows_read,after:reads,oldCalls:1,newCalls:calls,plan}));
  const swapped=[...fixtures[0].teams].reverse();
  await storeCards(env,[{date:target,table:fixtures[0].table,teams:swapped}],2);
  assert.deepEqual((await mlDataForDates(wrapped,[target])).fixtures.find(f=>f.id===fixtures[0].id).teams,swapped);
  assert.equal(calls,2);
  assert.deepEqual((await mlDataForDates(wrapped,[])).fixtures,[]);
  assert.equal(calls,2);
 }finally{await runtime.dispose();}
});
