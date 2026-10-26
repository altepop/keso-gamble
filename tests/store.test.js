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
