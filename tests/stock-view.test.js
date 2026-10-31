import test from 'node:test';
import assert from 'node:assert/strict';
import {stockPanel,stockPrice,stockCandles,privateStockOperator} from '../js/stock-view.js';
import {directivesView} from '../js/progression-views.js';
import {svgCandles} from '../js/charts.js';
import {createInitialState} from '../js/engine.js';
test('stock panel shows real dividends and holding conditions; source labels are escaped',()=>{
 const state={stockBenefits:{percent:5,eligibleValue:60000},stockMarket:{at:Date.now(),news:[{symbol:'keso',label:'<img src=x onerror=alert(1)>',bps:40,at:Date.now()}],dividends:[{day:'2026-10-29',amount:500}]}};
 const html=stockPanel(state);assert.match(html,/共通相場/);assert.match(html,/上限500 KP/);assert.match(html,/24時間/);assert.match(html,/5%割引/);assert.match(html,/\+500 KP/);assert.doesNotMatch(html,/<img/);
 assert.match(stockPanel({}),/デモ相場/);
});
test('stock benefit prices are shown on directives without disabling a now-affordable purchase',()=>{
 const state={...createInitialState(),cash:7700,serverWallet:true,stockBenefits:{percent:5},members:[],selfUserId:'fixture'};
 const html=directivesView(state,{},'');assert.match(html,/7,600 KP/);assert.match(html,/株主優待/);assert.doesNotMatch(html,/data-action="issue-directive" disabled/);
 assert.equal(stockPrice(2000000,{percent:5}),1998000);assert.equal(stockPrice(8000),8000);
});
test('the common-market chart uses stored quote timestamps and prices, without invented prices or volume',()=>{
 const candles=stockCandles({ticks:[{at:0,prices:{keso:1200}},{at:300000,prices:{keso:1210}}]},'keso');
 assert.equal(candles[0].close,1200);assert.equal(candles[1].open,1200);assert.equal(candles[1].close,1210);assert.equal(candles[1].high,1210);assert.equal(candles[1].vol,0);
});

test('the chart renders the first one or two real quotes without reading nonexistent demo dates',()=>{for(const size of [1,2]){const data=stockCandles({ticks:Array.from({length:size},(_,i)=>({at:i*300000,prices:{keso:1200+i}}))},'keso');const svg=svgCandles(data);assert.doesNotMatch(svg,/undefined|NaN/);}});

test('owner stock operator offers fixed symbols, direction and magnitude without unsafe HTML',()=>{
 const html=privateStockOperator([{id:'keso',ticker:'KESO',name:'KESOホールディングス'},{id:'evil',ticker:'<script>',name:'<img src=x>'}]);
 assert.match(html,/裏モード：株価オペレーター/);
 assert.match(html,/data-action="stock-shock"/);
 assert.match(html,/option value="10"/);
 assert.match(html,/option value="25" selected/);
 assert.match(html,/option value="50"/);
 assert.match(html,/value="down"/);
 assert.doesNotMatch(html,/<script>|<img/);
});

test('stock operator retains selected controls and presents escaped, accessible confirmation',()=>{
 const stocks=[{id:'keso',ticker:'KESO',name:'KESOホールディングス'},{id:'evil',ticker:'EVIL',name:'悪意の銘柄'}];
 const html=privateStockOperator(stocks,{selection:{symbol:'evil',direction:'down',strength:50},notice:{kind:'success',text:'✅ 株価操作を受け付けました <script>alert(1)</script>'}});
 assert.match(html,/value="evil" selected/);
 assert.match(html,/value="down" selected/);
 assert.match(html,/value="50" selected/);
 assert.match(html,/role="status" aria-live="polite"/);
 assert.match(html,/class="stock-shock-notice success"/);
 assert.match(html,/株価操作を受け付けました/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(privateStockOperator(stocks),/id="stock-shock-notice"[^>]* hidden>/);
});
