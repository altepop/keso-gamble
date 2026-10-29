import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,hydrateState,trade,spin,roulettePayout,advanceMarket,grantDemoSalary,buyReward} from '../js/engine.js';
import {loadState,saveState,KEY,LEGACY_KEY} from '../js/storage.js';
test('buy/sell account for fees and rejected orders do not mutate state',()=>{
 const s=createInitialState();trade(s,'keso','buy',2);assert.equal(s.cash,7576);assert.equal(s.holdings.keso,2);
 trade(s,'keso','sell',1);assert.equal(s.cash,8764);
 const before=structuredClone(s);for(const q of [0,-1,1.2,100001])assert.throws(()=>trade(s,'keso','buy',q));
 assert.throws(()=>trade(s,'keso','sell',2));assert.deepEqual(s,before);
});
test('zero loses outside bets and pays straight zero',()=>{
 for(const type of ['red','black','even','odd'])assert.equal(roulettePayout(type,0,0,100),0);
 assert.equal(roulettePayout('number',0,0,100),3600);
 const s=createInitialState();spin(s,'number',100,0,0);assert.equal(s.cash,13500);
});
test('invalid spins preserve wallet',()=>{
 const s=createInitialState(),before=structuredClone(s);
 for(const args of [['red',99,0,1],['number',100,37,1],['red',100,0,37],['invalid',100,0,1]])assert.throws(()=>spin(s,...args));
 assert.deepEqual(s,before);
});
test('salary cooldown and duplicate rewards do not debit twice',()=>{
 const s=createInitialState(0);grantDemoSalary(s,30000);assert.throws(()=>grantDemoSalary(s,59999));grantDemoSalary(s,60000);
 buyReward(s,'gold');const before=structuredClone(s);assert.throws(()=>buyReward(s,'gold'));assert.deepEqual(s,before);
});
test('hydration repairs malformed records without retaining injected fields',()=>{
 const s=createInitialState(100000);s.trades=[null,{symbol:'unknown'}, {symbol:'keso',side:'<img>',quantity:1,price:1}];s.spins=[null,{outcome:99}];
 s.owned=['gold','gold','unknown'];s.history.keso=[NaN,-1,'x'];s.lastMarketAt='invalid';s.seed=-1;s.extra='injected';
 const restored=hydrateState(s,100000);assert.deepEqual(restored.trades,[]);assert.deepEqual(restored.spins,[]);assert.deepEqual(restored.owned,['gold']);assert.deepEqual(restored.history.keso,[1200]);assert.equal(restored.lastMarketAt,100000);assert.equal(restored.seed,7331);assert.equal(restored.extra,undefined);
});
test('bad balances and unsafe portfolio reset safely',()=>{
 for(const cash of [-1,Infinity,Number.MAX_SAFE_INTEGER+1]) assert.equal(hydrateState({...createInitialState(),cash}).cash,10000);
 const s=createInitialState();s.holdings.keso=Number.MAX_SAFE_INTEGER;assert.equal(hydrateState(s).holdings.keso,0);
});
test('market preserves fractional minutes and bounds offline work',()=>{
 const s=createInitialState(0);assert.equal(advanceMarket(s,90000),1);assert.equal(s.lastMarketAt,60000);assert.equal(advanceMarket(s,120000),1);assert.equal(advanceMarket(s,100000000),30);assert.equal(s.history.keso.length,26);
});
test('overflow rejection is atomic',()=>{
 const s=createInitialState();s.cash=Number.MAX_SAFE_INTEGER;const before=structuredClone(s);assert.throws(()=>grantDemoSalary(s));assert.throws(()=>spin(s,'number',100,0,0));assert.deepEqual(s,before);
});
test('storage fallback and failures are contained',()=>{
 const data=new Map([[KEY,'{broken'],[LEGACY_KEY,JSON.stringify(createInitialState())]]);const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 assert.equal(loadState(storage).cash,10000);assert.equal(saveState(createInitialState(),storage),true);assert.equal(JSON.parse(data.get(KEY)).version,1);
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('full')}};assert.equal(loadState(blocked),null);assert.equal(saveState({},blocked),false);
});
test('salary and payout also check total assets before changing wallet',()=>{
 const s=createInitialState();s.cash=Number.MAX_SAFE_INTEGER-1200;s.holdings.keso=1;const before=structuredClone(s);
 assert.throws(()=>grantDemoSalary(s));assert.throws(()=>spin(s,'red',100,0,1));assert.deepEqual(s,before);
});
test('European table pays exactly the covered outcomes, zero only wins straight up',()=>{
 for(const [type,count,mult] of [['low',18,2],['high',18,2],['dozen1',12,3],['dozen2',12,3],['dozen3',12,3],['column1',12,3],['column2',12,3],['column3',12,3]]){
  const pays=Array.from({length:37},(_,n)=>roulettePayout(type,0,n,100));
  assert.equal(pays[0],0);assert.equal(pays.filter(Boolean).length,count);assert.ok(pays.every(n=>n===0||n===100*mult));
  const s=createInitialState();spin(s,type,100,0,1);assert.equal(hydrateState(s).spins[0].type,type);
 }
 for(let n=0;n<37;n++)for(let outcome=0;outcome<37;outcome++)assert.equal(roulettePayout('number',n,outcome,100),n===outcome?3600:0);
});
test('a save from before new stocks were listed keeps its cash and shares; new stocks start at the listing price', () => {
  const now = Date.now(), saved = createInitialState(now);
  saved.cash = 4321; saved.holdings.keso = 7;
  for (const id of ['mitu','okbr','nani','tako','neko','kgne']) { delete saved.prices[id]; delete saved.holdings[id]; delete saved.history[id]; }
  const state = hydrateState(JSON.parse(JSON.stringify(saved)), now);
  assert.equal(state.cash, 4321); assert.equal(state.holdings.keso, 7);
  assert.equal(state.prices.nani, 300); assert.equal(state.holdings.nani, 0);
  const broken = JSON.parse(JSON.stringify(saved)); broken.holdings.nani = -1;
  assert.equal(hydrateState(broken, now).cash, 10000, 'a broken value still resets');
  const legacy = JSON.parse(JSON.stringify(saved)); legacy.lastMarketAt = now - 5 * 60000;
  assert.equal(advanceMarket(legacy, now), 5); assert.equal(legacy.history.tako.length, 6, 'a stock missing from an old state is priced, not crashed');
});
