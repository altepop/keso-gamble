import test from 'node:test';
import assert from 'node:assert/strict';
import {stockOrderQuote as quote,STOCK_PRICE_SCALE as S} from '../js/stock-order.js';
import {MARKET} from '../js/engine.js';
test('every listed stock responds to buying and selling, with greater movement for larger orders',()=>{
 for(const stock of MARKET){
  const input={priceUnits:stock.initialPrice*S,initialPrice:stock.initialPrice,quantity:1};
  const buy=quote({...input,side:'buy'}),sell=quote({...input,side:'sell'}),large=quote({...input,side:'buy',quantity:20});
  assert(buy.priceAfter>stock.initialPrice);assert(sell.priceAfter<stock.initialPrice);assert(large.afterUnits>buy.afterUnits);assert(large.gross>buy.gross*20);
 }
});
test('same-price immediate round trips and split orders cannot manufacture KP',()=>{
 for(const stock of MARKET)for(const price of [20,21,stock.initialPrice,10000000])for(const quantity of [1,2,99,10000,100000]){
  const input={priceUnits:price*S,initialPrice:stock.initialPrice,quantity};
  const buy=quote({...input,side:'buy'}),sell=quote({...input,priceUnits:buy.afterUnits,side:'sell'});assert(sell.total<buy.total);
  const first=quote({...input,side:'sell'}),back=quote({...input,priceUnits:first.afterUnits,side:'buy'});assert(back.total>first.total);
  const a=quote({...input,side:'buy',quantity:1}),b=quote({...input,side:'buy',quantity:quantity-1||1,priceUnits:a.afterUnits});
  if(quantity>1)assert(a.gross+b.gross>=buy.gross);
 }
});
test('the quote uses the whole price path and rounds KP against free buy-back profits',()=>{
 const buy=quote({priceUnits:1200*S,initialPrice:1200,side:'buy',quantity:10});assert.equal(buy.gross,12072);assert.equal(buy.fee,121);assert.equal(buy.total,12193);assert.equal(buy.afterUnits,1214.4*S);
 const sell=quote({priceUnits:buy.afterUnits,initialPrice:1200,side:'sell',quantity:10});assert.equal(sell.gross,12072);assert.equal(sell.total,11951);assert.equal(sell.afterUnits,1200*S);
 for(const row of [{priceUnits:NaN},{quantity:0},{quantity:1.5},{quantity:100001},{side:'other'},{initialPrice:0},{priceUnits:20*S-1}])assert.throws(()=>quote({priceUnits:1200*S,initialPrice:1200,side:'buy',quantity:1,...row}));
});
