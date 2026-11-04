import test from 'node:test';
import assert from 'node:assert/strict';
import {bigWinSteps,BIG_WIN_TIERS} from '../js/bigwin.js';
const ids=steps=>steps.map(s=>s.id);
test('big win tiers climb with the multiple of the bet, by each game\'s own rare wins',()=>{
 assert.deepEqual(ids(bigWinSteps(700,100)),[],'7× is a normal win by default');
 assert.deepEqual(ids(bigWinSteps(800,100)),['big']);
 assert.deepEqual(ids(bigWinSteps(5000,100)),['big','mega','super']);
 // チンチロ pays at most 5×: シゴロ BIG, ゾロ目 MEGA, ピンゾロ SUPER MEGA.
 assert.deepEqual(ids(bigWinSteps(100,100,{game:'chinchiro'})),[],'目で勝ち (1×) is ordinary');
 assert.deepEqual(ids(bigWinSteps(200,100,{game:'chinchiro'})),['big']);
 assert.deepEqual(ids(bigWinSteps(300,100,{game:'chinchiro'})),['big','mega']);
 assert.deepEqual(ids(bigWinSteps(500,100,{game:'chinchiro'})),['big','mega','super']);
 assert.deepEqual(ids(bigWinSteps(150,100,{game:'blackjack'})),['big'],'ブラックジャック');
 assert.deepEqual(ids(bigWinSteps(200,100,{game:'blackjack'})),['big','mega'],'double-down win');
 assert.deepEqual(ids(bigWinSteps(800,100,{game:'baccarat'})),['big'],'tie');
 assert.deepEqual(ids(bigWinSteps(100,100,{game:'baccarat'})),[]);
 assert.deepEqual(ids(bigWinSteps(3500,100,{game:'roulette'})),['big','mega','super'],'a straight-up hit');
 assert.deepEqual(ids(bigWinSteps(200,100,{game:'roulette'})),['big'],'dozen/column');
 assert.deepEqual(ids(bigWinSteps(100,100,{game:'roulette'})),[],'red/black');
 assert.deepEqual(ids(bigWinSteps(2400,100,{game:'video-poker'})),['big','mega'],'four of a kind');
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
