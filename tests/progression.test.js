import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,hydrateState} from '../js/engine.js';
import {submitClaim,approveClaim,issueDirective,completeDirective} from '../js/progression.js';
import {createStore} from '../js/store.js';
test('claim submission does not pay until approval; same match cannot pay twice across modes',()=>{
 const s=createInitialState();const c=submitClaim(s,{activity:'competitive',reference:'MATCH-1'});assert.equal(s.cash,10000);approveClaim(s,c.id);assert.equal(s.cash,10500);
 const before=structuredClone(s);assert.throws(()=>approveClaim(s,c.id));assert.throws(()=>submitClaim(s,{activity:'deathmatch',reference:' match-1 '}));assert.deepEqual(s,before);
});
test('Steam achievements require game, achievement and evidence; duplicate titles normalize',()=>{
 const s=createInitialState();assert.throws(()=>submitClaim(s,{activity:'steam',reference:'proof'}));
 const c=submitClaim(s,{activity:'steam',game:'Portal 2',achievement:'Wake Up',reference:'proof'});approveClaim(s,c.id);assert.equal(s.cash,10800);
 assert.throws(()=>submitClaim(s,{activity:'steam',game:'portal 2',achievement:' wake up ',reference:'other proof'}));
});
test('directives charge once, require a target, prevent stacking, and completion does not refund',()=>{
 const s=createInitialState();assert.throws(()=>issueDirective(s,{target:'self',task:'competitive'}));
 const d=issueDirective(s,{target:'riso',task:'competitive'});assert.equal(s.cash,6000,'competitive costs 4,000');assert.throws(()=>issueDirective(s,{target:'riso',task:'unrated'}));completeDirective(s,d.id);assert.equal(s.cash,6000);assert.throws(()=>completeDirective(s,d.id));issueDirective(s,{target:'riso',task:'unrated'});assert.equal(s.cash,3500,'unrated costs 2,500');
});
test('missing achievement details and insufficient balance never debit',()=>{
 const s=createInitialState();assert.throws(()=>issueDirective(s,{target:'yuya',task:'steam'}));s.cash=100;const before=structuredClone(s);assert.throws(()=>issueDirective(s,{target:'yuya',task:'competitive'}));assert.deepEqual(s,before);
});
test('old saves migrate empty progress; valid records survive; corrupted records are dropped',()=>{
 const s=createInitialState();delete s.claims;delete s.directives;delete s.progressSeq;assert.deepEqual(hydrateState(s).claims,[]);
 Object.assign(s,{claims:[],directives:[],progressSeq:0});const c=submitClaim(s,{activity:'competitive',reference:'abc'});approveClaim(s,c.id);issueDirective(s,{target:'yano',task:'steam',game:'Portal',achievement:'Finish'});
 const restored=hydrateState(s);assert.deepEqual(restored.claims,s.claims);assert.deepEqual(restored.directives,s.directives);
 s.claims.push(null,{...s.claims[0],id:999,reward:999999});s.directives.push({target:'unknown'});const repaired=hydrateState(s);assert.equal(repaired.claims.length,1);assert.equal(repaired.directives.length,1);assert.equal(repaired.progressSeq,2);
});
test('two-tab approvals credit only once',async()=>{
 let saved=createInitialState();const c=submitClaim(saved,{activity:'competitive',reference:'abc'});let queue=Promise.resolve();const locks={request:(_,run)=>{const next=queue.then(run);queue=next.catch(()=>{});return next;}};
 const options={load:()=>structuredClone(saved),save:s=>{saved=structuredClone(s);return true},locks};const a=createStore(options),b=createStore(options);
 const results=await Promise.allSettled([a.transact(s=>approveClaim(s,c.id)),b.transact(s=>approveClaim(s,c.id))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(saved.cash,10500);
});
