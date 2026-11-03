import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {availableStockNewsTables} from '../src/stock-news-sources.ts';

test('all known stock news tables are checked only once per D1 binding',async()=>{
 const sql=new DatabaseSync(':memory:');
 for(const table of ['kp_events','kp_quiz_events','kp_quiz_ranked_extra'])sql.exec('CREATE TABLE '+table+'(id TEXT)');
 let lookups=0;
 const db={prepare:(query:string)=>{lookups++;return {all:async()=>({results:sql.prepare(query).all()})};}} as unknown as D1Database;
 assert.equal((await availableStockNewsTables(db)).size,3);
 assert.equal((await availableStockNewsTables(db)).size,3);
 assert.equal(lookups,1,'one schema lookup across repeated ticks');
 sql.close();
});

test('missing optional quiz tables are rechecked until created, without suppressing future news',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE kp_events(id TEXT)');
 let lookups=0;
 const db={prepare:(query:string)=>{lookups++;return {all:async()=>({results:sql.prepare(query).all()})};}} as unknown as D1Database;
 assert.deepEqual([...await availableStockNewsTables(db)],['kp_events']);
 assert.deepEqual([...await availableStockNewsTables(db)],['kp_events']);
 assert.equal(lookups,2,'do not cache missing source tables forever');
 sql.exec('CREATE TABLE kp_quiz_events(id TEXT);CREATE TABLE kp_quiz_ranked_extra(id TEXT)');
 assert.equal((await availableStockNewsTables(db)).size,3);
 assert.equal((await availableStockNewsTables(db)).size,3);
 assert.equal(lookups,3,'cache once all sources exist');
 sql.close();
});

test('a schema inspection error does not become a permanently cached failure',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE kp_events(id TEXT);CREATE TABLE kp_quiz_events(id TEXT);CREATE TABLE kp_quiz_ranked_extra(id TEXT)');
 let attempts=0;
 const db={prepare:(query:string)=>{attempts++;return {all:async()=>{if(attempts===1)throw Error('temporary D1 error');return {results:sql.prepare(query).all()};}};}} as unknown as D1Database;
 await assert.rejects(availableStockNewsTables(db),/temporary D1 error/);
 assert.equal((await availableStockNewsTables(db)).size,3);
 assert.equal(attempts,2);
 sql.close();
});
