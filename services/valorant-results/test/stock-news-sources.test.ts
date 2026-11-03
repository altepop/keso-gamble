import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {availableStockNewsTables} from '../src/stock-news-sources.ts';

const probe=(sql:DatabaseSync,seen:string[],fail?:()=>boolean)=>({prepare:(query:string)=>{seen.push(query);return {all:async()=>{if(fail?.())throw Error('temporary D1 error');return {results:sql.prepare(query).all()};}};}} as unknown as D1Database);

test('all known stock news tables are checked only once per D1 binding, without reading sqlite_master',async()=>{
 const sql=new DatabaseSync(':memory:');
 for(const table of ['kp_events','kp_quiz_events','kp_quiz_ranked_extra'])sql.exec('CREATE TABLE '+table+'(id TEXT)');
 sql.exec("INSERT INTO kp_events VALUES('a'),('b')");
 const seen:string[]=[],db=probe(sql,seen);
 assert.equal((await availableStockNewsTables(db)).size,3);
 assert.equal((await availableStockNewsTables(db)).size,3);
 assert.equal(seen.length,3,'one probe per source across repeated ticks');
 assert.ok(seen.every(q=>/LIMIT 0$/.test(q)&&!/sqlite_master/.test(q)),'probes read no rows');
 sql.close();
});

test('missing optional quiz tables are rechecked until created, without suppressing future news',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE kp_events(id TEXT)');
 const seen:string[]=[],db=probe(sql,seen);
 assert.deepEqual([...await availableStockNewsTables(db)],['kp_events']);
 assert.deepEqual([...await availableStockNewsTables(db)],['kp_events']);
 assert.equal(seen.length,6,'do not cache missing source tables forever');
 sql.exec('CREATE TABLE kp_quiz_events(id TEXT);CREATE TABLE kp_quiz_ranked_extra(id TEXT)');
 assert.equal((await availableStockNewsTables(db)).size,3);
 assert.equal((await availableStockNewsTables(db)).size,3);
 assert.equal(seen.length,9,'cache once all sources exist');
 sql.close();
});

test('a D1 error other than a missing table does not become a permanently cached failure',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE kp_events(id TEXT);CREATE TABLE kp_quiz_events(id TEXT);CREATE TABLE kp_quiz_ranked_extra(id TEXT)');
 let attempts=0;const db=probe(sql,[],()=>++attempts===1);
 await assert.rejects(availableStockNewsTables(db),/temporary D1 error/);
 assert.equal((await availableStockNewsTables(db)).size,3);
 sql.close();
});
