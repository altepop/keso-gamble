import test from 'node:test';
import assert from 'node:assert/strict';
import {VDK_CRASH_START,VDK_IPO_AT,vdkEventPrice,stockIsListed,stockTradeRestriction} from '../js/vdk-bankruptcy.js';
import {stockOrderQuote,STOCK_PRICE_SCALE} from '../js/stock-order.js';
test('VDK declines monotonically and reaches 1 only at JST midnight',()=>{
 const begin=VDK_CRASH_START,base=97,step=60_000;
 let previous=base;
 for(let now=begin;now<VDK_IPO_AT;now+=step){
  const price=vdkEventPrice(base,begin,now);
  assert.ok(price<=previous&&price>=2);
  previous=price;
 }
 assert.equal(vdkEventPrice(base,begin,VDK_IPO_AT),1);
 assert.equal(vdkEventPrice(base,begin,VDK_IPO_AT+3600000),1);
 assert.equal(vdkEventPrice(12,VDK_IPO_AT,VDK_IPO_AT),1);
});
test('VDKC is a separate midnight listing and retired VDK is blocked',()=>{
 assert.equal(stockIsListed('vdkc',VDK_IPO_AT-1),false);
 assert.equal(stockIsListed('vdkc',VDK_IPO_AT),true);
 assert.match(stockTradeRestriction('vdkc','buy',VDK_IPO_AT-1),/新規上場/);
 assert.match(stockTradeRestriction('vdk','buy',VDK_CRASH_START),/買付停止/);
 assert.equal(stockTradeRestriction('vdk','sell',VDK_IPO_AT-1),null);
 assert.match(stockTradeRestriction('vdk','sell',VDK_IPO_AT),/上場廃止/);
 assert.equal(stockTradeRestriction('vdkc','buy',VDK_IPO_AT),null);
});
test('1 KP selling permitted for legacy share, not regular stocks',()=>{
 const args={priceUnits:3*STOCK_PRICE_SCALE,initialPrice:100,side:'sell',quantity:1};
 assert.doesNotThrow(()=>stockOrderQuote({...args,minPrice:1}));
 assert.throws(()=>stockOrderQuote(args));
});
