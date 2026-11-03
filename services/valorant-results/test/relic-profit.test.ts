import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedCasinoProfit,verifiedBetProfit,verifiedStockProfit} from '../src/relic-profit.ts';

test('blackjack loss refunds are not positive profit, while a genuine win is',()=>{
 assert.equal(verifiedCasinoProfit({done:{net:-500,payout:500}}),0);
 assert.equal(verifiedCasinoProfit({done:{net:0}}),0);
 assert.equal(verifiedCasinoProfit({done:{net:900}}),900);
 assert.equal(verifiedCasinoProfit({done:null}),0);
 assert.equal(verifiedCasinoProfit({payout:200,amount:1000}),0);
 assert.equal(verifiedCasinoProfit({payout:1800,amount:1000}),800);
 assert.equal(verifiedCasinoProfit({net:250}),250);
 assert.equal(verifiedCasinoProfit({net:'250'}),0);
 assert.equal(verifiedCasinoProfit({net:3.5}),0);
 assert.equal(verifiedCasinoProfit(null),0);
});
test('ticket settlement uses payout minus ORIGINAL cost, including losing tickets',()=>{
 assert.equal(verifiedBetProfit([{amount:1000,payout:2000}]),1000);
 assert.equal(verifiedBetProfit([{amount:1000,payout:1500},{amount:1000,payout:0}]),0);
 assert.equal(verifiedBetProfit([{amount:1000,payout:500}]),0);
 assert.equal(verifiedBetProfit([{amount:-1000,payout:500}]),0);
 assert.equal(verifiedBetProfit([]),0);
});
test('indexed FIFO shares must be complete and fees included before stock bonuses',()=>{
 assert.equal(verifiedStockProfit(1000,800,10,10),192);
 assert.equal(verifiedStockProfit(1000,1000,10,10),0);
 assert.equal(verifiedStockProfit(1000,100,9,10),0);
 assert.equal(verifiedStockProfit(1000,100,10,10),899);
 assert.equal(verifiedStockProfit(NaN,100,10,10),0);
 assert.equal(verifiedStockProfit(1000,100,0,0),0);
});
