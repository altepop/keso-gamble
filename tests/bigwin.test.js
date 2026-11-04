import test from 'node:test';
import assert from 'node:assert/strict';
import {bigWinSteps,BIG_WIN_TIERS} from '../js/bigwin.js';
const ids=steps=>steps.map(s=>s.id);
test('big win tiers climb with the multiple of the bet',()=>{
 assert.deepEqual(ids(bigWinSteps(700,100)),[],'7× is a normal win');
 assert.deepEqual(ids(bigWinSteps(800,100)),['big']);
 assert.deepEqual(ids(bigWinSteps(3500,100)),['big','mega'],'a roulette straight-up hit is MEGA WIN');
 assert.deepEqual(ids(bigWinSteps(5000,100)),['big','mega','super']);
 assert.deepEqual(ids(bigWinSteps(300,100,{jackpot:true})),['jackpot']);
 assert.deepEqual(ids(bigWinSteps(100000,50000)),['big'],'100,000 KP or more is at least BIG WIN');
 assert.deepEqual(ids(bigWinSteps(-500,100)),[]);assert.deepEqual(ids(bigWinSteps(0,100)),[]);assert.deepEqual(ids(bigWinSteps(Number.NaN,100)),[]);
 assert.deepEqual(BIG_WIN_TIERS.map(t=>t.label),['BIG WIN','MEGA WIN','SUPER MEGA WIN']);
});
test('showBigWin does nothing for an ordinary win or outside a browser',async()=>{
 const {showBigWin}=await import('../js/bigwin.js');
 assert.equal(showBigWin(300,100),false);
 assert.equal(showBigWin(5000,100),false,'no document in node');
});
