import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../js/store.js';
import {createInitialState,trade,grantDemoSalary,buyReward} from '../js/engine.js';
function fixture(){
 let saved=createInitialState();let queue=Promise.resolve();
 const locks={request(name,run){const result=queue.then(run);queue=result.catch(()=>{});return result;}};
 const options={load:()=>structuredClone(saved),save:s=>{saved=structuredClone(s);return true;},locks};
 return {a:createStore(options),b:createStore(options),read:()=>saved};
}
test('two clients serialize orders against the latest persisted balance',async()=>{
 const {a,b,read}=fixture();await Promise.all([a.transact(s=>trade(s,'keso','buy',4)),b.transact(s=>trade(s,'keso','buy',4))]);assert.equal(read().holdings.keso,8);assert.equal(read().cash,304);
 await assert.rejects(a.transact(s=>trade(s,'keso','buy',1)));assert.equal(read().cash,304);
});
test('simultaneous salaries and duplicate purchases pay only once',async()=>{
 const {a,b,read}=fixture();const salary=await Promise.allSettled([a.transact(s=>grantDemoSalary(s)),b.transact(s=>grantDemoSalary(s))]);assert.equal(salary.filter(r=>r.status==='fulfilled').length,1);assert.equal(read().cash,10600);
 const rewards=await Promise.allSettled([a.transact(s=>buyReward(s,'gold')),b.transact(s=>buyReward(s,'gold'))]);assert.equal(rewards.filter(r=>r.status==='fulfilled').length,1);assert.equal(read().cash,8400);
});
test('throwing updates never leak partial mutations or poison the queue',async()=>{
 const {a,read}=fixture();await assert.rejects(a.transact(s=>{s.cash=0;throw Error('fail')}));assert.equal(read().cash,10000);assert.equal(a.state.cash,10000);await a.transact(s=>buyReward(s,'gold'));assert.equal(read().cash,7800);
});
test('save failure keeps subsequent session operations in memory',async()=>{
 let warned=0;const a=createStore({load:()=>createInitialState(),save:()=>false,locks:{request:(_,run)=>run()},onVolatile:()=>warned++});await a.transact(s=>buyReward(s,'gold'));await a.transact(s=>buyReward(s,'fanfar'));assert.equal(a.state.cash,6700);assert.equal(warned,1);a.refresh();assert.equal(a.state.cash,6700);
});
test('unsupported locking refuses shared writes rather than overwriting',async()=>{
 const a=createStore({load:()=>createInitialState(),locks:null});await assert.rejects(a.transact(s=>buyReward(s,'gold')),/HTTPS/);assert.equal(a.state.cash,10000);
});
test('inside the lock the durable copy wins over a stale localStorage read from another tab',async()=>{
 // Tab B's localStorage cache still holds the state from before tab A's order; IndexedDB has A's order.
 let saved=createInitialState(),durableCopy=null;const stale=structuredClone(saved);let queue=Promise.resolve();
 const locks={request(name,run){const result=queue.then(run);queue=result.catch(()=>{});return result;}};
 const durable={read:async()=>durableCopy&&structuredClone(durableCopy),write:async s=>{durableCopy=structuredClone(s);}};
 const a=createStore({load:()=>structuredClone(saved),save:s=>{saved=structuredClone(s);return true;},locks,durable});
 const b=createStore({load:()=>structuredClone(stale),save:s=>{saved=structuredClone(s);return true;},locks,durable});
 await a.transact(s=>trade(s,'keso','buy',4));await b.transact(s=>trade(s,'keso','buy',4));
 assert.equal(saved.holdings.keso,8);assert.equal(saved.cash,304);assert.equal(durableCopy.cash,304);
});
test('a failing durable write is dropped so no tab later reads an older copy from it',async()=>{
 let saved=createInitialState(),durableCopy=createInitialState(),cleared=0;
 const durable={read:async()=>durableCopy&&structuredClone(durableCopy),write:async()=>{throw Error('quota');},clear:async()=>{durableCopy=null;cleared++;}};
 const a=createStore({load:()=>structuredClone(saved),save:s=>{saved=structuredClone(s);return true;},locks:{request:(_,run)=>run()},durable});
 await a.transact(s=>trade(s,'keso','buy',4));assert.equal(cleared,1);assert.equal(durableCopy,null);assert.equal(saved.holdings.keso,4);
 await a.transact(s=>trade(s,'keso','buy',4));assert.equal(saved.holdings.keso,8);
});
