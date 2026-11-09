import test from 'node:test';
import assert from 'node:assert/strict';
import {PRIVATE_HANDS,privateHand,privateSlotRng} from '../js/private-casino-rules.js';
import {playSlot,slotWinTier} from '../js/casino-more.js';
import {createInitialState} from '../js/engine.js';
import {slotCeremony} from '../js/casino-more-view.js';
const wallet=()=>({...createInitialState(),cash:1000000});
test('owner menu exposes the two feature triggers and refuses unknown hand',()=>{
 assert.ok(PRIVATE_HANDS.slot.some(([id])=>id==='temple'));
 assert.ok(PRIVATE_HANDS.slot.some(([id])=>id==='temple-grand'));
 assert.equal(privateHand('slot','temple'),'temple');
 assert.equal(privateHand('slot','temple-grand'),'temple-grand');
 assert.throws(()=>privateHand('slot','temple-hack'),/役を選び直して/);
});
test('owner-only normal entry forces 💎💎 then leaves ALL temple coins and respins to secure RNG',()=>{
 const w=wallet();let calls=0;
 const rng=privateSlotRng('temple',n=>{calls++;return n===1000?500:0;});
 const out=playSlot(w,100,rng).done;
 assert.deepEqual(out.reels,['diamond','diamond','cherry']);
 assert.equal(out.bonus?.mode,'respin');
 assert.equal(out.bonus.grid.length,15);
 assert.deepEqual(out.bonus.steps.map(x=>x.remaining),[2,1,0]);
 assert.equal(calls,33,'6 starting coin values and 27 empty-cell attempts use the supplied secure RNG');
 assert.equal(out.bonus.total,300); // Six 0.5x coins.
 assert.equal(slotWinTier(out),null);
 const ceremony=slotCeremony({type:'win',done:out});
 assert.match(ceremony,/FEATURE WIN/);
 assert.doesNotMatch(ceremony,/BIG WIN/);
 assert.equal(w.cash,1000200,'result settled once in original bet');
});
test('owner-only grand trigger fills 15 cells and pays 200x total without a second spin',()=>{
 const w=wallet();let randomCalls=0;
 const out=playSlot(w,100,privateSlotRng('temple-grand',n=>{randomCalls++;return n===1000?500:0;})).done;
 assert.deepEqual(out.reels,['diamond','diamond','cherry']);
 assert.equal(out.bonus.mode,'respin');
 assert.equal(out.bonus.grid.filter(Boolean).length,6);
 assert.equal(out.bonus.steps.length,1);
 assert.equal(out.bonus.steps[0].landed.length,9);
 assert.equal(out.bonus.filled,true);
 assert.equal(out.bonus.total,20000);
 assert.equal(out.payout,20000);
 assert.equal(w.cash,1019900);
 assert.equal(randomCalls,0,'forced showcase cannot accidentally draw different steps');
 assert.equal(slotWinTier(out),'golden');
 const ceremony=slotCeremony({type:'win',done:out});
 assert.match(ceremony,/GOLDEN WIN/);
});
test('pre-existing slot hand forcing is unchanged',()=>{
 const w=wallet();const out=playSlot(w,100,privateSlotRng('star',()=>{throw Error('not expected')})).done;
 assert.deepEqual(out.reels,['star','star','star']);
 assert.equal(out.payout,4000);
 assert.equal(slotWinTier(out),'golden');
});
