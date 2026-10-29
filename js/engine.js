import { createProgress, hydrateProgress } from './progression.js?v=web-3dc5f314a73b3f83';
import { createRacing, hydrateRacing } from './racing.js?v=web-3dc5f314a73b3f83';
import { createCasino, hydrateCasino } from './casino.js?v=web-3dc5f314a73b3f83';
import { createMoreCasino, hydrateMoreCasino } from './casino-more.js?v=web-3dc5f314a73b3f83';
/** KESO EXCHANGE - local prototype engine (NOT authoritative for real multiplayer). */
const SCHEMA_VERSION = 1;
const MARKET = [
  { id: 'keso', ticker: 'KESO', name: 'KESOホールディングス', category: '総合', initialPrice: 1200, volatility: 0.036, drift: 0.002, icon: '◆' },
  { id: 'riso', ticker: 'RISO', name: 'リソ寿司', category: '飲食', initialPrice: 780, volatility: 0.054, drift: 0.001, icon: '寿' },
  { id: 'yuya', ticker: 'YUYA', name: 'ゆーやエンタメ', category: '娯楽', initialPrice: 420, volatility: 0.082, drift: 0.002, icon: '★' },
  { id: 'yano', ticker: 'YANO', name: '矢野ファイナンス', category: '金融', initialPrice: 1860, volatility: 0.031, drift: 0.001, icon: '¥' },
  // 誰かがKPを失うたびに上がり、得るたびに下がる（他人の金で焼肉はその逆）。値動きは件数で決まり、金額は見ない。
  { id: 'msum', ticker: 'MSUM', name: 'メシウマ食堂', category: '人の不幸', initialPrice: 1000, volatility: 0.04, drift: 0, icon: '飯' },
  { id: 'tnkn', ticker: 'TNKN', name: '他人の金で焼肉', category: '人の幸運', initialPrice: 1000, volatility: 0.04, drift: 0, icon: '肉' },
  // 架空の会社（メンバーの名前から）。ときどき架空のニュースで大きく動く。
  { id: 'komi', ticker: 'KOMI', name: '小路グローバルモーターズ', category: '新興国', initialPrice: 1200, volatility: 0.07, drift: 0.002, icon: '✈' },
  { id: 'ishi', ticker: 'ISHI', name: '石原エレクトリック', category: '電機', initialPrice: 980, volatility: 0.04, drift: 0.001, icon: '⌘' },
  { id: 'vdk', ticker: 'VDK', name: 'VDKブラック商事', category: 'グレー', initialPrice: 100, volatility: 0.12, drift: 0, icon: '☠' },
  { id: 'godo', ticker: 'GODO', name: '神戸（ごうど）ふるさと公社', category: 'ふるさと納税', initialPrice: 1450, volatility: 0.04, drift: 0.001, icon: '印' },
  { id: 'ngya', ticker: 'NGYA', name: '名古屋ヘンテコ発明所', category: '謎の発明', initialPrice: 777, volatility: 0.08, drift: 0.001, icon: '？' },
  { id: 'koba', ticker: 'KOBA', name: '小林百貨店', category: '百貨店', initialPrice: 820, volatility: 0.03, drift: 0.001, icon: '百' },
];
const SHOP = [
  { id: 'gold', icon: '✦', name: 'ゴールド称号', detail: 'Activity内で黄金の称号を表示', price: 2200, tier: '装飾' },
  { id: 'fanfar', icon: '♫', name: '大当たりSE', detail: 'Activity内で購入記念SEを再生', price: 1100, tier: '演出' },
  { id: 'firework', icon: '✺', name: '黄金の祝砲', detail: 'Activity内にきらめく祝賀演出', price: 3500, tier: '演出' },
  { id: 'vc', icon: '⌘', name: '専用VC開設権', detail: '本番ではBotによる専用VC作成を申請', price: 6500, tier: 'Discord連携予定' },
  { id: 'color', icon: '◉', name: '金色ロール', detail: '本番ではBotによるロール付与を申請', price: 4800, tier: 'Discord連携予定' },
  { id: 'monument', icon: '♛', name: '殿堂入り', detail: '本番では記念メッセージを投稿', price: 16000, tier: 'Discord連携予定' },
];
function createInitialState(now = Date.now()) {
  return {
    version: SCHEMA_VERSION,
    ...createProgress(),
    ...createRacing(),
    ...createCasino(),
    ...createMoreCasino(),
    cash: 10000,
    holdings: Object.fromEntries(MARKET.map((stock) => [stock.id, 0])),
    prices: Object.fromEntries(MARKET.map((stock) => [stock.id, stock.initialPrice])),
    history: Object.fromEntries(MARKET.map((stock) => [stock.id, Array.from({ length: 13 }, (_, i) => Math.round(stock.initialPrice * (0.96 + (i / 12) * .04)))])),
    owned: [], trades: [], spins: [], salaryClaims: 0, lastSalaryAt: 0,
    ticks: 0, lastMarketAt: now, seed: 7331,
  };
}
const validInt = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
function hydrateState(raw, now = Date.now()) {
  const state = createInitialState(now);
  if (!raw || raw.version !== SCHEMA_VERSION || !validInt(raw.cash)) return state;
  // A stock listed after the save simply starts at its listing price with no shares; a broken value still resets.
  const listed = (value, min) => value === undefined || validInt(value, min);
  if (MARKET.some(({id}) => !listed(raw.prices?.[id], 1) || !listed(raw.holdings?.[id], 0))) return state;
  state.cash = raw.cash;
  for (const {id} of MARKET) {
    state.prices[id] = raw.prices?.[id] ?? state.prices[id];
    state.holdings[id] = raw.holdings?.[id] ?? 0;
    const history = Array.isArray(raw.history?.[id]) ? raw.history[id].filter(v => validInt(v, 1)).slice(-25) : [];
    if (history.at(-1) !== state.prices[id]) history.push(state.prices[id]);
    state.history[id] = history.length ? history : [state.prices[id]];
  }
  if (!Number.isSafeInteger(assets(state))) return createInitialState(now);
  state.owned = [...new Set(Array.isArray(raw.owned) ? raw.owned.filter(id => SHOP.some(item => item.id === id)) : [])];
  state.trades = (Array.isArray(raw.trades) ? raw.trades : []).filter(t => t && MARKET.some(s => s.id === t.symbol) && ['buy','sell'].includes(t.side) && validInt(t.quantity, 1) && validInt(t.price, 1) && validInt(t.fee) && validInt(t.time)).slice(0, 50).map(t => ({side:t.side, symbol:t.symbol, quantity:t.quantity, price:t.price, fee:t.fee, time:t.time}));
  state.spins = (Array.isArray(raw.spins) ? raw.spins : []).filter(t => t && (validNumberSpin(t)||(['red','black','even','odd','number','low','high','dozen1','dozen2','dozen3','column1','column2','column3'].includes(t.type) && validInt(t.choice) && t.choice <= 36 && validInt(t.outcome) && t.outcome <= 36 && validInt(t.amount, 100) && t.amount <= 20000 && validInt(t.payout) && t.payout === roulettePayout(t.type,t.choice,t.outcome,t.amount) && validInt(t.time)))).slice(0, 30).map(t => ({type:t.type, choice:t.choice, outcome:t.outcome, amount:t.amount, payout:t.payout, time:t.time,...(t.type==='numbers'?{bets:validateNumberBets(t.bets).bets}:{})}));
  for (const key of ['salaryClaims','ticks','seed']) if (validInt(raw[key])) state[key] = raw[key];
  for (const key of ['lastSalaryAt','lastMarketAt']) if (validInt(raw[key]) && raw[key] <= now) state[key] = raw[key];
  Object.assign(state,hydrateProgress(raw),hydrateRacing(raw),hydrateCasino(raw),hydrateMoreCasino(raw));
  return state;
}
function checkedAdd(value, increment) {
  const result = value + increment;
  if (!validInt(result)) throw new Error('金額または株数が上限を超えています');
  return result;
}
function checkedCash(state, value) {
  if (!validInt(value) || !validInt(value + portfolioValue(state))) throw new Error('純資産が上限を超えています');
  return value;
}
function portfolioValue(state) { return MARKET.reduce((sum,s) => sum + state.holdings[s.id]*state.prices[s.id],0); }
function assets(state) { return state.cash + portfolioValue(state); }
function nextRandom(state) { state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0; return state.seed / 4294967296; }
function advanceMarket(state, now = Date.now()) {
  const elapsed = Math.max(0, Math.floor((now - state.lastMarketAt)/60000));
  const steps = Math.min(elapsed, 30); // Demo never performs unbounded offline work.
  if (!steps) return 0;
  for (const s of MARKET) { state.prices[s.id] ??= s.initialPrice; state.history[s.id] ??= [state.prices[s.id]]; state.holdings[s.id] ??= 0; }
  for (let i=0;i<steps;i++) for(const s of MARKET) {
    const direction = (nextRandom(state)*2-1)*s.volatility + s.drift;
    const newPrice = Math.max(20, Math.round(state.prices[s.id]*(1+direction)));
    state.prices[s.id] = newPrice;
    state.history[s.id].push(newPrice);
    state.history[s.id] = state.history[s.id].slice(-26);
  }
  state.ticks += steps;
  state.lastMarketAt = elapsed > 30 ? now : state.lastMarketAt + steps * 60000;
  return steps;
}
function trade(state, symbol, side, quantity, now = Date.now()) {
  const stock= MARKET.find(s=>s.id===symbol);
  if(!stock) throw new Error('存在しない銘柄だ');
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000) throw new Error('株数は1以上の整数で指定');
  if(side!=='buy'&&side!=='sell') throw new Error('無効な取引だ');
  const gross=state.prices[symbol]*quantity;
  if(!Number.isSafeInteger(gross)) throw new Error('取引額が大きすぎる');
  const fee=Math.ceil(gross/100);
  if(side==='buy') {
    if(state.cash < gross+fee) throw new Error('保有KPが不足している');
    const holdings = checkedAdd(state.holdings[symbol], quantity);
    state.cash -= gross+fee;state.holdings[symbol]=holdings;
  }else{
    if(state.holdings[symbol]<quantity) throw new Error('保有株数が不足している');
    if(gross-fee<0) throw new Error('取引できない');
    state.cash = checkedAdd(state.cash, gross-fee);state.holdings[symbol]-=quantity;
  }
  state.trades.unshift({id:`${now}-${state.trades.length}`,side,symbol,quantity,price:state.prices[symbol],fee,time:now});
  state.trades=state.trades.slice(0,50);
  return {gross,fee};
}
function roulettePayout(type,choice,number,bet) {
  if(!Number.isInteger(number)||number<0||number>36) throw new Error('出目が不正だ');
  const redNumbers=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  if(type==='red') return redNumbers.has(number)? bet*2 : 0;
  if(type==='black') return number!==0&&!redNumbers.has(number)?bet*2:0;
  if(type==='even') return number!==0&&number%2===0?bet*2:0;
  if(type==='odd') return number%2===1?bet*2:0;
  if(type==='number')return number===choice?bet*36:0;
  if(type==='low')return number>=1&&number<=18?bet*2:0;
  if(type==='high')return number>=19&&number<=36?bet*2:0;
  if(/^dozen[123]$/.test(type))return number>0&&Math.ceil(number/12)===Number(type.at(-1))?bet*3:0;
  if(/^column[123]$/.test(type))return number>0&&(number-1)%3+1===Number(type.at(-1))?bet*3:0;
  throw new Error('無効な賭け方だ');
}
function spin(state, type, amount, choice=0, outcome, now=Date.now()) {
  if(!Number.isSafeInteger(amount)||amount<100||amount>20000) throw new Error('賭け額は100〜20,000 KP');
  if(state.cash<amount)throw new Error('所持KPが不足している');
  if(type==='number'&&(!Number.isInteger(choice)||choice<0||choice>36))throw new Error('数字は0〜36だ');
  if(!['red','black','even','odd','number','low','high','dozen1','dozen2','dozen3','column1','column2','column3'].includes(type))throw new Error('無効な賭け方だ');
  // Demo: browser crypto must supply outcome; engine never uses predictable PRNG for casino.
  if(!Number.isInteger(outcome)||outcome<0||outcome>36)throw new Error('抽選結果が必要だ');
  const payout=roulettePayout(type,choice,outcome,amount);
  state.cash = checkedCash(state, checkedAdd(state.cash-amount, payout));
  const record={type,choice,outcome,amount,payout,time:now};
  state.spins.unshift(record); state.spins=state.spins.slice(0,30);
  return record;
}
export function validateNumberBets(bets){
 if(!Array.isArray(bets)||bets.length<1||bets.length>37)throw Error('数字を1つ以上選んでください');
 const seen=new Set();let total=0;
 const clean=bets.map(b=>{
  if(!b||!Number.isInteger(b.number)||b.number<0||b.number>36||seen.has(b.number))throw Error('数字は0〜36、重複なしで指定してください');
  if(!Number.isSafeInteger(b.amount)||b.amount<100||b.amount>20000)throw Error('数字ごとの掛け金は100〜20,000 KP');
  seen.add(b.number);total+=b.amount;return {number:b.number,amount:b.amount};
 });
 if(total>20000)throw Error('1回の掛け金合計は20,000 KPまで');
 return {bets:clean,total};
}
export function spinNumbers(state,bets,outcome,now=Date.now()){
 const checked=validateNumberBets(bets);
 if(!Number.isInteger(outcome)||outcome<0||outcome>36)throw Error('抽選結果が必要だ');
 if(state.cash<checked.total)throw Error('所持KPが不足している');
 const payout=(checked.bets.find(b=>b.number===outcome)?.amount??0)*36;
 const cash=checkedCash(state,checkedAdd(state.cash-checked.total,payout));
 const record={type:'numbers',choice:0,bets:checked.bets,amount:checked.total,outcome,payout,time:now};
 state.cash=cash;state.spins.unshift(record);state.spins=state.spins.slice(0,30);return record;
}
function validNumberSpin(t){try{const c=validateNumberBets(t.bets);return t.type==='numbers'&&Number.isInteger(t.outcome)&&t.outcome>=0&&t.outcome<=36&&t.amount===c.total&&t.payout===(c.bets.find(b=>b.number===t.outcome)?.amount??0)*36&&Number.isSafeInteger(t.time)&&t.time>=0;}catch{return false;}}
function buyReward(state, itemId) {
  const item=SHOP.find(s=>s.id===itemId);
  if(!item)throw new Error('存在しない商品だ');
  if(state.owned.includes(itemId))throw new Error('購入済みだ');
  if(state.cash<item.price)throw new Error('所持KPが不足している');
  state.cash-=item.price;state.owned.push(itemId);
  return item;
}
function grantDemoSalary(state, now=Date.now()) {
  if(now - state.lastSalaryAt < 30000)throw new Error('デモ給与は30秒ごとに受け取れる');
  const cash=checkedCash(state,checkedAdd(state.cash,600));
  const claims=checkedAdd(state.salaryClaims,1);
  state.cash=cash;state.lastSalaryAt=now;state.salaryClaims=claims;
  return 600;
}
function cryptoRouletteNumber() {
  if(!globalThis.crypto?.getRandomValues) throw new Error('この環境では暗号学的乱数を利用できない');
  const v=new Uint32Array(1), max=Math.floor(4294967296/37)*37;
  do { globalThis.crypto.getRandomValues(v); } while(v[0]>=max);
  return v[0]%37;
}



export { SCHEMA_VERSION, MARKET, SHOP, createInitialState, hydrateState, portfolioValue, assets, advanceMarket, trade, roulettePayout, spin, buyReward, grantDemoSalary, cryptoRouletteNumber };
