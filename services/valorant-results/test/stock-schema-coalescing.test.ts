import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureStocks} from '../src/stock-market.ts';
import type {KpEnv} from '../src/kp.ts';

// The test deliberately keeps the D1 batch pending so concurrent requests
// arrive on the same cold isolate before initialization resolves.
function fixture(){
 let started=0;
 const pending:Array<{resolve:()=>void;reject:(e:Error)=>void}>=[];
 const db={
  prepare(sql:string){return {sql};},
  batch(sqls:Array<{sql:string}>){
   started++;
   assert.ok(sqls.length>10,'schema contains the existing table and index declarations');
   return new Promise<void>((resolve,reject)=>pending.push({resolve,reject}));
  },
 };
 return {env:{DB:db} as unknown as KpEnv,pending,get started(){return started;}};
}
test('twenty simultaneous cold-start calls share exactly one D1 schema batch',async()=>{
 const f=fixture();
 const jobs=Array.from({length:20},()=>ensureStocks(f.env));
 assert.equal(f.started,1);
 f.pending[0].resolve();
 await Promise.all(jobs);
 await ensureStocks(f.env);
 assert.equal(f.started,1,'subsequent requests reuse the initialized schema');
});
test('a failed D1 schema batch is not cached and the next request retries',async()=>{
 const f=fixture();
 const first=ensureStocks(f.env),second=ensureStocks(f.env);
 assert.equal(f.started,1);
 f.pending[0].reject(new Error('D1 temporarily unavailable'));
 await assert.rejects(first,/temporarily unavailable/);
 await assert.rejects(second,/temporarily unavailable/);
 const third=ensureStocks(f.env);
 assert.equal(f.started,2,'the previous failed initializer must be dropped');
 f.pending[1].resolve();
 await third;
 await ensureStocks(f.env);
 assert.equal(f.started,2,'successful retry becomes reusable');
});
test('different D1 bindings initialize independently',async()=>{
 const a=fixture(),b=fixture();
 const pa=ensureStocks(a.env),pb=ensureStocks(b.env);
 assert.equal(a.started,1);assert.equal(b.started,1);
 a.pending[0].resolve();b.pending[0].resolve();
 await Promise.all([pa,pb]);
});
